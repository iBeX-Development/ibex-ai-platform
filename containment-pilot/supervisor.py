"""Reviewed-source candidate only; never imported/run during preparation.
Docker control plane is trusted and outside the workload. No candidate code loaded.
"""
import hashlib
import json
import os
from pathlib import Path
import selectors
import signal
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parent
MAX_RAW = 4 * 1024 * 1024
MAX_EVIDENCE = 16 * 1024 * 1024
CANCELLED = False

def cancel(_sig, _frame):
    global CANCELLED
    CANCELLED = True

def bounded(args, seconds=10, cap=1048576, cleaning=False):
    """No shell; consume both pipes. Never forward subprocess output to Actions."""
    p = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, close_fds=True, start_new_session=True)
    sel = selectors.DefaultSelector()
    for pipe in (p.stdout, p.stderr):
        os.set_blocking(pipe.fileno(), False)
        sel.register(pipe, selectors.EVENT_READ)
    data = bytearray(); until = time.monotonic() + seconds
    try:
        while sel.get_map():
            if time.monotonic() >= until or (CANCELLED and not cleaning):
                raise RuntimeError('control_deadline_or_cancel')
            for key, _ in sel.select(min(.1, max(0, until-time.monotonic()))):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if not chunk: sel.unregister(key.fileobj); continue
                if len(data) + len(chunk) > cap: raise RuntimeError('control_output_cap')
                data.extend(chunk)
        code = p.wait(timeout=max(.01, until-time.monotonic()))
        if code: raise RuntimeError('control_exit_nonzero')
        return bytes(data)
    finally:
        if p.poll() is None:
            p.kill()
            p.wait(timeout=2)
        sel.close(); p.stdout.close(); p.stderr.close()

def inspect(name, seconds=10, cleaning=False):
    return json.loads(bounded(['docker', 'inspect', name], seconds=seconds, cleaning=cleaning))[0]

def kv(path):
    return dict(line.split() for line in path.read_text().splitlines())

def category(error):
    # Only local fixed RuntimeError codes; never emit subprocess stderr or paths.
    code=str(error) if type(error) is RuntimeError else ''
    return code if len(code)<=64 and code.replace('_','').isalnum() else type(error).__name__

def receipt(path, data):
    raw = (json.dumps(data, sort_keys=True) + '\n').encode()
    if len(raw) > MAX_EVIDENCE: raise RuntimeError('evidence_cap')
    with path.open('xb') as f:
        f.write(raw); f.flush(); os.fsync(f.fileno())

def main():
    # Local packet remains disabled. Activation is an explicit reviewed bytes change.
    admission = json.loads((ROOT / 'admission.json').read_text())
    if admission.get('enabled') is not True: raise RuntimeError('NOT_ACTIVATED')
    if os.environ.get('GITHUB_EVENT_NAME') != 'push': raise RuntimeError('event_binding')
    if os.environ.get('GITHUB_REF') != admission['ref']: raise RuntimeError('ref_binding')
    if os.environ.get('GITHUB_REPOSITORY') != admission['repository']: raise RuntimeError('repo_binding')
    if os.environ.get('GITHUB_RUN_ATTEMPT') != '1': raise RuntimeError('rerun_refused')
    event_path=Path(os.environ['GITHUB_EVENT_PATH'])
    if event_path.stat().st_size>1048576:raise RuntimeError('event_size')
    push_event=json.loads(event_path.read_text())
    if push_event.get('created') is not True or push_event.get('deleted') is not False or push_event.get('before')!='0'*40:
        raise RuntimeError('first_publication_only')
    # Commit comes from the trusted runner event. Its tree must contain the exact
    # reviewed payload pins; avoid an impossible self-referential commit hash.
    commit=os.environ.get('GITHUB_SHA','')
    if len(commit)!=40 or any(c not in '0123456789abcdef' for c in commit): raise RuntimeError('commit_binding')
    if admission['baseCommit']!='529951f9818c301aae67d94e980deafe7495391f': raise RuntimeError('base_binding')
    if bounded(['git','rev-parse','HEAD']).decode().strip()!=commit:raise RuntimeError('checkout_head_binding')
    parents=bounded(['git','rev-list','--parents','-n','1',commit]).decode().strip().split()
    if parents!=[commit,admission['baseCommit']]:raise RuntimeError('single_commit_base_required')
    payload=['supervisor.py','cleanup.py','canary.cjs','container.json','seccomp.json','mount-policy.json','empty.txt','admission.json']
    expected_paths=sorted(['containment-pilot/'+n for n in payload]+['.github/workflows/contained-pilot.yml'])
    changes=bounded(['git','diff-tree','--no-commit-id','--name-status','-r',admission['baseCommit'],commit]).decode().splitlines()
    if sorted(changes)!=['A\t'+n for n in expected_paths]:raise RuntimeError('committed_diff_allowlist')
    checkout=Path(bounded(['git','rev-parse','--show-toplevel']).decode().strip())
    if ROOT!=checkout/'containment-pilot':raise RuntimeError('payload_root_binding')
    for path in expected_paths:
        entry=bounded(['git','ls-tree',commit,'--',path]).decode().strip()
        if not entry.startswith('100644 blob ') or entry.split('\t')[-1]!=path:raise RuntimeError('committed_mode')
        blob=bounded(['git','cat-file','blob',commit+':'+path])
        if (checkout/path).is_symlink() or (checkout/path).read_bytes()!=blob:raise RuntimeError('working_committed_bytes')
    if sorted(admission['files'])!=sorted(n for n in payload if n!='admission.json'):raise RuntimeError('pin_allowlist')
    for name, digest in admission['files'].items():
        if Path(name).name != name: raise RuntimeError('pin_path')
        if hashlib.sha256((ROOT/name).read_bytes()).hexdigest() != digest: raise RuntimeError('pin_drift')
    if not admission['files']: raise RuntimeError('empty_pins')
    image = admission['image']
    if '@sha256:' not in image: raise RuntimeError('image_unpinned')
    info = json.loads(bounded(['docker', 'image', 'inspect', image]))[0]
    if info['Os'] != 'linux' or info['Architecture'] != 'amd64': raise RuntimeError('platform')
    run_id=os.environ.get('GITHUB_RUN_ID',''); attempt=os.environ.get('GITHUB_RUN_ATTEMPT','')
    if not run_id.isdigit() or attempt!='1':raise RuntimeError('attempt_identity')
    output = Path(os.environ['RUNNER_TEMP']) / ('ibex-pilot-' + run_id + '-' + attempt)
    output.mkdir(mode=0o700)
    token = uuid.uuid4().hex; name = 'ibex-pilot-' + token
    receipt(output/'claim.json', {'name':name, 'token':token, 'source_commit':commit,'run_id':run_id,'attempt':attempt})
    start = time.monotonic(); deadline = start + 600
    result = {'workload':'not_started','cleanup':'unconfirmed','passed':False,'events':[]}
    attach = None; events_handle = None; group = None; created = False; raw = bytearray()
    cid=None; resource_handles={}; result['resource_violation']=False
    def observe_resources():
        if set(resource_handles)!={'memory.events','pids.events'}:raise RuntimeError('resource_handles_missing')
        observed={}
        for key,handle in resource_handles.items():
            handle.seek(0);observed[key]=dict(line.split() for line in handle.read().splitlines())
        result['resource_observation']=observed
        mem=observed['memory.events'];pids=observed['pids.events']
        if any(int(mem[k])!=0 for k in ['oom','oom_kill','max']) or int(pids['max'])!=0:
            result['resource_violation']=True
        if result['resource_violation']:raise RuntimeError('resource_violation_latched')
    def event(kind):
        if len(result['events']) >= 128: raise RuntimeError('event_cap')
        result['events'].append({'kind':kind,'elapsed_ms':int((time.monotonic()-start)*1000)})
    try:
        cmd = ['docker','create','--name',name,'--label','ibex.pilot='+token,
               '--pull=never','--platform=linux/amd64','--read-only','--user=1000:1000',
               '--network=none','--ipc=private','--cap-drop=ALL',
               '--security-opt=no-new-privileges','--security-opt=seccomp='+str(ROOT/'seccomp.json'),
               '--memory=4g','--memory-swap=4g','--pids-limit=128','--cpus=2',
               '--ulimit=nofile=256:256','--ulimit=core=0:0','--log-driver=none',
               '--tmpfs=/scratch:rw,noexec,nosuid,nodev,size=234881024,nr_inodes=57344,uid=1000,gid=1000,mode=0700',
               '--tmpfs=/dev/shm:rw,noexec,nosuid,nodev,size=33554432,nr_inodes=8192,uid=1000,gid=1000,mode=0700',
               '--mount=type=bind,src='+str(ROOT)+',dst=/pilot,readonly',
               '--workdir=/scratch','--interactive','--entrypoint=/usr/bin/env',image,
               '-i','PATH=/usr/local/bin:/usr/bin:/bin','HOME=/scratch','TMPDIR=/scratch','LANG=C','TZ=UTC',
               '/usr/local/bin/node','/pilot/canary.cjs']
        # Override Docker-generated writable host files with inert read-only files.
        for dest in ['hosts','hostname','resolv.conf']:
            cmd[cmd.index('--workdir=/scratch'):cmd.index('--workdir=/scratch')] = [
                '--mount=type=bind,src='+str(ROOT/'empty.txt')+',dst=/etc/'+dest+',readonly']
        created = True  # A timed-out create is uncertain, so cleanup must still inspect this exact label.
        cid=bounded(cmd, seconds=min(20, max(.01,start+60-time.monotonic()))).decode().strip()
        if len(cid)!=64 or any(c not in '0123456789abcdef' for c in cid):raise RuntimeError('container_id')
        created_state=inspect(cid)
        if created_state['Id']!=cid or created_state['Config']['Labels'].get('ibex.pilot')!=token:raise RuntimeError('container_identity')
        receipt(output/'owned-container.json',{'container_id':cid,'token':token,'source_commit':commit,'run_id':run_id,'attempt':attempt})
        result['container_id']=cid
        event('created')
        attach = subprocess.Popen(['docker','start','--attach','--interactive',cid],
                                  stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                                  close_fds=True,start_new_session=True)
        while True:
            state = inspect(cid,seconds=max(.01,min(10,start+60-time.monotonic())))
            if state['Config']['Labels'].get('ibex.pilot') != token: raise RuntimeError('ownership')
            pid = state['State']['Pid']
            if pid: break
            if CANCELLED or time.monotonic() >= start+60: raise RuntimeError('startup_deadline')
            time.sleep(.05)
        membership = Path('/proc/'+str(pid)+'/cgroup').read_text().strip().splitlines()
        if len(membership)!=1 or not membership[0].startswith('0::/'): raise RuntimeError('cgroup_v2_required')
        group = Path('/sys/fs/cgroup'+membership[0][3:]).resolve()
        if not str(group).startswith('/sys/fs/cgroup/') or group == Path('/sys/fs/cgroup'): raise RuntimeError('cgroup_path')
        if (group/'memory.max').read_text().strip() != '4294967296': raise RuntimeError('memory_limit')
        if (group/'memory.swap.max').read_text().strip() != '0': raise RuntimeError('swap_limit')
        if (group/'pids.max').read_text().strip() != '128': raise RuntimeError('pid_limit')
        quota, period = (group/'cpu.max').read_text().split()
        if quota == 'max' or int(quota)>2*int(period): raise RuntimeError('cpu_limit')
        events_handle = (group/'cgroup.events').open()
        for key in ['memory.events','pids.events']:resource_handles[key]=(group/key).open()
        observe_resources()  # Initial nonzero includes startup violations, never used as a baseline.
        result['cgroup_identity']={'path':str(group),'device':group.stat().st_dev,'inode':group.stat().st_ino}
        host=state['HostConfig']
        if not host['ReadonlyRootfs'] or host['NetworkMode']!='none':raise RuntimeError('mount_or_network_mode')
        if state['Config']['User']!='1000:1000' or host['LogConfig']['Type']!='none':raise RuntimeError('user_or_logging')
        if any(m.get('RW',True) for m in state['Mounts'] if m['Type']=='bind'):raise RuntimeError('writable_bind')
        if any(m['Type'] not in ['bind','tmpfs'] for m in state['Mounts']):raise RuntimeError('unplanned_volume')
        if set(host.get('Tmpfs',{}))!={'/scratch','/dev/shm'}:raise RuntimeError('tmpfs_inventory')
        if any(m['Destination'] not in ['/scratch','/dev/shm'] for m in state['Mounts'] if m['Type']=='tmpfs'):raise RuntimeError('unplanned_tmpfs')
        if sorted(m['Destination'] for m in state['Mounts'] if m['Type']=='bind')!=['/etc/hostname','/etc/hosts','/etc/resolv.conf','/pilot']:raise RuntimeError('bind_inventory')
        result['effective_mounts']=[{'type':m['Type'],'destination':m['Destination'],'writable':m['RW']} for m in state['Mounts']]
        result['effective_network_mode']=host['NetworkMode']
        result['effective_security_options']=host['SecurityOpt']
        if time.monotonic() >= start+60 or CANCELLED: raise RuntimeError('startup_deadline')
        result['effective_limits']={'memory_max':(group/'memory.max').read_text().strip(),
            'memory_swap_max':(group/'memory.swap.max').read_text().strip(),
            'pids_max':(group/'pids.max').read_text().strip(),'cpu_max':(group/'cpu.max').read_text().strip()}
        event('limits_verified'); attach.stdin.write(b'GO\n'); attach.stdin.flush(); attach.stdin.close()
        sel = selectors.DefaultSelector()
        for pipe in [attach.stdout,attach.stderr]:
            os.set_blocking(pipe.fileno(),False); sel.register(pipe,selectors.EVENT_READ)
        result['workload']='running'
        try:
            while time.monotonic()<deadline and not CANCELLED:
                for key,_ in sel.select(.1):
                    chunk=os.read(key.fileobj.fileno(),65536)
                    if not chunk: sel.unregister(key.fileobj);continue
                    if len(raw)+len(chunk)>MAX_RAW: raise RuntimeError('raw_output_cap')
                    raw.extend(chunk)
                observe_resources()
                if raw == b'SYNTHETIC_OK\n':
                    # Host confirms descendant presence; then tests owned-tree termination.
                    processes=(group/'cgroup.procs').read_text().splitlines()
                    if len(set(processes)) != 2 or str(pid) not in processes: raise RuntimeError('descendant_membership')
                    result['observed_owned_processes']=[int(p) for p in processes]
                    result['workload']='canaries_passed_termination_required';event('canaries_passed');break
                if attach.poll() is not None: raise RuntimeError('early_exit')
            else: raise RuntimeError('work_deadline_or_cancel')
        finally: sel.close()
    except BaseException as error:
        result['workload_failure']=category(error)
        result['failure_stage']=result['events'][-1]['kind'] if result['events'] else 'creation_or_startup'
        result['workload']='failed'
    finally:
        # Cleanup has its own ten-second ceiling after the workload limit; no retry.
        until=time.monotonic()+10
        try:
            if not created or cid is None: raise RuntimeError('no_immutable_container_identity')
            state=inspect(cid,seconds=max(.01,until-time.monotonic()),cleaning=True)
            if state['Id']!=cid or state['Config']['Labels'].get('ibex.pilot')!=token: raise RuntimeError('ownership')
            if state['State']['Running']: bounded(['docker','kill',cid],seconds=max(.01,until-time.monotonic()),cleaning=True)
            if attach:
                sel=selectors.DefaultSelector()
                for pipe in [attach.stdout,attach.stderr]:
                    os.set_blocking(pipe.fileno(),False);sel.register(pipe,selectors.EVENT_READ)
                while sel.get_map() and time.monotonic()<until:
                    for key,_ in sel.select(.05):
                        chunk=os.read(key.fileobj.fileno(),65536)
                        if not chunk:sel.unregister(key.fileobj);continue
                        if len(raw)+len(chunk)>MAX_RAW:raise RuntimeError('raw_output_cap')
                        raw.extend(chunk)
                complete=not sel.get_map();sel.close()
                if not complete:raise RuntimeError('pipe_eof_unconfirmed')
                result['attach_exit']=attach.wait(timeout=max(.01,until-time.monotonic()))
            state=inspect(cid,seconds=max(.01,until-time.monotonic()),cleaning=True);result['container_exit']=state['State']['ExitCode']
            if state['State']['Running'] or state['State']['OOMKilled']: raise RuntimeError('container_not_clean')
            # A vanished cgroup without a final zero observation is NOT silently accepted.
            if events_handle is None:raise RuntimeError('no_tree_observation')
            events_handle.seek(0);observed=dict(line.split() for line in events_handle.read().splitlines())
            observe_resources()  # Required final sample; missing/dead handle means incomplete, not PASS.
            result['final_populated']=observed.get('populated')
            if observed.get('populated')!='0':raise RuntimeError('tree_empty_unconfirmed')
            bounded(['docker','rm',cid],seconds=max(.01,until-time.monotonic()),cleaning=True)
            if time.monotonic()>until:raise RuntimeError('cleanup_deadline')
            result['cleanup']='confirmed'
        except BaseException as error:result['cleanup_failure']=category(error)
        finally:
            if events_handle:events_handle.close()
            for handle in resource_handles.values():handle.close()
            if attach:
                if attach.poll() is None:
                    attach.kill()
                    try:attach.wait(timeout=1)
                    except subprocess.TimeoutExpired:result['attach_reap']='unconfirmed'
                for pipe in [attach.stdout,attach.stderr]:pipe.close()
            result['raw_bytes']=len(raw);result['raw_sha256']=hashlib.sha256(raw).hexdigest()
            result['passed']=result['workload']=='canaries_passed_termination_required' and result['cleanup']=='confirmed' and raw==b'SYNTHETIC_OK\n' and not CANCELLED and not result['resource_violation']
            with (output/'raw-output.bin').open('xb') as f:f.write(raw)
            receipt(output/'terminal.json',result)
    # Fixed trusted console text only; never print candidate bytes or exception messages.
    print('PILOT_RECEIPT '+json.dumps(result,sort_keys=True))
    return 0 if result['passed'] else 1

if __name__=='__main__':
    signal.signal(signal.SIGTERM,cancel);signal.signal(signal.SIGINT,cancel)
    try: exit_code=main()
    except BaseException:
        print('PILOT_REFUSED_OR_INCOMPLETE');exit_code=1
    sys.exit(exit_code)
