"""Reviewed-source candidate only; never imported/run during preparation.
Docker control plane is trusted and outside the workload. No candidate code loaded.
"""
import hashlib
import importlib.util
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
MAX_EVIDENCE = 65536
BUDGET = None
ASSURANCE = {'assuranceModel':'managed-runner-components-v1','policyReviewSHA256':'5f0b365406a585112c1b93c9283174b13f2ec20a062f7afa69d87aeb13ac96fe'}
DOCKER_ENV={'PATH':'/usr/bin:/bin','LANG':'C','LC_ALL':'C','HOME':'/nonexistent','DOCKER_API_VERSION':'1.48','DOCKER_HOST':'unix:///var/run/docker.sock'}
CANCELLED = False
OPERATIONS = frozenset(['admission_read', 'attach_poll', 'attach_start', 'cgroup_identity_stat', 'claim_directory_create', 'claim_write', 'cleanup_attach_wait', 'cleanup_final_inspect', 'cleanup_identity_inspect', 'cleanup_kill', 'cleanup_pipe_drain', 'cleanup_populated_read', 'cleanup_remove', 'container_create', 'created_identity_inspect', 'descendant_membership_read', 'entry', 'event_read', 'events_open', 'go_write', 'handle_close', 'host_config_validate', 'image_inspect', 'limits_final_read', 'limits_read', 'membership_read', 'owned_claim_write', 'payload_pin_read', 'pipe_setup', 'publication_binding', 'raw_receipt_write', 'resource_handles_open', 'resource_memory_read', 'resource_memory_seek', 'resource_pids_read', 'resource_pids_seek', 'startup_inspect', 'terminal_receipt_write', 'unknown', 'workload_pipe_read'])
ERROR_CODES = frozenset(['NOT_ACTIVATED', 'attempt_identity', 'base_binding', 'bind_inventory', 'cgroup_path', 'cgroup_v2_required', 'checkout_head_binding', 'cleanup_deadline', 'commit_binding', 'committed_diff_allowlist', 'committed_mode', 'container_id', 'container_identity', 'container_not_clean', 'control_deadline_or_cancel', 'control_exit_nonzero', 'control_output_cap', 'cpu_limit', 'descendant_membership', 'early_exit', 'empty_pins', 'event_binding', 'event_cap', 'event_size', 'evidence_cap', 'first_publication_only', 'image_unpinned', 'memory_limit', 'mount_or_network_mode', 'no_immutable_container_identity', 'no_tree_observation', 'ownership', 'payload_root_binding', 'pid_limit', 'pin_allowlist', 'pin_drift', 'pin_path', 'pipe_eof_unconfirmed', 'platform', 'raw_output_cap', 'ref_binding', 'repo_binding', 'rerun_refused', 'resource_handles_missing', 'resource_violation_latched', 'single_commit_base_required', 'startup_deadline', 'swap_limit', 'tmpfs_inventory', 'tree_empty_unconfirmed', 'unplanned_tmpfs', 'unplanned_volume', 'user_or_logging', 'work_deadline_or_cancel', 'working_committed_bytes', 'writable_bind'])
ERROR_CODES = ERROR_CODES | frozenset(['evidence_short_write','control_cleanup_incomplete','container_security_contract'])
CANARY_STAGES = frozenset(['ENTRY', 'IDENTITY', 'MOUNTS', 'DEVICES', 'READONLY', 'SCRATCH', 'NETWORK', 'DESCENDANT'])
OPERATIONS = OPERATIONS | frozenset(['final_events_close', 'final_memory_close', 'final_pids_close', 'final_attach_poll', 'final_attach_kill', 'final_attach_wait', 'final_stdin_close', 'final_stdout_close', 'final_stderr_close', 'final_child_observation', 'final_raw_open', 'final_raw_write', 'final_raw_flush', 'final_raw_sync', 'final_raw_close', 'final_terminal_encode', 'final_terminal_open', 'final_terminal_write', 'final_terminal_flush', 'final_terminal_sync', 'final_terminal_close', 'final_console_encode', 'final_console_write', 'final_console_flush', 'final_stderr_write', 'final_stderr_flush'])
OPERATIONS = OPERATIONS | frozenset(['parent_capability','parent_lifetime','parent_membership','parent_counter','parent_release'])
OPERATION = 'entry'
PHASE = 'preflight'

def mark(operation):
    global OPERATION
    OPERATION = operation if operation in OPERATIONS else 'unknown'

def detail(error):
    number = error.errno if isinstance(error, OSError) else None
    if type(number) is not int or not -4095 <= number <= 4095: number = None
    code = error.args[0] if type(error) is RuntimeError and len(error.args) == 1 else None
    if code not in ERROR_CODES: code = None
    kind = ('os' if isinstance(error, OSError) else 'timeout' if isinstance(error, subprocess.TimeoutExpired)
            else 'runtime' if type(error) is RuntimeError else 'other')
    return {'phase': PHASE, 'operation': OPERATION, 'kind': kind, 'errno': number, 'code': code, 'controlCleanupErrors':getattr(error,'control_cleanup_errors',[])[:5]}

def child_diagnostic(raw):
    # Optional failure-only protocol. Never grants success, never emits arbitrary bytes.
    if len(raw) > 128: return {'status': 'unavailable_or_nonprotocol'}
    try: fields = bytes(raw).decode('ascii').split()
    except UnicodeDecodeError: return {'status': 'unavailable_or_nonprotocol'}
    if len(fields) != 4 or fields[0] != 'CANARY_FAIL' or fields[1] not in CANARY_STAGES or fields[3] not in ['ASSERT','OS','OTHER']:
        return {'status': 'unavailable_or_nonprotocol'}
    try: number = int(fields[2])
    except ValueError: return {'status': 'unavailable_or_nonprotocol'}
    if not -4095 <= number <= 4095 or bytes(raw) != ('CANARY_FAIL '+fields[1]+' '+str(number)+' '+fields[3]+'\n').encode('ascii'):
        return {'status': 'unavailable_or_nonprotocol'}
    return {'status':'reported_failure','stage':fields[1],'errno':number or None,'kind':fields[3],
            'provenance':'bounded child assertion, not independent host observation'}


def cancel(_sig, _frame):
    global CANCELLED
    CANCELLED = True

def bounded(args, seconds=10, cap=1048576, cleaning=False):
    """Closed trusted clients only; partial setup always enters owned cleanup."""
    p = None; sel = None; primary = None; failures = []
    data = bytearray(); until = time.monotonic() + seconds
    try:
        p = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, close_fds=True, start_new_session=True, env=DOCKER_ENV)
        sel = selectors.DefaultSelector()
        for pipe in (p.stdout, p.stderr):
            os.set_blocking(pipe.fileno(), False)
            sel.register(pipe, selectors.EVENT_READ)
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
    except BaseException as error:
        primary = error
    finally:
        # Each cleanup is independent; no failure skips the remaining owned handles.
        def attempt(operation, action):
            try: action()
            except BaseException as error:
                failures.append({'operation':operation,'errno':error.errno if isinstance(error,OSError) else None})
        if p is not None:
            def terminate():
                if p.poll() is None: p.kill()
            attempt('owned_client_kill',terminate)
            attempt('owned_client_reap',lambda:p.wait(timeout=2))
        if sel is not None: attempt('selector_close',sel.close)
        if p is not None:
            for name in ('stdout','stderr'):
                pipe=getattr(p,name,None)
                if pipe is not None: attempt(name+'_close',pipe.close)
    if primary is not None or failures:
        error=primary if primary is not None else RuntimeError('control_cleanup_incomplete')
        error.control_cleanup_errors=failures
        raise error
    if time.monotonic()>=until or (CANCELLED and not cleaning):raise RuntimeError('control_deadline_or_cancel')
    return bytes(data)

def inspect(name, seconds=10, cleaning=False):
    return json.loads(bounded(['docker', 'inspect', name], seconds=seconds, cleaning=cleaning))[0]

def kv(path):
    return dict(line.split() for line in path.read_text().splitlines())

def category(error):
    value = detail(error)
    return value['code'] or value['kind']

def receipt(path, data):
    data = {**data, 'assurance':ASSURANCE}
    raw = (json.dumps(data, sort_keys=True) + '\n').encode()
    if BUDGET is None:raise RuntimeError('evidence_budget_unbound')
    BUDGET.guard(path,raw)
    if len(raw) > MAX_EVIDENCE: raise RuntimeError('evidence_cap')
    with path.open('xb') as f:
        f.write(raw); f.flush(); os.fsync(f.fileno())

def main():
    global PHASE, BUDGET
    mark('admission_read')
    # Local packet remains disabled. Activation is an explicit reviewed bytes change.
    admission = json.loads((ROOT / 'admission.json').read_text())
    if admission.get('enabled') is not True: raise RuntimeError('NOT_ACTIVATED')
    if any(admission.get(k)!=v for k,v in ASSURANCE.items()):raise RuntimeError('assurance_binding')
    if os.environ.get('GITHUB_EVENT_NAME') != 'push': raise RuntimeError('event_binding')
    if os.environ.get('GITHUB_REF') != admission['ref']: raise RuntimeError('ref_binding')
    if os.environ.get('GITHUB_REPOSITORY') != admission['repository']: raise RuntimeError('repo_binding')
    if os.environ.get('GITHUB_RUN_ATTEMPT') != '1': raise RuntimeError('rerun_refused')
    mark('event_read')
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
    mark('publication_binding')
    if bounded(['git','rev-parse','HEAD']).decode().strip()!=commit:raise RuntimeError('checkout_head_binding')
    parents=bounded(['git','rev-list','--parents','-n','1',commit]).decode().strip().split()
    if parents!=[commit,admission['baseCommit']]:raise RuntimeError('single_commit_base_required')
    payload=['supervisor.py','cleanup.py','canary.cjs','container.json','seccomp.json','mount-policy.json','empty.txt','parent_backend.py','runtime-support.json','control_helper.py','independent_recovery.py','bootstrap_requests.py','stage_payload.py','effective_properties.py','evidence_budget.py','outer_capture.py','pilot_driver.py','admission.json']
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
    mark('payload_pin_read')
    for name, digest in admission['files'].items():
        if Path(name).name != name: raise RuntimeError('pin_path')
        if hashlib.sha256((ROOT/name).read_bytes()).hexdigest() != digest: raise RuntimeError('pin_drift')
    if not admission['files']: raise RuntimeError('empty_pins')
    spec=importlib.util.spec_from_file_location('ibex_parent_backend',ROOT/'parent_backend.py')
    backend=importlib.util.module_from_spec(spec);spec.loader.exec_module(backend)
    global ERROR_CODES
    ERROR_CODES=ERROR_CODES | backend.CODES
    support=json.loads((ROOT/'runtime-support.json').read_text())
    if any(support.get(k)!=v for k,v in ASSURANCE.items()):raise RuntimeError('assurance_binding')
    if backend._HELPER is None:backend.control_context(time.monotonic()+5)
    if backend._HELPER.assurance(backend.control_context(time.monotonic()+5))!=ASSURANCE:raise RuntimeError('assurance_binding')
    image = admission['image']
    if '@sha256:' not in image: raise RuntimeError('image_unpinned')
    mark('image_inspect')
    info = json.loads(bounded(['docker', 'image', 'inspect', image]))[0]
    if info['Os'] != 'linux' or info['Architecture'] != 'amd64': raise RuntimeError('platform')
    run_id=os.environ.get('GITHUB_RUN_ID',''); attempt=os.environ.get('GITHUB_RUN_ATTEMPT','')
    if not run_id.isdigit() or attempt!='1':raise RuntimeError('attempt_identity')
    output = Path(os.environ['RUNNER_TEMP']) / ('ibex-pilot-' + run_id + '-' + attempt)
    mark('claim_directory_create')
    output.mkdir(mode=0o700)
    control=backend.control_context(time.monotonic()+5)
    BUDGET=control['budget']
    if control['run_id']!=run_id or control['attempt']!=attempt or control['commit']!=commit:raise RuntimeError('attempt_identity')
    token=control['nonce']; name='ibex-pilot-'+token
    mark('claim_write')
    receipt(output/'claim.json', {'name':name, 'token':token, 'source_commit':commit,'run_id':run_id,'attempt':attempt})
    start = time.monotonic(); deadline = start + 600
    result = {'assurance':ASSURANCE,'workload':'not_started','cleanup':'unconfirmed','passed':False,'events':[]}
    attach = None; events_handle = None; group = None; created = False; raw = bytearray(); stdout_raw = bytearray(); stderr_raw = bytearray()
    cid=None; resource_handles={}; result['resource_violation']=False
    parent=backend.Parent(output,run_id,attempt,commit,token,start+60,lambda:CANCELLED)
    child_group=None
    def observe_resources():
        try:
            observe_resource_values()
        except BaseException as error:
            if len(result.setdefault('resource_observation_failures', [])) < 3:
                result['resource_observation_failures'].append(detail(error))
            raise
    def observe_resource_values():
        mark('parent_counter')
        try:
            observed=parent.sample()
            result['resource_observation']=observed
        finally:
            result['resource_violation']=parent.violation
    def event(kind):
        if len(result['events']) >= 128: raise RuntimeError('event_cap')
        result['events'].append({'kind':kind,'elapsed_ms':int((time.monotonic()-start)*1000)})
    PHASE = 'startup'
    try:
        mark('parent_capability');parent.preflight(support['profiles'])
        mark('parent_lifetime');parent.create()
        result['parent_identity']=parent.identity.copy()
        result['parent_initial']=parent.last
        cmd = ['docker','create','--name',name,'--label','ibex.pilot='+token,
               '--pull=never','--platform=linux/amd64','--read-only','--user=1000:1000',
               '--network=none','--ipc=private','--pid=','--uts=','--userns=','--cgroupns=private',
               '--privileged=false','--publish-all=false','--rm=false','--init=false','--restart=no','--cap-drop=ALL','--cgroup-parent='+parent.name,
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
        mark('container_create')
        cid=bounded(cmd, seconds=min(20, max(.01,start+60-time.monotonic()))).decode().strip()
        if len(cid)!=64 or any(c not in '0123456789abcdef' for c in cid):raise RuntimeError('container_id')
        mark('created_identity_inspect')
        created_state=inspect(cid)
        if created_state['Id']!=cid or created_state['Config']['Labels'].get('ibex.pilot')!=token:raise RuntimeError('container_identity')
        mark('owned_claim_write')
        receipt(output/'owned-container.json',{'container_id':cid,'token':token,'source_commit':commit,'run_id':run_id,'attempt':attempt})
        result['container_id']=cid
        event('created')
        mark('attach_start')
        attach = subprocess.Popen(['docker','start','--attach','--interactive',cid],
                                  stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                                  close_fds=True,start_new_session=True,env=DOCKER_ENV)
        while True:
            mark('startup_inspect')
            state = inspect(cid,seconds=max(.01,min(10,start+60-time.monotonic())))
            if state['Config']['Labels'].get('ibex.pilot') != token: raise RuntimeError('ownership')
            pid = state['State']['Pid']
            if pid: break
            if CANCELLED or time.monotonic() >= start+60: raise RuntimeError('startup_deadline')
            time.sleep(.05)
        mark('parent_membership')
        child_group=parent.bind_container(cid,state,pid)
        parent.exclude(attach.pid)
        group=parent.path
        observe_resources()
        result['cgroup_identity']=parent.identity.copy()
        mark('host_config_validate')
        try:backend._HELPER.container_security(state,json.loads((ROOT/'seccomp.json').read_text()),parent.name)
        except backend._HELPER.ControlFailure:raise RuntimeError('container_security_contract') from None
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
        mark('limits_final_read')
        result['effective_limits']={'memory_max':(group/'memory.max').read_text().strip(),
            'memory_swap_max':(group/'memory.swap.max').read_text().strip(),
            'pids_max':(group/'pids.max').read_text().strip(),'cpu_max':(group/'cpu.max').read_text().strip()}
        parent.verify();parent.check_layout();observe_resources()
        parent.until=deadline
        mark('go_write')
        event('limits_verified'); attach.stdin.write(b'GO\n'); attach.stdin.flush(); attach.stdin.close()
        mark('pipe_setup')
        sel = selectors.DefaultSelector()
        for pipe in [attach.stdout,attach.stderr]:
            os.set_blocking(pipe.fileno(),False); sel.register(pipe,selectors.EVENT_READ)
        result['workload']='running'
        PHASE = 'workload'
        try:
            while time.monotonic()<deadline and not CANCELLED:
                mark('workload_pipe_read')
                for key,_ in sel.select(.1):
                    chunk=os.read(key.fileobj.fileno(),65536)
                    if not chunk: sel.unregister(key.fileobj);continue
                    if len(raw)+len(chunk)>MAX_RAW: raise RuntimeError('raw_output_cap')
                    raw.extend(chunk)
                    (stdout_raw if key.fileobj is attach.stdout else stderr_raw).extend(chunk)
                observe_resources()
                if stdout_raw == b'SYNTHETIC_OK\n' and not stderr_raw:
                    # Host confirms descendant presence; then tests owned-tree termination.
                    mark('descendant_membership_read')
                    parent.check_layout()
                    processes=backend.read_small(child_group/'cgroup.procs',deadline).decode().splitlines()
                    if len(set(processes)) != 2 or str(pid) not in processes: raise RuntimeError('descendant_membership')
                    result['observed_owned_processes']=[int(p) for p in processes]
                    result['workload']='canaries_passed_termination_required';event('canaries_passed');break
                mark('attach_poll')
                if attach.poll() is not None: raise RuntimeError('early_exit')
            else: raise RuntimeError('work_deadline_or_cancel')
        finally: sel.close()
    except BaseException as error:
        result['supervisor_failure']=detail(error)
        result['parent_operation']=parent.operation
        result['parent_command_cleanup_errors']=getattr(error,'parent_cleanup_errors',[])
        result['parent_create_attempted']=parent.attempted
        result['parent_ownership_confirmed']=parent.owned
        result['workload_failure']=category(error)
        result['failure_stage']=result['events'][-1]['kind'] if result['events'] else 'creation_or_startup'
        result['workload']='failed'
    finally:
        # Cleanup has its own ten-second ceiling after the workload limit; no retry.
        PHASE = 'cleanup'
        until=time.monotonic()+10
        parent.until=until;parent.cleaning=True
        try:
            if not created or cid is None: raise RuntimeError('no_immutable_container_identity')
            mark('cleanup_identity_inspect')
            state=inspect(cid,seconds=max(.01,until-time.monotonic()),cleaning=True)
            if state['Id']!=cid or state['Config']['Labels'].get('ibex.pilot')!=token: raise RuntimeError('ownership')
            mark('cleanup_kill')
            if state['State']['Running']: bounded(['docker','kill',cid],seconds=max(.01,until-time.monotonic()),cleaning=True)
            mark('cleanup_pipe_drain')
            if attach:
                sel=selectors.DefaultSelector()
                for pipe in [attach.stdout,attach.stderr]:
                    os.set_blocking(pipe.fileno(),False);sel.register(pipe,selectors.EVENT_READ)
                while sel.get_map() and time.monotonic()<until:
                    mark('cleanup_pipe_drain')
                    for key,_ in sel.select(.05):
                        chunk=os.read(key.fileobj.fileno(),65536)
                        if not chunk:sel.unregister(key.fileobj);continue
                        if len(raw)+len(chunk)>MAX_RAW:raise RuntimeError('raw_output_cap')
                        raw.extend(chunk)
                        (stdout_raw if key.fileobj is attach.stdout else stderr_raw).extend(chunk)
                complete=not sel.get_map();sel.close()
                if not complete:raise RuntimeError('pipe_eof_unconfirmed')
                mark('cleanup_attach_wait')
                result['attach_exit']=attach.wait(timeout=max(.01,until-time.monotonic()))
            mark('cleanup_final_inspect')
            state=inspect(cid,seconds=max(.01,until-time.monotonic()),cleaning=True);result['container_exit']=state['State']['ExitCode']
            if state['State']['Running'] or state['State']['OOMKilled']: raise RuntimeError('container_not_clean')
            mark('parent_counter')
            final=parent.finish()
            result['final_parent_observation']=final
            result['final_populated']=str(final['populated'])
            result['resource_violation']=parent.violation
            mark('cleanup_remove')
            bounded(['docker','rm',cid],seconds=max(.01,until-time.monotonic()),cleaning=True)
            if time.monotonic()>until:raise RuntimeError('cleanup_deadline')
            result['cleanup']='confirmed'
        except BaseException as error:
            result['cleanup_failure']=category(error)
            result['cleanup_diagnostic']=detail(error)
        finally:
            # Parent cleanup is independent of primary/container cleanup failures.
            result['parent_cleanup']='unconfirmed'
            try:
                if not parent.owned:raise RuntimeError('parent_identity')
                parent.until=until;parent.cleaning=True
                # Never stop a populated/foreign/unknown parent; preserve diagnostics.
                mark('parent_release');parent.release()
                result['parent_cleanup']='released_after_empty_observation'
            except BaseException as parent_error:
                result['parent_cleanup_diagnostic']=detail(parent_error)
                result['parent_cleanup_operation']=parent.operation
                result['cleanup']='unconfirmed'
            finally:
                result['resource_violation']=result['resource_violation'] or parent.violation
            PHASE = 'finalization'
            result['finalization_errors'] = []
            result['finalization_error_overflow'] = False
            result['passed'] = False
            result['cancellation_observed'] = False
            def latch_cancellation():
                result['cancellation_observed'] = result['cancellation_observed'] or CANCELLED
                if result['cancellation_observed']:
                    result['passed'] = False
            def attempt(operation, action):
                mark(operation)
                try:
                    return True, action()
                except BaseException as error:
                    # Primary, resource and cleanup records are never replaced here.
                    if len(result['finalization_errors']) < 32:
                        result['finalization_errors'].append(detail(error))
                    else:
                        result['finalization_error_overflow'] = True
                    result['passed'] = False
                    result['cleanup'] = 'unconfirmed'
                    return False, None
            if events_handle:
                attempt('final_events_close', events_handle.close)
            for name, operation in [('memory.events','final_memory_close'),('pids.events','final_pids_close')]:
                handle = resource_handles.get(name)
                if handle: attempt(operation, handle.close)
            if attach:
                ok, code = attempt('final_attach_poll', attach.poll)
                if ok and code is not None:
                    result['final_attach_exit_observation'] = {'code':code,'phase':'finalization_after_cleanup'}
                if not ok or code is None:
                    # Retained direct attach process only; never guess a PID or name.
                    attempt('final_attach_kill', attach.kill)
                    def wait_owned_attach():
                        remaining = until - time.monotonic()
                        if remaining <= 0: raise RuntimeError('cleanup_deadline')
                        return attach.wait(timeout=min(1, remaining))
                    waited, code = attempt('final_attach_wait', wait_owned_attach)
                    if waited:
                        result['final_attach_exit_observation'] = {'code':code,'phase':'finalization_after_cleanup'}
                    else: result['attach_reap'] = 'unconfirmed'
                for pipe, operation in [(attach.stdin,'final_stdin_close'),(attach.stdout,'final_stdout_close'),(attach.stderr,'final_stderr_close')]:
                    if pipe: attempt(operation, pipe.close)
            def child_observation():
                return {'attach_exit':result.get('attach_exit'), 'container_exit':result.get('container_exit'),
                    'exit_observation_phase':'cleanup_after_primary_failure_or_termination; not initial failure',
                    'diagnostic':child_diagnostic(stderr_raw), 'diagnostic_stream':'stderr',
                    'success_marker_observed':stdout_raw==b'SYNTHETIC_OK\n' and not stderr_raw}
            observed, observation = attempt('final_child_observation', child_observation)
            if observed: result['child_observation'] = observation
            result['raw_bytes']=len(raw);result['raw_sha256']=hashlib.sha256(raw).hexdigest()
            result['streams']={name:{'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
                               for name,data in [('stdout',stdout_raw),('stderr',stderr_raw)]}
            def write_evidence(name, data, operations):
                admitted,_=attempt('final_budget_check',lambda:BUDGET.guard(name,data))
                if not admitted:return False
                opened, handle = attempt(operations[0], lambda: (output/name).open('xb'))
                if not opened: return False
                succeeded = True
                def write_all():
                    if handle.write(data) != len(data): raise RuntimeError('evidence_short_write')
                try:
                    for operation, action in [(operations[1],write_all),
                            (operations[2],handle.flush),(operations[3],lambda: os.fsync(handle.fileno()))]:
                        ok, _ = attempt(operation, action)
                        succeeded = succeeded and ok
                        if not ok: break
                finally:
                    closed, _ = attempt(operations[4], handle.close)
                return succeeded and closed
            # Raw failure cannot skip the terminal or console channels.
            result['raw_file_written'] = write_evidence('raw-output.bin',raw,
                ['final_raw_open','final_raw_write','final_raw_flush','final_raw_sync','final_raw_close'])
            latch_cancellation()
            result['acceptance_candidate'] = (result['workload']=='canaries_passed_termination_required'
                and result['cleanup']=='confirmed' and result['parent_cleanup']=='released_after_empty_observation' and stdout_raw==b'SYNTHETIC_OK\n' and not stderr_raw and not CANCELLED
                and not result['resource_violation'] and not result['finalization_errors']
                and not result['finalization_error_overflow'] and not result['cancellation_observed'])
            # The persisted file precedes its own persistence outcome; it never grants final PASS.
            result['receipt_phase'] = 'before_terminal_persistence_and_console'
            def encode_snapshot():
                latch_cancellation()
                data = (json.dumps(result,sort_keys=True)+'\n').encode('utf-8')
                if len(data)>MAX_EVIDENCE: raise RuntimeError('evidence_cap')
                return data
            encoded, data = attempt('final_terminal_encode', encode_snapshot)
            result['terminal_file_written'] = False
            if encoded:
                result['terminal_file_written'] = write_evidence('terminal.json',data,
                    ['final_terminal_open','final_terminal_write','final_terminal_flush','final_terminal_sync','final_terminal_close'])
            latch_cancellation()
            result['passed'] = (not result['cancellation_observed'] and not CANCELLED and result['acceptance_candidate'] and result['terminal_file_written']
                and not result['finalization_errors'] and not result['finalization_error_overflow'])
            result['receipt_phase'] = 'console_candidate_requires_successful_write_flush_and_process_exit'
            def write_console(stream, prefix, data):
                text = prefix + data.decode('utf-8')
                if stream.write(text) != len(text): raise RuntimeError('evidence_short_write')
            encoded, data = attempt('final_console_encode', encode_snapshot)
            if encoded:
                written, _ = attempt('final_console_write', lambda: write_console(sys.stdout,'PILOT_RECEIPT ',data))
                flushed, _ = attempt('final_console_flush', sys.stdout.flush)
            else:
                written = flushed = False
            if not encoded or not written or not flushed:
                # Best-effort independent stderr retains the aggregate if stdout is broken.
                result['passed'] = False
                encoded, data = attempt('final_console_encode', encode_snapshot)
                if encoded:
                    attempt('final_stderr_write', lambda: write_console(sys.stderr,'PILOT_INCOMPLETE_RECEIPT ',data))
                    attempt('final_stderr_flush', sys.stderr.flush)
    # Recheck after console flush/fallback; earlier persisted/console candidates are provisional.
    latch_cancellation()
    return 0 if result['passed'] and not CANCELLED else 1

if __name__=='__main__':
    signal.signal(signal.SIGTERM,cancel);signal.signal(signal.SIGINT,cancel)
    try: exit_code=main()
    except BaseException as error:
        print('PILOT_REFUSED_OR_INCOMPLETE '+json.dumps(detail(error),sort_keys=True));exit_code=1
    sys.exit(1 if CANCELLED else exit_code)
