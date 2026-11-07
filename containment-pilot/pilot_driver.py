"""Disabled one-run coordinator. Only admitted fixed source and profile inputs.
The module entrypoint is never executed during local source preparation.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import selectors
import stat
import subprocess
import sys
import time
START=time.monotonic()
ROOT=Path(__file__).resolve().parent
BASE='529951f9818c301aae67d94e980deafe7495391f'
ENV={'PATH':'/usr/bin:/bin','LANG':'C','LC_ALL':'C','HOME':'/nonexistent','GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null','GIT_CONFIG_SYSTEM':'/dev/null','GIT_OPTIONAL_LOCKS':'0','DOCKER_API_VERSION':'1.48','DOCKER_HOST':'unix:///var/run/docker.sock'}
def digest(b):return hashlib.sha256(b).hexdigest()
def check_deadline(until):
 if until is not None and time.monotonic()>=until:raise RuntimeError('profile_deadline')

def read(p,cap=262144,until=None):
 check_deadline(until)
 fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  check_deadline(until);s=os.fstat(fd);check_deadline(until)
  if not stat.S_ISREG(s.st_mode) or s.st_size>cap:raise RuntimeError('input_type_size')
  data=bytearray()
  while len(data)<=cap:
   check_deadline(until);b=os.read(fd,min(65536,cap+1-len(data)));check_deadline(until)
   if not b:break
   data.extend(b);check_deadline(until)
  if len(data)>cap:raise RuntimeError('input_cap')
  result=bytes(data);check_deadline(until)
 finally:os.close(fd)
 check_deadline(until)
 return result

def file_digest(p,cap,until):
 data=read(p,cap,until);h=hashlib.sha256()
 for offset in range(0,len(data),65536):
  check_deadline(until);h.update(data[offset:offset+65536]);check_deadline(until)
 result=h.hexdigest();check_deadline(until)
 return result

def module(name):
 spec=importlib.util.spec_from_file_location('admitted_'+name,ROOT/(name+'.py'))
 obj=importlib.util.module_from_spec(spec);spec.loader.exec_module(obj);return obj
def write(p,b,budget=None):
 if budget:budget.guard(p,b)
 with p.open('xb') as f:
  if f.write(b)!=len(b):raise RuntimeError('short_write')
  f.flush();os.fsync(f.fileno())
def encode(v):return json.dumps(v,sort_keys=True,separators=(',',':')).encode()
DIAGNOSTIC_STAGE='startup'
CONTROL_FAILURE_TYPE=None
DIAGNOSTIC_STAGES=('startup','path','admission','event','source','profile','helper_load','assurance','ambient','image','owned_pins','git','modules','plan','finalize','operations')
EARLY_CODES=('runner_path_binding','disabled','event','identity','first_publication','source_pin','no_admitted_runtime_profile','vendor_image_identity','owned_source_pins','sole_parent','diff_boundary','mode','committed_bytes','input_type_size','input_cap','profile_deadline','git_deadline','git_exit','git_output_cap','git_cleanup_incomplete','argv','saved_plan_binding','stage_partition','stage_manifest_cap','short_write')
CONTROL_CODES=('control_assurance','control_deadline','control_profile','control_address','control_path','control_cap','control_protocol','control_container','control_command_failed')
def early_diagnostic(error,stage,control_type=None):
 # Only the exact class from the hash-verified helper is eligible for control codes.
 result={'schema':'ibex-early-diagnostic-v1','stage':stage if type(stage)is str and stage in DIAGNOSTIC_STAGES else 'unknown','code':'preflight_or_coordinator_failure','errno':None,'cleanupErrors':[],'verdict':'failed_or_unknown','resourceState':'unverified','cleanupState':'unverified'}
 args=error.args if isinstance(error,BaseException) else ()
 code=args[0] if type(args)is tuple and len(args)==1 and type(args[0])is str else None
 if control_type is not None and type(error)is control_type and code in CONTROL_CODES:result['code']=code
 elif isinstance(error,RuntimeError) and code in EARLY_CODES:result['code']=code
 number=error.errno if isinstance(error,OSError) else None
 if type(number)is int and -4095<=number<=4095:result['errno']=number
 items=getattr(error,'control_cleanup_errors',None)
 if type(items)is list:
  for item in items[:5]:
   if type(item)is not dict:continue
   op=item.get('operation');n=item.get('errno')
   if type(op)is not str or op not in ('git_kill','git_reap','git_selector_close','git_stdout_close','git_stderr_close'):op='unknown'
   result['cleanupErrors'].append({'operation':op,'errno':n if type(n)is int and -4095<=n<=4095 else None})
 return result

def preflight():
 global DIAGNOSTIC_STAGE,CONTROL_FAILURE_TYPE
 DIAGNOSTIC_STAGE='path'
 if str(ROOT)!='/home/runner/work/ibex-ai-platform/ibex-ai-platform/containment-pilot' or os.environ.get('RUNNER_TEMP')!='/home/runner/work/_temp':raise RuntimeError('runner_path_binding')
 DIAGNOSTIC_STAGE='admission'
 ad=json.loads(read(ROOT/'admission.json'))
 if ad.get('enabled') is not True:raise RuntimeError('disabled')
 DIAGNOSTIC_STAGE='event'
 if os.environ.get('GITHUB_REPOSITORY')!=ad['repository'] or os.environ.get('GITHUB_REF')!=ad['ref'] or os.environ.get('GITHUB_RUN_ATTEMPT')!='1' or os.environ.get('GITHUB_EVENT_NAME')!='push':raise RuntimeError('event')
 run=os.environ.get('GITHUB_RUN_ID','');commit=os.environ.get('GITHUB_SHA','')
 if not re.fullmatch(r'[0-9]{1,20}',run) or not re.fullmatch(r'[a-f0-9]{40}',commit) or ad['baseCommit']!=BASE:raise RuntimeError('identity')
 event=json.loads(read(os.environ['GITHUB_EVENT_PATH'],1048576))
 if event.get('created') is not True or event.get('deleted') is not False or event.get('before')!='0'*40:raise RuntimeError('first_publication')
 DIAGNOSTIC_STAGE='source'
 for name,want in ad['files'].items():
  if Path(name).name!=name or digest(read(ROOT/name))!=want:raise RuntimeError('source_pin')
 DIAGNOSTIC_STAGE='profile'
 support=json.loads(read(ROOT/'runtime-support.json'))
 if support.get('executionAllowed') is not True or len(support.get('profiles',[]))!=1:raise RuntimeError('no_admitted_runtime_profile')
 profile=support['profiles'][0]
 deadline=time.monotonic()+10
 DIAGNOSTIC_STAGE='helper_load'
 api=module('control_helper') # source bytes already checked against admission
 CONTROL_FAILURE_TYPE=api.ControlFailure
 DIAGNOSTIC_STAGE='assurance'
 api.assurance(ad);api.assurance(support)
 DIAGNOSTIC_STAGE='ambient'
 observed=api.ambient_profile(profile,deadline)
 DIAGNOSTIC_STAGE='image'
 observed['platform']=api.image_provenance(os.environ.get('ImageOS'),os.environ.get('ImageVersion'),os.uname().machine)
 # Fixed read-only client probes, unprivileged, within the existing shared deadline.
 tags=[]
 for executable in ('/usr/bin/busctl','/usr/bin/systemctl','/usr/bin/systemd-run'):
  raw,_=api.direct_child([executable,'--version'],min(deadline,time.monotonic()+1))
  tags.append(api.systemd_cli(raw.decode('ascii')));check_deadline(deadline)
 if len(set(tags))!=1:raise api.ControlFailure('control_profile')
 observed['systemdBuildTag']=tags[0]
 raw,_=api.direct_child(['/usr/bin/docker','version','--format','{{json .}}'],min(deadline,time.monotonic()+2))
 observed['docker']=api.docker_compatibility(api.strict_json(raw));check_deadline(deadline)
 DIAGNOSTIC_STAGE='owned_pins'
 if profile['ownedSourcePins']!={n:ad['files'][n] for n in api.OWNED_NAMES}:raise RuntimeError('owned_source_pins')
 check_deadline(deadline)
 DIAGNOSTIC_STAGE='git'
 # Closed read-only Git builtins, after vendor-policy and canonical metadata admission.
 def git_bytes(args):
  check_deadline(deadline)
  p=None;sel=None;primary=None;errors=[];out=bytearray();count=0
  until=min(deadline,time.monotonic()+2)
  try:
   p=subprocess.Popen(['/usr/bin/git',*args],cwd=ROOT.parent,env=ENV,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,close_fds=True)
   sel=selectors.DefaultSelector()
   for pipe in (p.stdout,p.stderr):os.set_blocking(pipe.fileno(),False);sel.register(pipe,selectors.EVENT_READ)
   while sel.get_map():
    if time.monotonic()>=until:raise RuntimeError('git_deadline')
    for key,_ in sel.select(.02):
     chunk=os.read(key.fileobj.fileno(),65536)
     if not chunk:sel.unregister(key.fileobj);continue
     count+=len(chunk)
     if count>1048576:raise RuntimeError('git_output_cap')
     if key.fileobj is p.stdout:out.extend(chunk)
   if p.wait(timeout=max(.001,until-time.monotonic()))!=0:raise RuntimeError('git_exit')
  except BaseException as error:primary=error
  finally:
   def attempt(operation,action):
    try:action()
    except BaseException as error:errors.append({'operation':operation,'errno':error.errno if isinstance(error,OSError) else None})
   if p is not None:
    def terminate():
     if p.poll() is None:p.kill()
    attempt('git_kill',terminate)
    attempt('git_reap',lambda:p.wait(timeout=.25))
   if sel is not None:attempt('git_selector_close',sel.close)
   if p is not None:
    for name in ('stdout','stderr'):
     pipe=getattr(p,name,None)
     if pipe is not None:attempt('git_'+name+'_close',pipe.close)
  if primary is not None or errors:
   error=primary if primary is not None else RuntimeError('git_cleanup_incomplete')
   error.control_cleanup_errors=errors
   raise error
  check_deadline(until)
  result=bytes(out);check_deadline(until)
  return result
 def git(args):return git_bytes(args).decode().strip()
 if git(['rev-parse','HEAD'])!=commit or git(['rev-list','--parents','-n','1',commit]).split()!=[commit,BASE]:raise RuntimeError('sole_parent')
 expected=sorted(['containment-pilot/'+n for n in ad['files']]+['containment-pilot/admission.json','.github/workflows/contained-pilot.yml'])
 if sorted(git(['diff-tree','--no-commit-id','--name-status','-r',BASE,commit]).splitlines())!=['A\t'+n for n in expected]:raise RuntimeError('diff_boundary')
 for name in expected:
  entry=git(['ls-tree',commit,'--',name])
  if not entry.startswith('100644 blob ') or entry.split('\t')[-1]!=name:raise RuntimeError('mode')
  blob=git_bytes(['cat-file','blob',commit+':'+name])
  if blob!=read(ROOT.parent/name,until=deadline):raise RuntimeError('committed_bytes')
 check_deadline(deadline)
 return ad,profile,run,commit,deadline,observed

def create_plan(ad,profile,run,commit,out,budget,builder,observed):
 nonce=secrets.token_hex(16);control='/run/ibexpilotcontrol'+run+'a1t'+nonce
 inp=Path('/home/runner/work/_temp')/('ibex-bootstrap-inputs-'+run+'-'+nonce)
 inp.mkdir(mode=0o700)
 names=['control_helper.py','parent_backend.py','independent_recovery.py','bootstrap_requests.py','effective_properties.py','evidence_budget.py']
 data={n:read(ROOT/n) for n in names};pins={n:digest(b) for n,b in data.items()}
 derived=json.loads(json.dumps(profile));derived['ownedSourcePins']=pins
 config={'run_id':run,'attempt':'1','commit':commit,'nonce':nonce,'client_uid':os.getuid(),'client_gid':os.getgid(),'bus_address':'unix:path=/run/dbus/system_bus_socket','profileSHA256':profile['profileSHA256'],'assuranceModel':profile['assuranceModel'],'policyReviewSHA256':profile['policyReviewSHA256'],'componentObservation':{k:observed[k] for k in ('systemdBuildTag','docker')}}
 data.update({'runtime-support.json':encode({'profiles':[derived],'executionAllowed':True,'assuranceModel':profile['assuranceModel'],'policyReviewSHA256':profile['policyReviewSHA256']}),'config.json':encode(config),'source-pins.json':encode(pins)})
 if sum(map(len,data.values()))>2080768 or any(len(b)>262144 for b in data.values()):raise RuntimeError('stage_partition')
 for n,b in data.items():write(inp/n,b)
 manifest={'files':{n:digest(b) for n,b in data.items()},'destination':control,'client_gid':os.getgid(),'assurance':{k:profile[k] for k in ('assuranceModel','policyReviewSHA256')}}
 raw=encode(manifest)
 if len(raw)>16384:raise RuntimeError('stage_manifest_cap')
 write(inp/'stage-manifest.json',raw)
 stage=read(ROOT/'stage_payload.py').decode()
 requests=builder.requests(run,nonce,commit,os.getgid(),profile['pythonExecutable'],stage,digest(stage.encode()),digest(raw))
 commands={k:requests[k] for k in ['stage','prepareStart','start','observe','recover']}
 py=[profile['pythonExecutable'],'-I','-B','-S']
 commands.update({'imagePull':['/usr/bin/timeout','--signal=TERM','--kill-after=2s','120s','/usr/bin/docker','pull','--platform','linux/amd64',ad['image']], 'synthetic':py+[str(ROOT/'supervisor.py')], 'userCleanup':py+[str(ROOT/'cleanup.py')]})
 env={**ENV,'IBEX_CONTROL_CONFIG':control+'/config.json'}
 for key in ['GITHUB_REPOSITORY','GITHUB_REF','GITHUB_EVENT_NAME','GITHUB_EVENT_PATH','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_SHA','RUNNER_TEMP']:env[key]=os.environ[key]
 plan={'wholeDeadlineMonotonic':START+1100,'commands':commands,'environment':env,'binding':{'run_id':run,'commit':commit,'attempt':'1','nonce':nonce,'assuranceModel':profile['assuranceModel'],'policyReviewSHA256':profile['policyReviewSHA256']},'stageManifestSHA256':digest(raw),'sourceHashes':ad['files'],'inputRoot':str(inp),'rootDirectory':control,'executionAllowed':True,'scope':'conditional authorized one-shot synthetic harness only','vendorProvenance':{'ImageOS':os.environ.get('ImageOS'),'ImageVersion':os.environ.get('ImageVersion'),'kernelRelease':os.uname().release}}
 raw=encode(plan);write(out/'sealed-request.json',raw,budget)
 return plan,digest(raw)

def verify_final(out,plan,ph,until):
 # 0 verified successful operations; 1 verified terminal failure; 2 invalid/unknown.
 # Classification never grants workload acceptance from cleanup success.
 try:
  check_deadline(until)
  v=json.loads(read(out/'final.json',32768,until));check_deadline(until)
  ops={'imagePull','stage','prepareStart','start','observe','synthetic','userCleanup','recover'}
  if type(v)is not dict or type(v.get('version'))is not int or v['version']!=2 or v.get('binding')!=plan['binding'] or v.get('sourceHashes')!=plan['sourceHashes'] or v.get('planSHA256')!=ph:return 2
  if type(v.get('passed'))is not bool or v.get('complete') is not True or v.get('uncertainClient') is not False or type(v.get('operations'))is not dict or set(v['operations'])!=ops:return 2
  all_success=True
  for op in sorted(ops):
   intent=json.loads(read(out/('intent-'+op+'.json'),1024,until))
   c=json.loads(read(out/('capture-'+op+'.json'),32768,until))
   check_deadline(until)
   if intent!={'operation':op,'planSHA256':ph} or type(c)is not dict or c.get('operation')!=op or c.get('planSHA256')!=ph or c.get('assurance')!={k:plan['binding'][k] for k in ('assuranceModel','policyReviewSHA256')}:return 2
   if any(c.get(k) is not True for k in ['timely','sudoEnvelopeTerminal','stdoutEOF','stderrEOF']) or type(c.get('exit'))is not int or type(c.get('success'))is not bool or c.get('errors')!=[]:return 2
   if c.get('persistenceUnconfirmed',False)is not False or c.get('uncertainClient',False)is not False:return 2
   summary=v['operations'][op]
   if type(summary)is not dict or type(summary.get('success'))is not bool or type(summary.get('exit'))is not int:return 2
   if c['success'] is not (c['exit']==0) or summary!={'success':c['success'],'exit':c['exit']}:return 2
   all_success=all_success and c['success']
  check_deadline(until)
  if v['passed'] and not all_success:return 2
  return 0 if v['passed'] and all_success else 1
 except (OSError,ValueError,TypeError,KeyError,RuntimeError):return 2

def main():
 global DIAGNOSTIC_STAGE
 ad,profile,run,commit,admission_deadline,observed=preflight()
 DIAGNOSTIC_STAGE='modules'
 budget=module('evidence_budget');builder=module('bootstrap_requests');cap=module('outer_capture')
 check_deadline(admission_deadline)
 out=Path(os.environ['RUNNER_TEMP'])/('ibex-bootstrap-'+run+'-1')
 final_only=sys.argv[1:]==['--finalize-only']
 if sys.argv[1:] and not final_only:raise RuntimeError('argv')
 finalize_deadline=time.monotonic()+40 if final_only else None
 if final_only:
  check_deadline(finalize_deadline)
  DIAGNOSTIC_STAGE='finalize'
  if not out.exists():return 1
  plan=json.loads(read(out/'sealed-request.json',131072,finalize_deadline));check_deadline(finalize_deadline)
  finalize_deadline=min(finalize_deadline,plan['wholeDeadlineMonotonic']+40);check_deadline(finalize_deadline)
  encoded=encode(plan);check_deadline(finalize_deadline)
  ph=digest(encoded);check_deadline(finalize_deadline)
  if plan['binding']['run_id']!=run or plan['binding']['commit']!=commit or plan['binding']['attempt']!='1' or plan['sourceHashes']!=ad['files'] or any(plan['binding'].get(k)!=ad[k] for k in ('assuranceModel','policyReviewSHA256')):raise RuntimeError('saved_plan_binding')
  if (out/'final.json').exists():
   status=verify_final(out,plan,ph,finalize_deadline)
   saved={};errors=[]
   for op in sorted(cap.OPS):
    try:
     value=json.loads(read(out/('capture-'+op+'.json'),32768,finalize_deadline))
     if value.get('planSHA256')!=ph or value.get('operation')!=op or value.get('assurance')!={k:plan['binding'][k] for k in ('assuranceModel','policyReviewSHA256')}:raise RuntimeError('saved_capture_binding')
     saved[op]=value
    except BaseException as error:errors.append(cap.exception_view(error,'final_read'))
   check_deadline(finalize_deadline)
   if errors:status=2
   if not cap.emit_terminal(cap.terminal_view(plan,ph,saved,errors,'finalize_only',status==0,status==2)):status=1
   check_deadline(finalize_deadline)
   return status # no replay, including malformed or failed final receipts
 else:
  check_deadline(admission_deadline)
  DIAGNOSTIC_STAGE='plan'
  out.mkdir(mode=0o700);plan,ph=create_plan(ad,profile,run,commit,out,budget,builder,observed)
 DIAGNOSTIC_STAGE='operations'
 until=finalize_deadline if final_only else plan['wholeDeadlineMonotonic'];results={};uncertain=False;started=False;passed=False;diagnostic_errors=[]
 def perform(op,seconds):
  nonlocal uncertain
  intent=out/('intent-'+op+'.json');record=out/('capture-'+op+'.json')
  if record.exists():
   value=json.loads(read(record,32768,until))
   if value['planSHA256']!=ph or value['operation']!=op or value.get('assurance')!={k:plan['binding'][k] for k in ('assuranceModel','policyReviewSHA256')}:raise RuntimeError('saved_capture_binding')
   if not value.get('sudoEnvelopeTerminal'):uncertain=True
   results[op]=value
   return value
  if intent.exists():uncertain=True;raise RuntimeError('prior_operation_uncertain')
  write(intent,encode({'operation':op,'planSHA256':ph}),budget)
  value=cap.capture(plan,ph,op,min(until,time.monotonic()+seconds),out,budget)
  if not value['sudoEnvelopeTerminal']:uncertain=True
  results[op]=value
  if value.get('persistenceUnconfirmed'):uncertain=True
  return value
 try:
  if not final_only:
   for op,seconds in [('imagePull',125),('stage',14),('prepareStart',14)]:
    if not perform(op,seconds)['success']:raise RuntimeError('setup_failed')
   service_start=time.monotonic();started=True
   start=perform('start',14)
   if uncertain:raise RuntimeError('start_uncertain_client')
   # A terminal failed client may have created the service: observe, never retry.
   if not perform('observe',14)['success'] or not start['success']:raise RuntimeError('start_observation_failed')
   work_seconds=min(600,service_start+610-time.monotonic(),until-time.monotonic()-40)
   if work_seconds<=0:raise RuntimeError('work_admission_deadline')
   passed=perform('synthetic',work_seconds)['success']
 except BaseException as error:
  passed=False;diagnostic_errors.append(cap.exception_view(error,'coordinator'))
 finally:
  # Reconcile all intent/capture pairs, including interrupted outer coordinator.
  for op in cap.OPS:
   i=out/('intent-'+op+'.json');p=out/('capture-'+op+'.json')
   try:
    if i.exists() and not p.exists():uncertain=True
    if p.exists():
     v=json.loads(read(p,32768,until))
     if v.get('planSHA256')!=ph or v.get('operation')!=op or v.get('assurance')!={k:plan['binding'][k] for k in ('assuranceModel','policyReviewSHA256')} or not v.get('sudoEnvelopeTerminal'):uncertain=True
   except BaseException as error:
    uncertain=True;diagnostic_errors.append(cap.exception_view(error,'reconcile'))
  cleanup_admitted=False
  try:cleanup_admitted=not uncertain and ((out/'intent-start.json').exists() or (out/'intent-prepareStart.json').exists())
  except BaseException as error:
   uncertain=True;diagnostic_errors.append(cap.exception_view(error,'reconcile'))
  if cleanup_admitted:
   try:
    user=perform('userCleanup',12) if (out/'intent-synthetic.json').exists() else {'success':True}
    if not uncertain:
     recovery=perform('recover',14);passed=passed and user['success'] and recovery['success']
   except BaseException as error:
    passed=False;diagnostic_errors.append(cap.exception_view(error,'cleanup'))
  else:passed=False
  passed=passed and time.monotonic()<until
  record={'version':2,'binding':plan['binding'],'sourceHashes':plan['sourceHashes'],'complete':set(results)==set(cap.OPS) and not uncertain,'passed':passed and not uncertain,'uncertainClient':uncertain,'planSHA256':ph,'operations':{k:{'success':v['success'],'exit':v['exit']} for k,v in results.items()},'scope':'synthetic only; never candidate acceptance','receiptProvisionalUntilExit':True,'verdictScope':'completed operation receipts, not proof of coordinator process exit'}
  try:
   if not (out/'final.json').exists():write(out/'final.json',encode(record),budget)
  except BaseException as error:
   passed=False;diagnostic_errors.append(cap.exception_view(error,'final_write'))
  # Console reporting is independent of final/raw file persistence; failure cannot grant PASS.
  try:
   if not cap.emit_terminal(cap.terminal_view(plan,ph,results,diagnostic_errors,'main',passed,uncertain)):passed=False
  except BaseException:
   passed=False
   cap.emit_terminal({'schema':'ibex-terminal-diagnostic-v1','verdict':'failed_or_unknown','diagnostics':'unavailable'})
 if time.monotonic()>=until:return 1
 return 0 if passed and not uncertain else 1

if __name__=='__main__':
 try:status=main()
 except BaseException as error:
  status=1
  # Bounded trusted diagnostics preserve pre-plan Git primary/cleanup failures.
  # No raw exception, child bytes, path or command is emitted.
  try:print('PILOT_COORDINATOR_ERROR '+json.dumps(early_diagnostic(error,DIAGNOSTIC_STAGE,CONTROL_FAILURE_TYPE)),flush=True)
  except BaseException:pass # diagnostics cannot turn failure into success
 raise SystemExit(status)
