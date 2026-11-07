"""Disabled fixed-operation systemd broker; only main() starts future service.
No arbitrary argv is accepted by the root RPC API. Runtime profiles are empty.
"""
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import socket
import stat
import struct
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

SERVICE='org.freedesktop.systemd1'
MANAGER='/org/freedesktop/systemd1'
IFACE=SERVICE+'.Manager'
BUS='/run/dbus/system_bus_socket'
CAP=1048576
MAX_REQUESTS=768
CANCELLED=False

class ControlFailure(RuntimeError):
    def __init__(self,code,observation=None):
        super().__init__(code);self.observation=observation or {}

def reject(code):raise ControlFailure(code)
def deadline(until):
    if CANCELLED or time.monotonic()>=until:reject('control_deadline')
def secure(path, directory=False):
    p=Path(path)
    if not p.is_absolute():reject('control_path')
    for x in [*reversed(p.parents),p]:
        s=x.lstat()
        if stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:reject('control_path')
    s=p.stat()
    if directory and not stat.S_ISDIR(s.st_mode):reject('control_path')
    if not directory and not stat.S_ISREG(s.st_mode):reject('control_path')
    return s

def small(path,cap=65536):
    secure(path)
    with Path(path).open('rb') as f:b=f.read(cap+1)
    if len(b)>cap:reject('control_cap')
    return b

ASSURANCE_MODEL='managed-runner-components-v1'
POLICY_REVIEW_SHA256='5f0b365406a585112c1b93c9283174b13f2ec20a062f7afa69d87aeb13ac96fe'
OWNED_NAMES=('control_helper.py','parent_backend.py','independent_recovery.py','bootstrap_requests.py','effective_properties.py','evidence_budget.py')
TOOLS=('/usr/bin/busctl','/usr/bin/git','/usr/bin/docker','/usr/bin/sudo','/usr/bin/timeout','/usr/bin/systemd-run','/usr/bin/systemctl')

COMPATIBILITY = {'schema':'ubuntu24-components-v1','kernelFamily':[7,0],
 'kernelFlavours':['aws','azure'],'systemdMajor':255,'dockerClient':'28.0.4','dockerServer':'28.0.4','dockerAPI':'1.48',
 'pidEvents':'hierarchical-limit-events','memoryEvents':'hierarchical'}
METHODS={'StartTransientUnit':('ssa(sv)a(sa(sv))','o'),'StopUnit':('ss','o'),
 'GetUnit':('s','o'),'ListUnits':('','a(ssssssouso)'),
 'ListUnitFilesByPatterns':('asas','a(ss)'), 'ListJobs':('','a(usssoo)')}
PROPERTY_TYPES={
 ('org.freedesktop.systemd1.Manager','Version'):'s',
 ('org.freedesktop.systemd1.Unit','Description'):'s',
 ('org.freedesktop.systemd1.Unit','Transient'):'b',
 ('org.freedesktop.systemd1.Unit','StopWhenUnneeded'):'b',
 ('org.freedesktop.systemd1.Unit','InvocationID'):'ay',
 ('org.freedesktop.systemd1.Unit','ActiveState'):'s',
 ('org.freedesktop.systemd1.Unit','Job'):'(uo)',
 ('org.freedesktop.systemd1.Slice','ControlGroup'):'s',
 ('org.freedesktop.systemd1.Service','ControlGroup'):'s',
 ('org.freedesktop.systemd1.Service','MainPID'):'u'}

def strict_members(pairs):
    value={}
    for key,item in pairs:
        if key in value:reject('control_protocol')
        value[key]=item
    return value

def strict_json(raw):
    return json.loads(raw,object_pairs_hook=strict_members)

def bounded_text(value,cap):
    return type(value)is str and 0<len(value)<=cap and all(32<=ord(c)<=126 for c in value)

def kernel_compatible(release,machine):
    # Finite vendor family, not arbitrary >= version. ABI updates are vendor trusted.
    return machine=='x86_64' and type(release)is str and len(release)<=64 and re.fullmatch(r'7\.0\.0-[1-9][0-9]{0,5}-(aws|azure)',release)is not None

def image_provenance(image_os,image_version,machine):
    if image_os!='ubuntu24' or machine!='x86_64' or type(image_version)is not str or re.fullmatch(r'[0-9]{8}\.[0-9]{1,6}\.[0-9]{1,6}',image_version)is None:reject('control_profile')
    return {'ImageOS':image_os,'ImageVersion':image_version,'machine':machine,'assurance':'vendor-provenance-not-host-attestation'}

def systemd_version(value):
    # Opaque GIT_VERSION provenance only: CLI explicitly identifies upstream 255.
    # Exact raw client/manager tag equality is checked separately, never normalized.
    return bounded_text(value,96) and '(' not in value and ')' not in value

def systemd_cli(value):
    if type(value)is not str or len(value)>4096:reject('control_profile')
    lines=value.splitlines()
    if not 1<=len(lines)<=4 or any(not bounded_text(x,2048) for x in lines):reject('control_profile')
    match=re.fullmatch(r'systemd 255 \(([^()]{1,96})\)',lines[0])
    if not match or not systemd_version(match.group(1)):reject('control_profile')
    return match.group(1)

def api_number(value):
    if type(value)is not str or re.fullmatch(r'1\.[0-9]{1,3}',value)is None:reject('control_profile')
    return int(value[2:])

def docker_compatibility(value):
    if type(value)is not dict:reject('control_profile')
    for key in ('Client','Server'):
        part=value.get(key)
        if type(part)is not dict or part.get('Version')!='28.0.4':reject('control_profile')
        if part.get('Os')!='linux' or part.get('Arch')!='amd64' or api_number(part.get('ApiVersion'))<48:reject('control_profile')
    if api_number(value['Server'].get('MinAPIVersion'))>48:reject('control_profile')
    # DOCKER_API_VERSION is fixed for every subsequent Docker client invocation.
    return {'client':value['Client']['Version'],'server':value['Server']['Version'],'api':'1.48'}

def manager_contract(xml):
    if type(xml)is not str or len(xml)>1048576 or '<!ENTITY' in xml:reject('control_protocol')
    root=ET.fromstring(xml)
    interfaces=root.findall('interface') if root.tag=='node' else [root] if root.tag=='interface' else []
    found=[x for x in interfaces if x.get('name')==IFACE]
    if len(found)!=1:reject('control_protocol')
    methods={}
    for m in found[0].findall('method'):
        name=m.get('name')
        if name in methods:reject('control_protocol')
        args=m.findall('arg')
        if any(a.get('direction','in') not in ('in','out') or not a.get('type') for a in args):reject('control_protocol')
        methods[name]=tuple(''.join(a.get('type') for a in args if a.get('direction','in')==direction) for direction in ('in','out'))
    if any(methods.get(k)!=v for k,v in METHODS.items()):reject('control_protocol')
    props=[p for p in found[0].findall('property') if p.get('name')=='Version']
    if len(props)!=1 or props[0].get('type')!='s' or props[0].get('access')!='read':reject('control_protocol')
    return True

def typed_value(kind,value):
    if kind=='s':return type(value)is str and len(value)<=1048576
    if kind=='o':return type(value)is str and re.fullmatch(r'/(?:[A-Za-z0-9_]+(?:/[A-Za-z0-9_]+)*)?',value)is not None
    if kind=='b':return type(value)is bool
    if kind=='u':return type(value)is int and 0<=value<2**32
    if kind=='ay':return type(value)is list and len(value)<=64 and all(type(x)is int and 0<=x<=255 for x in value)
    if kind=='(uo)':return type(value)is list and len(value)==2 and typed_value('u',value[0]) and typed_value('o',value[1])
    rows={'a(ssssssouso)':'ssssssouso','a(ss)':'ss','a(usssoo)':'usssoo'}
    if kind in rows:
        return type(value)is list and len(value)<=4096 and all(type(row)is list and len(row)==len(rows[kind]) and all(typed_value(t,x) for t,x in zip(rows[kind],row)) for row in value)
    if kind=='a{sv}':return type(value)in (list,dict) and len(value)<=4096
    return False

def bus_reply(tail,value):
    if type(value)is not dict or set(value)!={'type','data'}:reject('control_protocol')
    if tail[0]=='get-property':
        if len(tail)!=5:reject('control_protocol')
        kind=PROPERTY_TYPES.get((tail[3],tail[4]))
        if kind is None or value['type']!=kind or not typed_value(kind,value['data']):reject('control_protocol')
    elif tail[0]=='call':
        if len(tail)<5:reject('control_protocol')
        interface,method=tail[3:5]
        pair=('s','a{sv}') if interface=='org.freedesktop.DBus.Properties' and method=='GetAll' else METHODS.get(method) if interface==IFACE else None
        if pair is None or (tail[5] if len(tail)>5 else '')!=pair[0] or value['type']!=pair[1] or type(value['data'])is not list or len(value['data'])!=1 or not typed_value(pair[1],value['data'][0]):reject('control_protocol')
    else:reject('control_protocol')
    return value

def container_security(state,seccomp,parent_name):
    if type(state)is not dict or type(state.get('HostConfig'))is not dict:reject('control_container')
    h=state['HostConfig']
    expected={'ReadonlyRootfs':True,'Privileged':False,'NetworkMode':'none','IpcMode':'private',
      'PidMode':'','CgroupnsMode':'private','UTSMode':'','UsernsMode':'','PublishAllPorts':False,'AutoRemove':False,'Init':False,
      'Memory':4294967296,'MemorySwap':4294967296,'PidsLimit':128,'NanoCpus':2000000000,'CgroupParent':parent_name}
    for key,want in expected.items():
        if type(h.get(key))is not type(want) or h[key]!=want:reject('control_container')
    if h.get('CapDrop')!=['ALL'] or h.get('CapAdd') not in (None,[]):reject('control_container')
    for key in ('Devices','DeviceRequests','DeviceCgroupRules','VolumesFrom','Links'):
        if key not in h or h[key] not in (None,[]):reject('control_container')
    if 'PortBindings' not in h or h['PortBindings'] not in (None,{}):reject('control_container')
    # Moby v28 HostConfig.Sysctls has json omitempty: absence represents empty.
    if h.get('Sysctls') not in (None,{}):reject('control_container')
    if h.get('RestartPolicy')!={'Name':'no','MaximumRetryCount':0} or type(h['RestartPolicy']['MaximumRetryCount'])is not int or h.get('LogConfig')!={'Type':'none','Config':{}}:reject('control_container')
    options=h.get('SecurityOpt')
    if type(options)is not list or len(options)!=2 or options.count('no-new-privileges')!=1:reject('control_container')
    other=[x for x in options if x!='no-new-privileges']
    if len(other)!=1 or type(other[0])is not str or len(other[0])>65536 or not other[0].startswith('seccomp='):reject('control_container')
    if json.dumps(strict_json(other[0][8:]),sort_keys=True,separators=(',',':'))!=json.dumps(seccomp,sort_keys=True,separators=(',',':')):reject('control_container')
    return True


def assurance(value):
    if type(POLICY_REVIEW_SHA256)is not str or re.fullmatch(r'[a-f0-9]{64}',POLICY_REVIEW_SHA256)is None:reject('control_assurance')
    result={'assuranceModel':ASSURANCE_MODEL,'policyReviewSHA256':POLICY_REVIEW_SHA256}
    if any(value.get(k)!=v for k,v in result.items()):reject('control_assurance')
    return result

def ambient_profile(profile,until):
    # Ambient libraries/configuration are explicitly vendor/admin trusted, NOT
    # independently hash-verified. Only this closed direct executable set is read.
    assurance(profile);deadline(until)
    keys={'assuranceModel','policyReviewSHA256','profileSHA256','reviewedControlPathSHA256','busAddress','pythonExecutable','vendorBaseline','fixedExecutableRules','ownedSourcePins'}
    if set(profile)!=keys:reject('control_profile')
    for key in ('profileSHA256','reviewedControlPathSHA256'):
        if not re.fullmatch(r'[a-f0-9]{64}',profile.get(key,'')):reject('control_profile')
    if profile['busAddress']!='unix:path='+BUS:reject('control_address')
    python=profile['pythonExecutable']
    if not re.fullmatch(r'/usr/bin/python3\.[0-9]{1,2}',python):reject('control_profile')
    if profile['vendorBaseline']!=COMPATIBILITY:reject('control_profile')
    if not kernel_compatible(os.uname().release,os.uname().machine):reject('control_profile')
    rules=profile['fixedExecutableRules']
    if not isinstance(rules,dict) or set(rules)!=set(TOOLS+(python,)):reject('control_profile')
    observed={}
    for name in TOOLS+(python,):
        deadline(until)
        if rules[name]!={'canonicalPath':name,'uid':0,'forbidWriteMask':18,'regular':True}:reject('control_profile')
        s=secure(name);deadline(until)
        if not s.st_mode&0o111 or str(Path(name).resolve())!=name:reject('control_path')
        deadline(until)
        observed[name]={'canonicalPath':name,'uid':s.st_uid,'mode':stat.S_IMODE(s.st_mode),'device':s.st_dev,'inode':s.st_ino,'size':s.st_size,'assurance':'vendor-trusted-metadata-only'}
    pins=profile['ownedSourcePins']
    if not isinstance(pins,dict) or set(pins)!=set(OWNED_NAMES) or any(not isinstance(v,str) or not re.fullmatch(r'[a-f0-9]{64}',v) for v in pins.values()):reject('control_profile')
    deadline(until)
    return observed

def staged_bytes(path,gid,cap,until):
    # Root immutable directory plus retained no-follow/nonblocking descriptor.
    # Partial receipt creation is never repaired or treated as final evidence.
    deadline(until);prior=secure(path);deadline(until)
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        deadline(until);before=os.fstat(fd);deadline(until)
        def metadata(st):
            return (st.st_dev,st.st_ino,st.st_uid,st.st_gid,st.st_mode,st.st_size,st.st_mtime_ns,st.st_ctime_ns)
        if metadata(prior)!=metadata(before) or not stat.S_ISREG(before.st_mode) or before.st_uid!=0 or before.st_gid!=gid or stat.S_IMODE(before.st_mode)!=0o440 or before.st_size>cap:reject('control_staged_metadata')
        data=bytearray()
        while len(data)<=cap:
            deadline(until);chunk=os.read(fd,min(65536,cap+1-len(data)));deadline(until)
            if not chunk:break
            data.extend(chunk)
        after=os.fstat(fd);deadline(until)
        current=Path(path).lstat();deadline(until)
        if len(data)>cap or len(data)!=before.st_size or metadata(before)!=metadata(after) or metadata(after)!=metadata(current):reject('control_staged_changed')
        result=bytes(data)
    finally:os.close(fd)
    deadline(until)
    return result

def config(path,until=None):
    if until is None:until=time.monotonic()+5
    deadline(until)
    p=Path(path)
    match=re.fullmatch(r'/run/ibexpilotcontrol([0-9]{1,20})a1t([a-f0-9]{32})/config.json',str(p))
    if not match:reject('control_path')
    c=json.loads(small(p));run,nonce=match.groups()
    if c.get('run_id')!=run or c.get('attempt')!='1' or c.get('nonce')!=nonce or not re.fullmatch(r'[a-f0-9]{40}',c.get('commit','')):reject('control_identity')
    if type(c.get('client_uid')) is not int or c['client_uid']<=0 or type(c.get('client_gid')) is not int or c['client_gid']<=0:reject('control_identity')
    if c.get('bus_address')!='unix:path='+BUS:reject('control_address')
    c['directory']=p.parent;c['socket']=p.parent/'control.sock'
    c['unit']='ibexpilot'+run+'a1t'+nonce+'.slice'
    c['description']='ibex:'+run+':1:'+c['commit']+':'+nonce
    c['object']='/org/freedesktop/systemd1/unit/'+c['unit'].replace('.', '_2e')
    support=json.loads(small(p.parent/'runtime-support.json'))
    if support.get('executionAllowed') is not True:reject('control_profile')
    profiles=support['profiles']
    matches=[q for q in profiles if q.get('profileSHA256')==c.get('profileSHA256')]
    if len(matches)!=1:reject('control_profile')
    profile=matches[0]
    assurance(c);assurance(support)
    c['ambientExecutables']=ambient_profile(profile,until)
    pins=json.loads(small(p.parent/'source-pins.json'))
    if pins!=profile['ownedSourcePins']:reject('control_profile')
    for name in OWNED_NAMES:
        deadline(until)
        if hashlib.sha256(staged_bytes(p.parent/name,c['client_gid'],262144,until)).hexdigest()!=pins[name]:reject('control_profile')
    stage=json.loads(staged_bytes(p.parent/'stage-receipt.json',c['client_gid'],16384,until))
    if stage.get('destination')!=str(p.parent) or stage.get('assurance')!=assurance(c):reject('control_profile')
    expected=set(OWNED_NAMES)|{'config.json','runtime-support.json','source-pins.json'}
    if set(stage.get('fileHashes',{}))!=expected:reject('control_profile')
    for name,want in stage['fileHashes'].items():
        deadline(until)
        if hashlib.sha256(staged_bytes(p.parent/name,c['client_gid'],262144,until)).hexdigest()!=want:reject('control_profile')
    deadline(until)
    observation=c.get('componentObservation')
    if type(observation)is not dict or set(observation)!={'systemdBuildTag','docker'} or not systemd_version(observation['systemdBuildTag']) or observation['docker']!={'client':'28.0.4','server':'28.0.4','api':'1.48'}:reject('control_profile')
    c['profile']=profile
    spec=importlib.util.spec_from_file_location('admitted_budget',p.parent/'evidence_budget.py')
    budget=importlib.util.module_from_spec(spec);spec.loader.exec_module(budget);c['budget']=budget
    return c

def fixed_error(error):
    return {'code':error.args[0] if isinstance(error,ControlFailure) else 'control_internal',
            'errno':error.errno if isinstance(error,OSError) and type(error.errno) is int and 0<=error.errno<=4095 else None}

def direct_child(argv,until,expected_cgroup=None):
    """Only caller-constructed, reviewed no-fork local paths. Service cgroup is
    independent descendant backstop; failure of either layer is not success."""
    deadline(until)
    p=None;sel=None;out=bytearray();err=bytearray();primary=None;errors=[]
    observation={'pid':None,'exit':None,'reaped':False,'eof':False,'cleanupErrors':errors}
    def attempt(op,fn):
        try:return fn()
        except BaseException as e:errors.append({'operation':op,**fixed_error(e)});return None
    try:
        p=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
            close_fds=True,start_new_session=False,env={'PATH':'/usr/bin:/bin','LANG':'C','LC_ALL':'C','HOME':'/nonexistent','DOCKER_API_VERSION':'1.48','DOCKER_HOST':'unix:///var/run/docker.sock'})
        observation['pid']=p.pid
        # Retained Popen is the child ownership authority. No early poll/reap,
        # avoiding PID reuse before a necessary direct-child signal.
        if expected_cgroup is not None:
            data=Path('/proc/'+str(p.pid)+'/cgroup').read_bytes()
            if data!=expected_cgroup:reject('control_child_membership')
            observation['cgroupSHA256']=hashlib.sha256(data).hexdigest()
        sel=selectors.DefaultSelector()
        for stream in (p.stdout,p.stderr):
            os.set_blocking(stream.fileno(),False);sel.register(stream,selectors.EVENT_READ)
        while sel.get_map():
            deadline(until)
            for key,_ in sel.select(min(.02,max(0,until-time.monotonic()))):
                b=os.read(key.fileobj.fileno(),65536)
                if not b:sel.unregister(key.fileobj);continue
                if len(out)+len(err)+len(b)>CAP:reject('control_output_cap')
                (out if key.fileobj is p.stdout else err).extend(b)
        observation['eof']=True
        observation['exit']=p.wait(timeout=max(.001,until-time.monotonic()));observation['reaped']=True
        deadline(until)
        if observation['exit']!=0:reject('control_child_exit')
    except BaseException as e:primary=e
    finally:
        if p is not None and not observation['reaped']:
            # This exact retained child only. Unknown descendants are bounded by
            # the service KillMode, never by broad PID/process-group guessing.
            attempt('child_kill',p.kill)
            code=attempt('child_reap',lambda:p.wait(timeout=.25))
            if code is not None:observation['exit']=code;observation['reaped']=True
        if sel is not None:attempt('selector_close',sel.close)
        if p is not None:
            for name,stream in [('stdout_close',p.stdout),('stderr_close',p.stderr)]:
                if stream is not None:attempt(name,stream.close)
        if expected_cgroup is not None:
            def confirm_service_members():
                line=expected_cgroup.decode('ascii').strip()
                if not re.fullmatch(r'0::/ibexpilotharness[0-9]+a1t[a-f0-9]{32}\.slice/ibexpilotcontrol[0-9]+a1t[a-f0-9]{32}\.service',line):reject('control_service_membership')
                path=Path('/sys/fs/cgroup')/line[4:]/'cgroup.procs'
                with path.open('rb') as f:data=f.read(4097)
                if len(data)>4096 or data.split()!=[str(os.getpid()).encode()]:reject('control_descendant_unconfirmed')
            attempt('service_members_after_reap',confirm_service_members)
        observation['stdoutBytes']=len(out);observation['stderrBytes']=len(err)
        observation['stdoutSHA256']=hashlib.sha256(out).hexdigest();observation['stderrSHA256']=hashlib.sha256(err).hexdigest()
    observation['completionWithinDeadline']=not CANCELLED and time.monotonic()<until
    if not observation['completionWithinDeadline'] and primary is None:primary=ControlFailure('control_deadline')
    if primary is not None or errors or not observation['reaped'] or not observation['eof']:
        raise ControlFailure('control_command_failed',{'primary':fixed_error(primary) if primary else None,**observation})
    # Last boundary check follows closes and service membership observation.
    deadline(until)
    return bytes(out),observation

def local_command(args,until,c):
    # Outside root RPC: Git inspection and exact Docker client operations. Docker
    # rm is existing exact-owned fallback removal, not a read-only operation.
    if os.geteuid()==0:reject('control_client_uid')
    allowed=False
    if args[:2]==['/usr/bin/git','rev-parse'] and args[2:]==['HEAD']:allowed=True
    if len(args)==4 and args[:3]==['/usr/bin/git','cat-file','blob']:
        allowed=bool(re.fullmatch(r'[a-f0-9]{40}:containment-pilot/(parent_backend.py|cleanup.py|admission.json)',args[3]))
    if args in (['/usr/bin/docker','info','--format','{{json .}}'],['/usr/bin/docker','version','--format','{{json .}}']):allowed=True
    if len(args)==3 and args[:2]==['/usr/bin/docker','inspect'] and re.fullmatch(r'[a-f0-9]{64}',args[2]):allowed=True
    if len(args)==4 and args[:3]==['/usr/bin/docker','rm','--force'] and re.fullmatch(r'[a-f0-9]{64}',args[3]):allowed=True
    if len(args)==9 and args[:5]==['/usr/bin/docker','container','ls','--all','--no-trunc'] and args[5]=='--filter' and re.fullmatch(r'id=[a-f0-9]{64}',args[6]) and args[7:]==['--format','{{.ID}}']:allowed=True
    if not allowed:reject('control_operation')
    return direct_child(args,until)[0]

def recv_frame(s,cap,until):
    data=bytearray()
    while True:
        deadline(until);s.settimeout(max(.001,until-time.monotonic()))
        b=s.recv(min(65536,cap+1-len(data)))
        if not b:break
        data.extend(b)
        if len(data)>cap:reject('control_output_cap')
    return bytes(data)

def request(c,op,until):
    if os.geteuid()!=c['client_uid']:reject('control_client_uid')
    st=c['socket'].lstat()
    if not stat.S_ISSOCK(st.st_mode) or st.st_uid!=0 or st.st_gid!=c['client_gid'] or stat.S_IMODE(st.st_mode)!=0o660:reject('control_socket')
    message={'operation':op,'run_id':c['run_id'],'attempt':'1','nonce':c['nonce'],'commit':c['commit'],**assurance(c)}
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as sock:
        deadline(until);sock.settimeout(max(.001,until-time.monotonic()));sock.connect(str(c['socket']))
        _,uid,_=struct.unpack('3i',sock.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
        if uid!=0:reject('control_peer')
        sock.sendall(json.dumps(message).encode());sock.shutdown(socket.SHUT_WR)
        reply=json.loads(recv_frame(sock,2*CAP,until))
    if reply.get('ok') is not True:raise ControlFailure('control_remote_failure',reply.get('observation',{}))
    if reply.get('assurance')!=assurance(c) or reply.get('operation')!=op:reject('control_protocol')
    return reply['result']

class Broker:
    def __init__(self,c,until):
        self.c=c;self.until=until;self.operation_until=until;self.created=False;self.stop_attempted=False;self.invocation=None
        self.cg=Path('/proc/self/cgroup').read_bytes()
        expected=('0::/ibexpilotharness'+c['run_id']+'a1t'+c['nonce']+'.slice/ibexpilotcontrol'+c['run_id']+'a1t'+c['nonce']+'.service\n').encode()
        if self.cg!=expected:reject('control_service_membership')
        self.count=0
        manager_contract(self.bus(['introspect',SERVICE,MANAGER,IFACE],True))
        if self.prop(MANAGER,IFACE,'Version')['data']!=c['componentObservation']['systemdBuildTag']:reject('control_profile')
    def bus(self,tail,xml=False):
        deadline(min(self.until,self.operation_until))
        args=['/usr/bin/busctl','--address=unix:path='+BUS,'--no-pager','--allow-interactive-authorization=no','--auto-start=no','--timeout=500ms']
        args+=['--xml-interface'] if xml else ['--json=short']
        raw,observation=direct_child(args+tail,min(self.until,self.operation_until,time.monotonic()+1),self.cg)
        self.last=observation
        return raw.decode('utf-8') if xml else bus_reply(tail,strict_json(raw))
    def call(self,method,sig='',*args):
        tail=['call',SERVICE,MANAGER,IFACE,method]
        if sig:tail += [sig,*args]
        return self.bus(tail)
    def prop(self,obj,interface,key):return self.bus(['get-property',SERVICE,obj,interface,key])
    def own(self):
        c=self.c;o=c['object']
        for key,want in [('Description',c['description']),('Transient',True),('StopWhenUnneeded',False)]:
            if self.prop(o,SERVICE+'.Unit',key).get('data')!=want:reject('control_unit_identity')
        iv=self.prop(o,SERVICE+'.Unit','InvocationID').get('data')
        if not isinstance(iv,list) or len(iv)!=16 or any(type(v)is not int or not 0<=v<=255 for v in iv) or not any(iv):reject('control_unit_identity')
        if self.invocation is not None and iv!=self.invocation:reject('control_unit_identity')
        self.invocation=iv
        if not (c['directory']/'workload-unit-identity.json').exists():
            cg=Path('/sys/fs/cgroup')/c['unit'];st=cg.lstat()
            if not stat.S_ISDIR(st.st_mode) or stat.S_ISLNK(st.st_mode):reject('control_unit_identity')
            root_receipt(c,'workload-unit-identity.json',{'run_id':c['run_id'],'attempt':'1','nonce':c['nonce'],'commit':c['commit'],'unit':c['unit'],'object':o,'description':c['description'],'invocation':iv,'cgroup':'/'+c['unit'],'device':st.st_dev,'inode':st.st_ino})
    def dispatch(self,op):
        c=self.c;o=c['object'];self.count+=1;self.last={};self.operation_until=min(self.until,time.monotonic()+1.5)
        if self.count>MAX_REQUESTS:reject('control_request_cap')
        if op=='list':return self.call('ListUnits')
        if op=='files':return self.call('ListUnitFilesByPatterns','asas','0','1',c['unit'])
        if op=='get':return self.call('GetUnit','s',c['unit'])
        if op=='version':return self.prop(MANAGER,IFACE,'Version')
        if op=='docker_pid':return self.prop('/org/freedesktop/systemd1/unit/docker_2eservice',SERVICE+'.Service','MainPID')
        if op=='introspect':return self.bus(['introspect',SERVICE,MANAGER,IFACE],True)
        if op in ['Description','Transient','StopWhenUnneeded','InvocationID','ActiveState']:
            value=self.prop(o,SERVICE+'.Unit',op)
            if op=='InvocationID' and self.created:self.own()
            return value
        if op=='ControlGroup':return self.prop(o,SERVICE+'.Slice',op)
        if op=='create':
            if self.created:reject('control_create_replay')
            rows=self.call('ListUnits').get('data')
            if not isinstance(rows,list) or len(rows)!=1 or not isinstance(rows[0],list):reject('control_protocol')
            if any(row[0]==c['unit'] for row in rows[0]):reject('control_unit_collision')
            if self.call('ListUnitFilesByPatterns','asas','0','1',c['unit']).get('data')!=[[]]:reject('control_unit_collision')
            root_receipt(c,'workload-create-intent.json',{'run_id':c['run_id'],'attempt':'1','nonce':c['nonce'],'commit':c['commit'],'unit':c['unit']})
            self.created=True # latched BEFORE uncertain manager-side mutation
            response=self.call('StartTransientUnit','ssa(sv)a(sa(sv))',c['unit'],'fail','6',
                'Description','s',c['description'],'StopWhenUnneeded','b','false',
                'MemoryMax','t','4294967296','MemorySwapMax','t','0','TasksMax','t','128','CPUQuotaPerSecUSec','t','2000000','0')
            self.own() # root-owned recovery identity, before responding to client
            return response
        if op=='stop':
            if not self.created or self.stop_attempted:reject('control_stop_replay')
            self.own()
            cg=Path('/sys/fs/cgroup')/c['unit']
            # Exact parent only; no removal if empty-tree observation is unknown.
            if cg.is_symlink() or (cg/'cgroup.procs').read_text().strip():reject('control_not_empty')
            values=dict(line.split() for line in (cg/'cgroup.events').read_text().splitlines())
            if values.get('populated')!='0' or (cg/'pids.current').read_text().strip()!='0':reject('control_not_empty')
            identity=json.loads(small(c['directory']/'workload-unit-identity.json'))
            if identity.get('assurance')!=assurance(c):reject('control_identity')
            st=cg.stat()
            if (st.st_dev,st.st_ino)!=(identity['device'],identity['inode']):reject('control_unit_identity')
            root_receipt(c,'workload-empty-observation.json',{'identity':identity,'populated':0,'pids_current':0})
            root_receipt(c,'workload-stop-intent.json',{'identity':identity})
            self.stop_attempted=True
            return self.call('StopUnit','ss',c['unit'],'fail')
        reject('control_operation')

def root_receipt(c,name,value):
    # Internal fixed names only. Never accepts a caller-supplied destination.
    allowed={'workload-create-intent.json','workload-unit-identity.json','workload-stop-intent.json','workload-empty-observation.json'}
    if name not in allowed:reject('control_receipt_name')
    value={**value,'assurance':assurance(c)}
    b=(json.dumps(value,sort_keys=True)+'\n').encode()
    c['budget'].guard(name,b)
    if len(b)>8192:reject('control_receipt_cap')
    with (c['directory']/name).open('xb') as f:
        if f.write(b)!=len(b):reject('control_receipt_write')
        f.flush();os.fsync(f.fileno())


def main():
    global CANCELLED
    # Root-owned immutable bootstrap directory; no path arrives over RPC.
    if os.geteuid()!=0 or len(sys.argv)!=2:reject('control_bootstrap')
    c=config(sys.argv[1]);secure(Path(__file__))
    if Path('/proc/self/exe').resolve()!=Path(c['profile']['pythonExecutable']):reject('control_bootstrap')
    if Path(__file__).resolve()!=c['directory']/'control_helper.py':reject('control_bootstrap')
    st=Path(BUS).lstat()
    if not stat.S_ISSOCK(st.st_mode) or st.st_uid!=0:reject('control_address')
    def cancel(*_):
        global CANCELLED
        CANCELLED=True
    signal.signal(signal.SIGTERM,cancel);signal.signal(signal.SIGINT,cancel)
    until=time.monotonic()+640;broker=Broker(c,until);failed=False;count=0;receipt_bytes=0
    spec=importlib.util.spec_from_file_location('root_effective',c['directory']/'effective_properties.py')
    effective=importlib.util.module_from_spec(spec);spec.loader.exec_module(effective)
    service_name='ibexpilotcontrol'+c['run_id']+'a1t'+c['nonce']+'.service'
    obj='/org/freedesktop/systemd1/unit/'+service_name.replace('.','_2e')
    def all_properties(interface):
        return effective.unpack(broker.bus(['call',SERVICE,obj,'org.freedesktop.DBus.Properties','GetAll','s',interface]))
    effective.service(c,all_properties(SERVICE+'.Unit'),all_properties(SERVICE+'.Service'))
    effective.kernel_limits(Path('/sys/fs/cgroup')/broker.cg.decode().strip()[4:])
    # No unlink/rebind/restart. Existing socket or claim is a collision.
    with (c['directory']/'helper.claim').open('xb') as f:
        f.write(json.dumps({'run_id':c['run_id'],'nonce':c['nonce'],'commit':c['commit'],**assurance(c)}).encode());f.flush();os.fsync(f.fileno())
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as server:
        server.bind(str(c['socket']));os.chown(c['socket'],0,c['client_gid']);os.chmod(c['socket'],0o660);server.listen(1)
        while not CANCELLED and time.monotonic()<until and count<MAX_REQUESTS:
            server.settimeout(min(.25,max(.001,until-time.monotonic())))
            try:connection,_=server.accept()
            except socket.timeout:continue
            count+=1
            with connection:
                op='unknown';reply=None
                try:
                    _,uid,_=struct.unpack('3i',connection.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
                    if uid!=c['client_uid']:reject('control_peer')
                    data=json.loads(recv_frame(connection,4096,min(until,time.monotonic()+.25)))
                    if set(data)!=set(['operation','run_id','attempt','nonce','commit','assuranceModel','policyReviewSHA256']) or any(data[k]!=c[k] for k in ['run_id','attempt','nonce','commit','assuranceModel','policyReviewSHA256']):reject('control_identity')
                    op=data['operation']
                    if not isinstance(op,str) or len(op)>32:reject('control_operation')
                    result=broker.dispatch(op);reply={'ok':True,'operation':op,'result':result}
                except BaseException as e:
                    failed=True;reply={'ok':False,'operation':op if isinstance(op,str) and len(op)<=32 else 'unknown','observation':{'error':fixed_error(e),'child':getattr(e,'observation',{})}}
                # Exclusive bounded sanitized log before response; neither raw stderr
                # nor arbitrary client strings are printed to Actions.
                reply['assurance']=assurance(c)
                record={'assurance':assurance(c),'sequence':count,'ok':reply['ok'],'child':getattr(broker,'last',{}),'error':reply.get('observation')}
                raw=(json.dumps(record)+'\n').encode()
                c['budget'].guard('receipt-'+str(count)+'.json',raw)
                receipt_bytes+=len(raw)
                if len(raw)>8192 or receipt_bytes>1048576:reject('control_receipt_cap')
                with (c['directory']/('receipt-'+str(count)+'.json')).open('xb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
                encoded=json.dumps(reply).encode()
                if len(encoded)>2*CAP:reject('control_output_cap')
                connection.settimeout(min(.25,max(.001,until-time.monotonic())))
                try:connection.sendall(encoded)
                except OSError:failed=True
                if failed:break # incomplete child/transport: no further mutations
    # Service manager owns final descendant cleanup; this exit is NOT its proof.
    return 1 if failed or CANCELLED else 0

if __name__=='__main__':
    try:code=main()
    except BaseException:code=1
    raise SystemExit(code)
