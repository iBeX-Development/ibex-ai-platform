"""Disabled proposal. Import defines functions only; no native action at import.
Only reviewed rootful systemd/cgroup-v2 path. No cgroupfs writes or daemon changes.
"""
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import subprocess
import time
import xml.etree.ElementTree as ET

SERVICE = 'org.freedesktop.systemd1'
MANAGER = '/org/freedesktop/systemd1'
INTERFACE = SERVICE + '.Manager'
ROOT = Path('/sys/fs/cgroup')
CODES = frozenset(['parent_deadline','parent_command','parent_output_cap','parent_json',
 'parent_capability','parent_profile','parent_api','parent_collision','parent_identity',
 'parent_lifetime','parent_controller','parent_limits','parent_membership','parent_counter',
 'parent_not_empty','parent_receipt','parent_mount','parent_read_cap','parent_release'])

def fail(code):
    raise RuntimeError(code)

_CONTROL=None
_HELPER=None

def control_context(until):
    global _CONTROL,_HELPER
    if _CONTROL is None:
        spec=importlib.util.spec_from_file_location('ibex_control_helper',Path(__file__).with_name('control_helper.py'))
        _HELPER=importlib.util.module_from_spec(spec);spec.loader.exec_module(_HELPER)
        _CONTROL=_HELPER.config(os.environ.get('IBEX_CONTROL_CONFIG',''),until)
    if time.monotonic()>=until:fail('parent_deadline')
    return _CONTROL

def run_command(args,until):
    # Root operation API never receives these Git/Docker client arguments.
    c=control_context(until)
    try:return _HELPER.local_command(args,until,c)
    except _HELPER.ControlFailure as error:
        e=RuntimeError('parent_command');e.parent_cleanup_errors=[error.observation];raise e from None


def read_small(path, until, cap=65536):
    if time.monotonic()>=until:fail('parent_deadline')
    with Path(path).open('rb') as f:data=f.read(cap+1)
    if len(data)>cap:fail('parent_read_cap')
    if time.monotonic()>=until:fail('parent_deadline')
    return data

def exclusive(path, value):
    value={**value,'assurance':_HELPER.assurance(control_context(time.monotonic()+2))}
    b=(json.dumps(value,sort_keys=True)+'\n').encode()
    control_context(time.monotonic()+2)['budget'].guard(path,b)
    if len(b)>65536:fail('parent_receipt')
    with Path(path).open('xb') as f:
        if f.write(b)!=len(b):fail('parent_receipt')
        f.flush();os.fsync(f.fileno())

def parsed(raw):
    try:return json.loads(raw)
    except (ValueError,UnicodeError):fail('parent_json')

class Parent:
    def __init__(self, output, run_id, attempt, commit, nonce, until, cancelled=lambda:False):
        if not re.fullmatch(r'[0-9]{1,20}',run_id) or attempt!='1' or not re.fullmatch(r'[a-f0-9]{40}',commit) or not re.fullmatch(r'[a-f0-9]{32}',nonce):fail('parent_identity')
        self.output=Path(output);self.until=until;self.cancelled=cancelled;self.cleaning=False
        self.name='ibexpilot'+run_id+'a'+attempt+'t'+nonce+'.slice'
        self.description='ibex:'+run_id+':'+attempt+':'+commit+':'+nonce
        context=control_context(until)
        self.identity={'assurance':_HELPER.assurance(context),'run_id':run_id,'attempt':attempt,'commit':commit,'nonce':nonce,'name':self.name,'description':self.description}
        self.owned=False;self.attempted=False;self.cid=None;self.path=None;self.last=None
        self.violation=False;self.operation='parent_capability';self.released=False
    def check(self):
        if time.monotonic()>=self.until or (self.cancelled() and not self.cleaning):fail('parent_deadline')
    def command(self,args):
        self.check();b=run_command(args,min(self.until,time.monotonic()+2));self.check();return b
    def rpc(self,operation):
        self.check();c=control_context(self.until)
        if any(c[k]!=self.identity[k] for k in ('run_id','attempt','commit','nonce')):fail('parent_identity')
        try:r=_HELPER.request(c,operation,min(self.until,time.monotonic()+2))
        except _HELPER.ControlFailure as error:
            e=RuntimeError('parent_command');e.parent_cleanup_errors=[error.observation];raise e from None
        self.check();return r
    def call(self,method,signature,*args):
        mapping={('ListUnits','',()):'list',('ListUnitFilesByPatterns','asas',('0','1',self.name)):'files',
                 ('GetUnit','s',(self.name,)):'get',('StopUnit','ss',(self.name,'fail')):'stop'}
        props=('Description','s',self.description,'StopWhenUnneeded','b','false','MemoryMax','t','4294967296',
               'MemorySwapMax','t','0','TasksMax','t','128','CPUQuotaPerSecUSec','t','2000000')
        mapping[('StartTransientUnit','ssa(sv)a(sa(sv))',(self.name,'fail','6',*props,'0'))]='create'
        op=mapping.get((method,signature,args))
        if op is None:fail('parent_api')
        r=self.rpc(op)
        if not isinstance(r.get('data'),list) or len(r['data'])!=1:fail('parent_api')
        return {'type':r.get('type'),'data':r['data'][0]}
    def loaded_units(self):
        # ListUnits observes loaded units; unlike ListUnitsByNames it does not load.
        response=self.call('ListUnits','')
        rows=response.get('data')
        if response.get('type')!='a(ssssssouso)' or not isinstance(rows,list):fail('parent_api')
        if any(not isinstance(row,list) or len(row)!=10 or not isinstance(row[0],str) for row in rows):fail('parent_api')
        matches=[row for row in rows if row[0]==self.name]
        if len(matches)>1:fail('parent_identity')
        return matches
    def prop(self,obj,interface,key,kind):
        owned='/org/freedesktop/systemd1/unit/'+self.name.replace('.','_2e')
        mapping={(MANAGER,INTERFACE,'Version','s'):'version',
                 ('/org/freedesktop/systemd1/unit/docker_2eservice',SERVICE+'.Service','MainPID','u'):'docker_pid',
                 (owned,SERVICE+'.Slice','ControlGroup','s'):'ControlGroup'}
        for k,t in [('Description','s'),('Transient','b'),('StopWhenUnneeded','b'),('InvocationID','ay'),('ActiveState','s')]:mapping[(owned,SERVICE+'.Unit',k,t)]=k
        op=mapping.get((obj,interface,key,kind))
        if op is None:fail('parent_api')
        r=self.rpc(op)
        if r.get('type')!=kind:fail('parent_api')
        return r['data']
    def text(self,name):
        self.check();return read_small(self.path/name,self.until).decode('ascii').strip()
    def table(self,name):
        rows=[line.split() for line in self.text(name).splitlines()]
        if any(len(r)!=2 or not r[1].isdigit() for r in rows) or len({r[0] for r in rows})!=len(rows):fail('parent_counter')
        return {k:int(v) for k,v in rows}
    def preflight(self,profiles):
        self.operation='parent_capability'
        info=parsed(self.command(['/usr/bin/docker','info','--format','{{json .}}']))
        if info.get('CgroupDriver')!='systemd' or str(info.get('CgroupVersion'))!='2' or any('rootless' in x for x in info.get('SecurityOptions',[])):fail('parent_capability')
        manager_version=self.prop(MANAGER,INTERFACE,'Version','s')
        c=control_context(self.until)
        if c['profile'].get('vendorBaseline',{}).get('identity',{}).get('systemdVersion')!=manager_version:fail('parent_profile')
        # Documentation/version labels alone never populate this reviewed allowlist.
        measured={'kernelRelease':os.uname().release,
                  'kernelNotesSHA256':hashlib.sha256(read_small('/sys/kernel/notes',self.until,1048576)).hexdigest(),
                  'systemdVersion':manager_version,'dockerVersion':info.get('ServerVersion')}
        matches=[p for p in profiles if p==c['profile']]
        if len(matches)!=1:fail('parent_profile')
        expected=c['profile']['vendorBaseline']['identity']
        if any(measured[k]!=expected[k] for k in expected):fail('parent_profile')
        measured['assurance']=_HELPER.assurance(c)
        measured['kernelNotesAssurance']='observation-only-not-expected-byte-proof'
        mounts=read_small('/proc/self/mountinfo',self.until,1048576).decode().splitlines()
        rows=[line for line in mounts if line.split(' ')[4]=='/sys/fs/cgroup']
        if len(rows)!=1 or ' - cgroup2 ' not in rows[0]:fail('parent_mount')
        opts=set(rows[0].split(' ')[5].split(','))|set(rows[0].split(' - ')[1].split(' ')[2].split(','))
        if opts & {'memory_localevents','pids_localevents'}:fail('parent_profile')
        # Require the real manager methods/signatures, not executable presence.
        xml=self.rpc('introspect')
        node=ET.fromstring(xml);methods={m.get('name'):''.join(a.get('type','') for a in m.findall('arg') if a.get('direction','in')=='in') for m in node.findall('.//method')}
        for n,s in {'StartTransientUnit':'ssa(sv)a(sa(sv))','StopUnit':'ss','GetUnit':'s','ListUnits':'','ListUnitFilesByPatterns':'asas'}.items():
            if methods.get(n)!=s:fail('parent_api')
        self.profile=measured;self.mount_options=sorted(opts)
    def create(self):
        self.operation='parent_collision'
        # Missing, failed and inactive units alike are collisions; never replace.
        if self.loaded_units():fail('parent_collision')
        files=self.call('ListUnitFilesByPatterns','asas','0','1',self.name)
        if files.get('data')!=[]:fail('parent_collision')
        exclusive(self.output/'parent-intent.json',self.identity)
        self.operation='parent_lifetime';self.attempted=True
        props=['Description','s',self.description,'StopWhenUnneeded','b','false',
               'MemoryMax','t','4294967296','MemorySwapMax','t','0','TasksMax','t','128',
               'CPUQuotaPerSecUSec','t','2000000']
        job=self.call('StartTransientUnit','ssa(sv)a(sa(sv))',self.name,'fail','6',*props,'0')
        if job.get('type')!='o' or not str(job.get('data','')).startswith('/org/freedesktop/systemd1/job/'):fail('parent_api')
        # No retry of uncertain create. Subsequent read polls only the exact unit.
        for _ in range(40):
            r=self.call('GetUnit','s',self.name)
            if r.get('type')!='o':fail('parent_api')
            obj=r['data']
            state=self.prop(obj,SERVICE+'.Unit','ActiveState','s')
            if state=='active':break
            if state not in ('activating',):fail('parent_lifetime')
            time.sleep(.025);self.check()
        else:fail('parent_lifetime')
        if self.prop(obj,SERVICE+'.Unit','Description','s')!=self.description or self.prop(obj,SERVICE+'.Unit','Transient','b') is not True or self.prop(obj,SERVICE+'.Unit','StopWhenUnneeded','b') is not False:fail('parent_identity')
        invocation=self.prop(obj,SERVICE+'.Unit','InvocationID','ay')
        if not isinstance(invocation,list) or len(invocation)!=16 or any(type(x)!=int or not 0<=x<=255 for x in invocation) or not any(invocation):fail('parent_identity')
        cg=self.prop(obj,SERVICE+'.Slice','ControlGroup','s')
        if cg!='/'+self.name:fail('parent_identity')
        self.path=ROOT/self.name
        if self.path.is_symlink():fail('parent_identity')
        st=self.path.stat();self.identity.update({'object':obj,'invocation':invocation,'cgroup':cg,'device':st.st_dev,'inode':st.st_ino,'profile':self.profile,'mountOptions':self.mount_options})
        # Valid ownership is latched before persistence; a failed write still requires local cleanup.
        self.owned=True
        exclusive(self.output/'owned-parent.json',self.identity)
        self.verify();initial=self.sample()
        if initial['populated']!=0 or initial['pids_current']!=0:fail('parent_not_empty')
        self.check_layout()
        exclusive(self.output/'parent-initial.json',initial)
    def verify(self):
        self.operation='parent_identity'
        if not self.owned or self.released:fail('parent_identity')
        self.check();i=self.identity;obj=i['object']
        if self.call('GetUnit','s',self.name).get('data')!=obj:fail('parent_identity')
        for key,kind,want in [('Description','s',self.description),('Transient','b',True),('StopWhenUnneeded','b',False),('InvocationID','ay',i['invocation']),('ActiveState','s','active')]:
            if self.prop(obj,SERVICE+'.Unit',key,kind)!=want:fail('parent_lifetime')
        if self.prop(obj,SERVICE+'.Slice','ControlGroup','s')!=i['cgroup']:fail('parent_identity')
        st=self.path.stat()
        if self.path.is_symlink() or (st.st_dev,st.st_ino)!=(i['device'],i['inode']):fail('parent_identity')
        self.operation='parent_controller'
        if self.text('cgroup.type')!='domain' or not {'memory','pids','cpu'}<=set(self.text('cgroup.controllers').split()):fail('parent_controller')
        if self.text('cgroup.procs'):fail('parent_membership')
        self.operation='parent_limits'
        for n,v in [('memory.max','4294967296'),('memory.swap.max','0'),('pids.max','128')]:
            if self.text(n)!=v:fail('parent_limits')
        q,p=self.text('cpu.max').split()
        if not q.isdigit() or not p.isdigit() or int(p)<=0 or not 0<int(q)<=2*int(p):fail('parent_limits')
        for pid in [os.getpid(),os.getppid()]:self.exclude(pid)
        daemon=self.prop('/org/freedesktop/systemd1/unit/docker_2eservice',SERVICE+'.Service','MainPID','u')
        if type(daemon)!=int or daemon<=0:fail('parent_capability')
        self.exclude(daemon)
    def exclude(self,pid):
        v=read_small('/proc/'+str(pid)+'/cgroup',self.until).decode().strip()
        if not v.startswith('0::/') or '\n' in v:fail('parent_membership')
        path=v[3:]
        if path==self.identity['cgroup'] or path.startswith(self.identity['cgroup']+'/'):fail('parent_membership')
    def check_layout(self):
        self.operation='parent_membership';self.check()
        names=[]
        with os.scandir(self.path) as entries:
            for number,e in enumerate(entries):
                if number>=256:fail('parent_membership')
                if e.is_symlink():fail('parent_membership')
                if e.is_dir(follow_symlinks=False):names.append(e.name)
        allowed=[] if self.cid is None else ['docker-'+self.cid+'.scope']
        if any(n not in allowed for n in names):fail('parent_membership')
        if names:
            child=self.path/names[0]
            with os.scandir(child) as entries:
                for number,e in enumerate(entries):
                    if number>=256 or e.is_symlink() or e.is_dir(follow_symlinks=False):fail('parent_membership')
        self.check()
    def bind_container(self,cid,state,pid):
        if not re.fullmatch(r'[a-f0-9]{64}',cid) or state['Id']!=cid or state['Config']['Labels'].get('ibex.pilot')!=self.identity['nonce'] or state['HostConfig'].get('CgroupParent')!=self.name:fail('parent_identity')
        self.cid=cid;self.verify();self.check_layout()
        # Propagation is required only with the owned child present, before GO.
        if not {'memory','pids','cpu'}<=set(self.text('cgroup.subtree_control').split()):fail('parent_controller')
        expected=self.identity['cgroup']+'/docker-'+cid+'.scope'
        if read_small('/proc/'+str(pid)+'/cgroup',self.until).decode().strip()!='0::'+expected:fail('parent_membership')
        child=ROOT/expected.lstrip('/')
        if child.is_symlink() or child.parent!=self.path:fail('parent_membership')
        self.identity['container_id']=cid
        exclusive(self.output/'parent-container-binding.json',self.identity)
        return child
    def sample(self, reject_violation=True):
        self.operation='parent_counter';self.check()
        st=self.path.stat()
        if (st.st_dev,st.st_ino)!=(self.identity['device'],self.identity['inode']):fail('parent_identity')
        m=self.table('memory.events');p=self.table('pids.events');e=self.table('cgroup.events')
        if not {'max','oom','oom_kill'}<=m.keys() or 'max' not in p or e.get('populated') not in (0,1):fail('parent_counter')
        if any(m[k]!=0 for k in ('max','oom','oom_kill')) or p['max']!=0:self.violation=True
        value={'memory.events':m,'pids.events':p,'populated':e['populated'],'pids_current':int(self.text('pids.current')),'violation':self.violation}
        if self.last:
            for section in ('memory.events','pids.events'):
                if any(value[section].get(k,-1)<v for k,v in self.last[section].items()):fail('parent_counter')
        self.last=value
        if self.violation and reject_violation:fail('parent_counter')
        return value
    def finish(self):
        self.verify();self.check_layout();value=self.sample(reject_violation=False)
        if value['populated']!=0 or value['pids_current']!=0:fail('parent_not_empty')
        exclusive(self.output/'parent-final.json',{'identity':self.identity,'observation':value})
        return value
    def release(self, role='primary'):
        if role not in ('primary','fallback'):fail('parent_release')
        # Immutable role-specific claims prevent replay within either role.
        exclusive(self.output/('parent-release-'+role+'-claim.json'),{'identity':self.identity,'role':role})
        earlier=self.output/'parent-release-primary-stop-intent.json'
        if role=='fallback' and earlier.exists():
            if earlier.is_symlink():fail('parent_identity')
            saved=parsed(read_small(earlier,self.until))
            if saved.get('identity')!=self.identity:fail('parent_identity')
            # StopUnit may have succeeded despite transport failure. Observe only;
            # never issue another stop for an uncertain earlier operation.
            self.observe_release(role)
            return
        self.verify();self.check_layout();value=self.sample(reject_violation=False)
        if value['populated']!=0 or value['pids_current']!=0:fail('parent_not_empty')
        exclusive(self.output/('parent-release-'+role+'-observation.json'),{'identity':self.identity,'observation':value})
        exclusive(self.output/('parent-release-'+role+'-stop-intent.json'),{'identity':self.identity})
        self.operation='parent_release'
        response=self.call('StopUnit','ss',self.name,'fail')
        if response.get('type')!='o':fail('parent_release')
        self.observe_release(role)
    def released_state(self,role):
        # Same rule for primary completion and the independent fallback fast path.
        if role not in ('primary','fallback'):fail('parent_release')
        primary=self.output/'parent-release-primary-stop-intent.json'
        chosen='primary' if primary.exists() else role
        intent=self.output/('parent-release-'+chosen+'-stop-intent.json')
        observation=self.output/('parent-release-'+chosen+'-observation.json')
        for p in (intent,observation):
            if p.is_symlink():fail('parent_identity')
        claim=parsed(read_small(intent,self.until));saved=parsed(read_small(observation,self.until))
        if claim.get('identity')!=self.identity or saved.get('identity')!=self.identity or saved.get('observation',{}).get('populated')!=0 or saved.get('observation',{}).get('pids_current')!=0:fail('parent_identity')
        self.check();units=self.loaded_units()
        if units:
            row=units[0]
            if row[6]!=self.identity['object']:fail('parent_identity')
            for key,kind,want in [('Description','s',self.description),('Transient','b',True),('InvocationID','ay',self.identity['invocation'])]:
                if self.prop(row[6],SERVICE+'.Unit',key,kind)!=want:fail('parent_identity')
        if self.path.is_symlink():fail('parent_identity')
        if self.path.exists():
            st=self.path.stat()
            if (st.st_dev,st.st_ino)!=(self.identity['device'],self.identity['inode']):fail('parent_identity')
            return False,observation.name
        return (not units or units[0][3]=='inactive'),observation.name
    def observe_release(self,role):
        for _ in range(40):
            complete,observation=self.released_state(role)
            if complete:
                self.released=True
                exclusive(self.output/'parent-released.json',{'identity':self.identity,'released':True,'role':role,'priorEmptyObservation':observation})
                return
            time.sleep(.025)
        fail('parent_release')
    @classmethod
    def recover(cls,output,run,attempt,commit,until):
        p=Path(output)/'owned-parent.json'
        if p.is_symlink():fail('parent_identity')
        d=parsed(read_small(p,until))
        obj=cls(output,run,attempt,commit,d['nonce'],until)
        for k in ('name','description','run_id','attempt','commit'):
            if d.get(k)!=obj.identity[k]:fail('parent_identity')
        if d.get('cgroup')!='/'+obj.name:fail('parent_identity')
        obj.identity=d;obj.path=ROOT/obj.name;obj.owned=True;obj.cleaning=True
        bound=Path(output)/'parent-container-binding.json'
        if bound.exists():
            b=parsed(read_small(bound,until))
            if any(b.get(k)!=v for k,v in d.items()) or not re.fullmatch(r'[a-f0-9]{64}',b.get('container_id','')):fail('parent_identity')
            obj.cid=b['container_id'];obj.identity=b
        container=Path(output)/'owned-container.json'
        if obj.cid is None and container.exists():
            c=parsed(read_small(container,until))
            if c.get('run_id')!=run or c.get('attempt')!=attempt or c.get('source_commit')!=commit or c.get('token')!=d['nonce'] or not re.fullmatch(r'[a-f0-9]{64}',c.get('container_id','')):fail('parent_identity')
            obj.cid=c['container_id']
        # An earlier uncertain stop may already have removed the unit. Release
        # reconciles the exact persisted identity without attempting a second stop.
        if not (obj.output/'parent-release-primary-stop-intent.json').exists():obj.verify()
        return obj