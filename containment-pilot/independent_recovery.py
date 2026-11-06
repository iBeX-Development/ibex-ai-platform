"""Independent fixed-operation root recovery. Never contacts the helper socket.
Future entry only through the exact reviewed sudo/root-timeout command.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys
import time

CAP=65536

def fail(code):raise RuntimeError(code)
def secure_read(path):
    p=Path(path)
    for x in [*reversed(p.parents),p]:
        s=x.lstat()
        if stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:fail('recovery_path')
    with p.open('rb') as f:b=f.read(CAP+1)
    if len(b)>CAP:fail('recovery_cap')
    return b

def save(c,name,data):
    if name not in {'helper-terminal-discovery.json','helper-start-intent.json','helper-unit-identity.json','helper-stop-intent.json','helper-before-stop.json','helper-final-observation.json','workload-recovery-stop-intent.json','workload-recovery-empty.json','recovery-claim.json','recovery-terminal.json','observe-terminal.json','prepare-start-terminal.json','helper-discovery.json','workload-discovery.json','harness-create-intent.json','harness-identity.json','harness-discovery.json','harness-stop-intent.json','harness-empty.json'}:fail('recovery_receipt_name')
    data={**data,'assurance':{k:c[k] for k in ('assuranceModel','policyReviewSHA256')}}
    b=(json.dumps(data,sort_keys=True)+'\n').encode()
    c['budget'].guard(name,b)
    if len(b)>CAP:fail('recovery_cap')
    with (c['directory']/name).open('xb') as f:
        if f.write(b)!=len(b):fail('recovery_write')
        f.flush();os.fsync(f.fileno())

def binding(c):return {k:c[k] for k in ['run_id','attempt','commit','nonce']}
def load(c,name):
    value=json.loads(secure_read(c['directory']/name))
    if value.get('assurance')!={k:c[k] for k in ('assuranceModel','policyReviewSHA256')}:fail('recovery_assurance')
    return value

def load_api(config_path):
    if not re.fullmatch(r'/run/ibexpilotcontrol[0-9]{1,20}a1t[a-f0-9]{32}/config.json',config_path):fail('recovery_path')
    root=Path(config_path).parent
    pins=json.loads(secure_read(root/'source-pins.json'))
    for name in ['control_helper.py','independent_recovery.py','bootstrap_requests.py','effective_properties.py','evidence_budget.py']:
        data=secure_read(root/name)
        if hashlib.sha256(data).hexdigest()!=pins.get(name):fail('recovery_pin')
    if Path(__file__).resolve()!=root/'independent_recovery.py':fail('recovery_path')
    spec=importlib.util.spec_from_file_location('pinned_control_api',root/'control_helper.py')
    api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
    c=api.config(config_path)
    spec=importlib.util.spec_from_file_location('pinned_effective_properties',root/'effective_properties.py')
    effective=importlib.util.module_from_spec(spec);spec.loader.exec_module(effective);api.effective=effective
    if Path('/proc/self/exe').resolve()!=Path(c['profile']['pythonExecutable']):fail('recovery_python')
    return api,c

class Manager:
    def __init__(self,api,c,until):self.api=api;self.c=c;self.until=until;self.observations=[]
    def bus(self,tail):
        self.api.deadline(self.until)
        argv=['/usr/bin/busctl','--address=unix:path=/run/dbus/system_bus_socket','--no-pager','--auto-start=no','--allow-interactive-authorization=no','--timeout=500ms', '--json=short',*tail]
        try:raw,obs=self.api.direct_child(argv,min(self.until,time.monotonic()+1))
        except self.api.ControlFailure as e:
            self.observations.append({'ok':False,'child':e.observation});raise
        self.observations.append({'ok':True,'child':obs})
        if len(self.observations)>64:fail('recovery_operation_cap')
        return json.loads(raw)
    def call(self,method,sig='',*args):
        tail=['call',self.api.SERVICE,self.api.MANAGER,self.api.IFACE,method]
        if sig:tail.extend([sig,*args])
        value=self.bus(tail)
        if not isinstance(value.get('data'),list) or len(value['data'])!=1:fail('recovery_protocol')
        return value['data'][0]
    def prop(self,obj,interface,key):return self.bus(['get-property',self.api.SERVICE,obj,interface,key])['data']
    def all(self,obj,interface):
        return self.api.effective.unpack(self.bus(['call',self.api.SERVICE,obj,'org.freedesktop.DBus.Properties','GetAll','s',interface]))
    def rows(self,name):
        rows=self.call('ListUnits')
        if not isinstance(rows,list) or any(not isinstance(x,list) or len(x)!=10 for x in rows):fail('recovery_protocol')
        result=[x for x in rows if x[0]==name]
        if len(result)>1:fail('recovery_identity')
        return result
    def same(self,i):
        rows=self.rows(i['unit'])
        if not rows:return None
        row=rows[0]
        if row[6]!=i['object']:fail('recovery_identity')
        for key,want in [('Description',i['description']),('Transient',True),('InvocationID',i['invocation'])]:
            if self.prop(i['object'],self.api.SERVICE+'.Unit',key)!=want:fail('recovery_identity')
        return row[3]
    def cgroup(self,i,allow_absent=False):
        path=Path('/sys/fs/cgroup')/i['cgroup'].lstrip('/')
        if path.is_symlink():fail('recovery_cgroup_identity')
        if not path.exists():
            if allow_absent:return None
            fail('recovery_cgroup_missing')
        s=path.stat()
        if (s.st_dev,s.st_ino)!=(i['device'],i['inode']):fail('recovery_cgroup_identity')
        def read(name):
            with (path/name).open('rb') as f:b=f.read(8193)
            if len(b)>8192:fail('recovery_cap')
            self.api.deadline(self.until);return b.decode('ascii').strip()
        events=dict(line.split() for line in read('cgroup.events').splitlines())
        if events.get('populated') not in ('0','1'):fail('recovery_cgroup_events')
        return {'populated':int(events['populated']),'procs':read('cgroup.procs').split(),'pids_current':int(read('pids.current'))}

def identity(c,i,helper=False):
    name='ibexpilotcontrol'+c['run_id']+'a1t'+c['nonce']+'.service' if helper else c['unit']
    desc='ibex-control:'+c['run_id']+':1:'+c['commit']+':'+c['nonce'] if helper else c['description']
    cg='/'+harness_name(c)+'/'+name if helper else '/'+name
    if any(i.get(k)!=v for k,v in binding(c).items()) or i.get('unit')!=name or i.get('description')!=desc or i.get('cgroup')!=cg:fail('recovery_identity')
    if i.get('object')!='/org/freedesktop/systemd1/unit/'+name.replace('.','_2e'):fail('recovery_identity')
    iv=i.get('invocation')
    if not isinstance(iv,list) or len(iv)!=16 or not any(iv) or any(type(v)is not int or not 0<=v<=255 for v in iv):fail('recovery_identity')
    if any(type(i.get(k))is not int or i[k]<0 for k in ['device','inode']):fail('recovery_identity')
    return i

def helper_name(c):return 'ibexpilotcontrol'+c['run_id']+'a1t'+c['nonce']+'.service'

def harness_name(c):return 'ibexpilotharness'+c['run_id']+'a1t'+c['nonce']+'.slice'
def harness_description(c):return 'ibex-harness:'+c['run_id']+':1:'+c['commit']+':'+c['nonce']
def harness_discover(c,m):
    intent=load(c,'harness-create-intent.json');name=harness_name(c)
    if intent.get('binding')!=binding(c) or intent.get('unit')!=name:fail('recovery_identity')
    rows=m.rows(name)
    if len(rows)!=1 or rows[0][3]!='active':fail('recovery_pending_harness_create')
    obj=rows[0][6];u=m.all(obj,m.api.SERVICE+'.Unit');p=m.all(obj,m.api.SERVICE+'.Slice');e=m.api.effective
    for key,kind,want in [('Description','s',harness_description(c)),('Transient','b',True),('StopWhenUnneeded','b',False)]:e.exact(u,key,kind,want)
    for key,want in [('MemoryMax',268435456),('MemorySwapMax',0),('TasksMax',16),('CPUQuotaPerSecUSec',1000000)]:e.exact(p,key,'t',want)
    e.exact(p,'ControlGroup','s','/'+name)
    iv=e.typed(u,'InvocationID','ay')
    if not isinstance(iv,list) or len(iv)!=16 or not any(iv) or any(type(x)is not int or not 0<=x<=255 for x in iv):fail('recovery_identity')
    cg=Path('/sys/fs/cgroup')/name;st=cg.lstat();m.api.effective.kernel_limits(cg)
    if not stat.S_ISDIR(st.st_mode):fail('recovery_cgroup_identity')
    i={**binding(c),'unit':name,'object':obj,'description':harness_description(c),'invocation':iv,'cgroup':'/'+name,'device':st.st_dev,'inode':st.st_ino}
    save(c,'harness-discovery.json',{'identity':i,'origin':'new_observation_after_sealed_create_intent'})
    return i

def harness_get(c,m):
    if (c['directory']/'harness-identity.json').exists():i=load(c,'harness-identity.json')
    elif (c['directory']/'harness-discovery.json').exists():i=load(c,'harness-discovery.json')['identity']
    else:i=harness_discover(c,m)
    if any(i.get(k)!=v for k,v in binding(c).items()) or i.get('unit')!=harness_name(c) or i.get('description')!=harness_description(c) or i.get('cgroup')!='/'+harness_name(c):fail('recovery_identity')
    if m.same(i)!='active':fail('recovery_harness_state')
    return i

def harness_finish(c,m):
    i=harness_get(c,m);current=m.cgroup(i)
    if current['populated']!=0 or current['pids_current']!=0 or current['procs']:fail('recovery_harness_not_empty')
    path=Path('/sys/fs/cgroup')/i['unit']
    # Boundary is kept active by StopWhenUnneeded=false until this observation.
    if m.prop(i['object'],m.api.SERVICE+'.Unit','StopWhenUnneeded') is not False:fail('recovery_harness_lifetime')
    counters={}
    for name in ['memory.events','pids.events']:
        with (path/name).open('rb') as f:raw=f.read(8193)
        if len(raw)>8192:fail('recovery_cap')
        counters[name]={key:int(value) for key,value in (line.split() for line in raw.decode('ascii').splitlines())}
    memory=counters['memory.events'];pids=counters['pids.events']
    if not {'max','oom','oom_kill'}<=memory.keys() or 'max' not in pids:fail('recovery_harness_counters')
    violation=any(memory[k]!=0 for k in ['max','oom','oom_kill']) or pids['max']!=0
    save(c,'harness-empty.json',{'identity':i,'observation':current,'counters':counters,'resourceViolation':violation,'scope':'hierarchical witness for helper service and every descendant'})
    intent=c['directory']/'harness-stop-intent.json'
    if intent.exists():fail('recovery_harness_stop_uncertain_no_retry')
    save(c,'harness-stop-intent.json',{'identity':i})
    m.call('StopUnit','ss',i['unit'],'fail')
    for _ in range(8):
        state=m.same(i);remaining=m.cgroup(i,True)
        if state in (None,'inactive') and remaining is None:return {'released':True,'observedKernelEmpty':True,'resourceViolation':violation,'identity':i}
        m.api.deadline(m.until);time.sleep(.025)
    fail('recovery_harness_stop_unconfirmed')

def prepare(c,m):
    name=helper_name(c)
    hn=harness_name(c)
    if m.rows(hn) or m.call('ListUnitFilesByPatterns','asas','0','1',hn):fail('recovery_collision')
    save(c,'harness-create-intent.json',{'binding':binding(c),'unit':hn})
    m.call('StartTransientUnit','ssa(sv)a(sa(sv))',hn,'fail','6','Description','s',harness_description(c),'StopWhenUnneeded','b','false','MemoryMax','t','268435456','MemorySwapMax','t','0','TasksMax','t','16','CPUQuotaPerSecUSec','t','1000000','0')
    hi=harness_discover(c,m);save(c,'harness-identity.json',hi)
    initial=m.cgroup(hi)
    if initial['populated']!=0 or initial['pids_current']!=0:fail('recovery_harness_not_empty')
    if m.rows(name) or m.call('ListUnitFilesByPatterns','asas','0','1',name):fail('recovery_collision')
    save(c,'helper-start-intent.json',{'binding':binding(c),'unit':name,'sourcePinsSHA256':hashlib.sha256(secure_read(c['directory']/'source-pins.json')).hexdigest()})
    return {'prepared':True,'started':False}

def observe(c,m):
    intent=load(c,'helper-start-intent.json')
    if intent.get('binding')!=binding(c) or intent.get('unit')!=helper_name(c) or intent.get('sourcePinsSHA256')!=hashlib.sha256(secure_read(c['directory']/'source-pins.json')).hexdigest():fail('recovery_identity')
    harness_get(c,m)
    rows=m.rows(helper_name(c))
    if len(rows)!=1 or rows[0][3]!='active':fail('recovery_helper_state')
    obj=rows[0][6];u=m.api.SERVICE+'.Unit';svc=m.api.SERVICE+'.Service'
    name=helper_name(c);desc='ibex-control:'+c['run_id']+':1:'+c['commit']+':'+c['nonce']
    if m.prop(obj,u,'Description')!=desc or m.prop(obj,u,'Transient') is not True:fail('recovery_identity')
    effective=m.api.effective.service(c,m.all(obj,u),m.all(obj,svc))
    cg=m.prop(obj,svc,'ControlGroup')
    if cg!='/'+harness_name(c)+'/'+name:fail('recovery_identity')
    path=Path('/sys/fs/cgroup')/cg.lstrip('/');st=path.lstat();m.api.effective.kernel_limits(path)
    if not stat.S_ISDIR(st.st_mode):fail('recovery_cgroup_identity')
    i={**binding(c),'unit':name,'object':obj,'description':desc,'invocation':m.prop(obj,u,'InvocationID'),'cgroup':cg,'device':st.st_dev,'inode':st.st_ino}
    identity(c,i,True);save(c,'helper-unit-identity.json',i)
    save(c,'helper-discovery.json',{'identity':i,'origin':'new_manager_observation_after_sealed_start_intent_not_preexisting_identity','effective':effective})
    return {'identity':i,'observed':m.cgroup(i)}

def discover_workload(c,m):
    intent=load(c,'workload-create-intent.json')
    if any(intent.get(k)!=v for k,v in binding(c).items()) or intent.get('unit')!=c['unit']:fail('recovery_identity')
    rows=m.rows(c['unit'])
    if not rows:fail('recovery_pending_create_absent_not_nonexecution')
    if rows[0][3]!='active':fail('recovery_pending_create_state')
    obj=rows[0][6];u=m.api.SERVICE+'.Unit';sl=m.api.SERVICE+'.Slice'
    unit=m.all(obj,u);props=m.all(obj,sl);m.api.effective.workload(c,unit,props)
    cg='/'+c['unit'];path=Path('/sys/fs/cgroup')/c['unit'];st=path.lstat()
    if not stat.S_ISDIR(st.st_mode):fail('recovery_cgroup_identity')
    i={**binding(c),'unit':c['unit'],'object':obj,'description':c['description'],'invocation':m.prop(obj,u,'InvocationID'),'cgroup':cg,'device':st.st_dev,'inode':st.st_ino}
    identity(c,i)
    save(c,'workload-discovery.json',{'identity':i,'origin':'new_manager_observation_after_sealed_create_intent_not_preexisting_identity'})
    return i


def discover_terminal_helper(c,m):
    """Recovery only: a terminal manager object is never workload admission."""
    intent=load(c,'helper-start-intent.json');name=helper_name(c)
    if intent.get('binding')!=binding(c) or intent.get('unit')!=name or intent.get('sourcePinsSHA256')!=hashlib.sha256(secure_read(c['directory']/'source-pins.json')).hexdigest():fail('recovery_identity')
    rows=m.rows(name)
    if not rows:fail('recovery_pending_start_absent_not_nonexecution')
    if rows[0][3]=='active':observe(c,m);return None
    if rows[0][3] not in ('inactive','failed'):fail('recovery_helper_state')
    obj=rows[0][6]
    if obj!='/org/freedesktop/systemd1/unit/'+name.replace('.','_2e'):fail('recovery_identity')
    u=m.api.SERVICE+'.Unit';svc=m.api.SERVICE+'.Service';e=m.api.effective
    unit=m.all(obj,u);service=m.all(obj,svc)
    effective=e.service(c,unit,service)
    iv=e.typed(unit,'InvocationID','ay')
    if not isinstance(iv,list) or len(iv)!=16 or not any(iv) or any(type(x)is not int or not 0<=x<=255 for x in iv):fail('recovery_identity')
    # Both manager job views must be idle. Absence cannot cancel a queued start.
    if e.typed(unit,'Job','(uo)')!=[0,'/']:fail('recovery_helper_pending_job')
    jobs=m.call('ListJobs')
    if not isinstance(jobs,list) or any(not isinstance(x,list) or len(x)!=6 for x in jobs):fail('recovery_protocol')
    if any(x[1]==name for x in jobs):fail('recovery_helper_pending_job')
    if e.typed(service,'MainPID','u')!=0:fail('recovery_helper_pid')
    cg=e.typed(service,'ControlGroup','s')
    if cg not in ('','/'+harness_name(c)+'/'+name):fail('recovery_identity')
    hi=harness_get(c,m);empty=m.cgroup(hi)
    if empty['populated']!=0 or empty['pids_current']!=0 or empty['procs']:fail('recovery_harness_not_empty')
    i={**binding(c),'unit':name,'object':obj,'description':'ibex-control:'+c['run_id']+':1:'+c['commit']+':'+c['nonce'],'invocation':iv}
    if m.same(i) not in ('inactive','failed') or m.prop(obj,u,'Job')!=[0,'/']:fail('recovery_helper_state')
    m.api.deadline(m.until)
    value={'identity':i,'managerTerminal':True,'observedKernelEmpty':True,'cleanupComplete':False,'harnessIdentity':hi,'harnessObservation':empty,'origin':'new_terminal_manager_discovery_after_sealed_start_intent','serviceCgroupIdentityPreviouslyRecorded':False,'effective':effective,'emptyWitness':'persistent_owned_harness; release still required'}
    save(c,'helper-terminal-discovery.json',value)
    return value

def helper_stop(c,m):
    if not (c['directory']/'helper-unit-identity.json').exists():
        terminal=discover_terminal_helper(c,m)
        if terminal is not None:return terminal
    i=identity(c,load(c,'helper-unit-identity.json'),True)
    own=Path('/proc/self/cgroup').read_text().strip()
    if own=='0::'+i['cgroup'] or own.startswith('0::'+i['cgroup']+'/'):fail('recovery_inside_helper')
    state=m.same(i);before=m.cgroup(i,True)
    intent=c['directory']/'helper-stop-intent.json'
    # The failed helper may already be terminal before independent recovery.
    # No StopUnit is needed or replayed in that case; missing kernel-empty
    # observation remains explicit uncertainty, not proof of cleanup.
    if state in (None,'inactive','failed') and before is None:
        if state is not None and m.prop(i['object'],m.api.SERVICE+'.Service','MainPID')!=0:fail('recovery_helper_pid')
        value={'identity':i,'managerTerminal':True,'observedKernelEmpty':False,'cgroupAbsent':True,'cleanupComplete':False,'reason':'already_terminal_without_kernel_empty_observation'}
        save(c,'helper-final-observation.json',value)
        return value
    if not intent.exists():
        if state is None or before is None:fail('recovery_helper_missing_without_stop_evidence')
        # Stopping this exactly owned helper service intentionally terminates its
        # processes; unlike the workload slice it need not be empty BEFORE stop.
        save(c,'helper-before-stop.json',{'identity':i,'observation':before})
        save(c,'helper-stop-intent.json',{'identity':i})
        m.call('StopUnit','ss',i['unit'],'fail')
    elif load(c,'helper-stop-intent.json').get('identity')!=i:fail('recovery_identity')
    empty=False
    for _ in range(8):
        state=m.same(i);current=m.cgroup(i,True)
        if current is not None and current['populated']==0 and current['pids_current']==0 and not current['procs']:empty=True
        if state in (None,'inactive','failed') and current is None:
            if state is not None and m.prop(i['object'],m.api.SERVICE+'.Service','MainPID')!=0:fail('recovery_helper_pid')
            break
        m.api.deadline(m.until);time.sleep(.025)
    terminal=state in (None,'inactive','failed') and current is None
    value={'identity':i,'managerTerminal':terminal,'observedKernelEmpty':empty,'cgroupAbsent':current is None,'cleanupComplete':terminal and empty}
    save(c,'helper-final-observation.json',value)
    # manager terminal is distinguished from observed kernel empty; never convert
    # disappearance/ENODEV into a fabricated populated=0 observation.
    return value

def workload_stop(c,m):
    if not (c['directory']/'workload-create-intent.json').exists():
        if m.rows(c['unit']):fail('recovery_unowned_workload')
        return {'released':True,'neverAdmittedByThisSealedHelper':True,'scope':'missing pre-mutation root intent plus closed helper and exact manager absence; not absence-alone nonexecution'}
    if (c['directory']/'workload-unit-identity.json').exists():i=identity(c,load(c,'workload-unit-identity.json'))
    elif (c['directory']/'workload-discovery.json').exists():i=identity(c,load(c,'workload-discovery.json')['identity'])
    else:i=discover_workload(c,m)
    create=load(c,'workload-create-intent.json')
    if any(create.get(k)!=v for k,v in binding(c).items()) or create.get('unit')!=i['unit']:fail('recovery_identity')
    primary=c['directory']/'workload-stop-intent.json';recovery=c['directory']/'workload-recovery-stop-intent.json'
    prior=primary if primary.exists() else recovery
    observation=c['directory']/('workload-empty-observation.json' if primary.exists() else 'workload-recovery-empty.json')
    if prior.exists():
        if json.loads(secure_read(prior)).get('identity')!=i:fail('recovery_identity')
        saved=json.loads(secure_read(observation))
        if saved.get('identity')!=i or saved.get('populated')!=0 or saved.get('pids_current')!=0:fail('recovery_empty_evidence')
        # Never repeat an uncertain manager stop; observe only below.
    else:
        if m.same(i)!='active':fail('recovery_workload_state')
        current=m.cgroup(i)
        if current['populated']!=0 or current['pids_current']!=0 or current['procs']:fail('recovery_workload_not_empty')
        # Retain exact parent event counters before releasing its lifetime.
        path=Path('/sys/fs/cgroup')/i['cgroup'].lstrip('/')
        counters={}
        for name in ['memory.events','pids.events']:
            with (path/name).open('rb') as f:data=f.read(8193)
            if len(data)>8192:fail('recovery_cap')
            counters[name]=data.decode('ascii')
        save(c,'workload-recovery-empty.json',{'identity':i,'populated':0,'pids_current':0,'counters':counters})
        save(c,'workload-recovery-stop-intent.json',{'identity':i})
        m.call('StopUnit','ss',i['unit'],'fail')
    for _ in range(8):
        state=m.same(i);current=m.cgroup(i,True)
        if state in (None,'inactive') and current is None:return {'released':True,'priorKernelEmpty':True,'identity':i}
        m.api.deadline(m.until);time.sleep(.025)
    fail('recovery_workload_stop_unconfirmed')

def main():
    if os.geteuid()!=0 or len(sys.argv)!=3 or sys.argv[1] not in ['prepare-start','observe','recover']:fail('recovery_invocation')
    began=time.monotonic();action=sys.argv[1];api,c=load_api(sys.argv[2]);m=Manager(api,c,began+8)
    result={'assurance':{k:c[k] for k in ('assuranceModel','policyReviewSHA256')},'action':action,'passed':False,'errors':[]}
    try:
        if action=='prepare-start':result['preparation']=prepare(c,m);result['passed']=True
        elif action=='observe':result['helper']=observe(c,m);result['passed']=True
        else:
            save(c,'recovery-claim.json',binding(c))
            # Stop exact helper first to prevent new parent mutations. A helper
            # transport failure cannot prevent independent parent reconciliation.
            helper_terminal=False
            try:
                result['helper']=helper_stop(c,m);helper_terminal=result['helper']['managerTerminal']
            except BaseException as e:result['errors'].append({'stage':'helper','error':api.fixed_error(e)})
            if not helper_terminal and not (c['directory']/'helper-start-intent.json').exists():
                try:
                    hi=harness_get(c,m);empty=m.cgroup(hi)
                    if not m.rows(helper_name(c)) and empty['populated']==0 and empty['pids_current']==0:
                        helper_terminal=True;result['helper']={'managerTerminal':True,'cleanupComplete':False,'scope':'no sealed start intent and observed empty owned harness; not absence-alone proof'}
                except BaseException as e:result['errors'].append({'stage':'partial_bootstrap','error':api.fixed_error(e)})
            if helper_terminal:
                try:result['workload']=workload_stop(c,m)
                except BaseException as e:result['errors'].append({'stage':'workload','error':api.fixed_error(e)})
            else:result['errors'].append({'stage':'workload','error':{'code':'helper_terminal_unconfirmed'}})
            if helper_terminal:
                try:
                    result['harness']=harness_finish(c,m)
                    result['helper']['cleanupComplete']=result['harness']['observedKernelEmpty']
                    result['helper']['emptyWitness']='persistent_owned_harness_slice'
                except BaseException as e:result['errors'].append({'stage':'harness','error':api.fixed_error(e)})
            result['passed']=not result['errors'] and result.get('helper',{}).get('cleanupComplete') is True and result.get('workload',{}).get('released') is True and result.get('harness',{}).get('released') is True and result.get('harness',{}).get('resourceViolation') is False
        api.deadline(m.until)
    except BaseException as e:result['passed']=False;result['errors'].append({'stage':'entry','error':api.fixed_error(e)})
    result['controlCommands']=m.observations
    result['snapshotProvisional']=True
    result['scope']='Cleanup observations only, never workload or containment acceptance. Actual process status after final deadline check is separate.'
    # This terminal record is independent of the failed helper's RPC/receipts.
    save(c,{'prepare-start':'prepare-start-terminal.json','observe':'observe-terminal.json','recover':'recovery-terminal.json'}[action],result)
    api.deadline(m.until)
    return 0 if result['passed'] else 1

if __name__=='__main__':
    try:status=main()
    except BaseException:status=1
    raise SystemExit(status)
