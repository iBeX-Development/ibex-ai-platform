"""Closed-plan capture. Does not claim sudo's outer envelope is killed by timeout."""
import hashlib
import json
import os
import selectors
import subprocess
import time
from pathlib import Path
OPS={'stage','prepareStart','start','observe','imagePull','synthetic','userCleanup','recover'}
def capture(plan,plan_hash,op,until,output,budget):
 if {k:plan.get('binding',{}).get(k) for k in ('assuranceModel','policyReviewSHA256')}!={'assuranceModel':'managed-runner-vendor-trust-v1','policyReviewSHA256':'3e0170a902a379c3254e21058a2ddfb6fb76c8f67e7bf1c52ddf01d79bd5d7d6'}:raise RuntimeError('capture_assurance')
 encoded=json.dumps(plan,sort_keys=True,separators=(',',':')).encode()
 if plan.get('executionAllowed') is not True or hashlib.sha256(encoded).hexdigest()!=plan_hash or op not in OPS:raise RuntimeError('capture_binding')
 argv=plan['commands'][op];env=plan['environment'];claim=output/('capture-'+op+'.json')
 if claim.exists():raise RuntimeError('capture_collision')
 # Caller admits only its constructed sealed fixed plan, not caller-supplied argv.
 receipt={'assurance':{k:plan['binding'][k] for k in ('assuranceModel','policyReviewSHA256')},'operation':op,'planSHA256':plan_hash,'exit':None,'stdoutEOF':False,'stderrEOF':False,'timely':False,'managerOutcome':'unknown','errors':[],'sudoEnvelopeTerminal':False}
 streams={'stdout':{'bytes':0,'sha256':hashlib.sha256()},'stderr':{'bytes':0,'sha256':hashlib.sha256()}}
 p=None;sel=None;cap=1048576;overflow=False
 try:
  if time.monotonic()>=until:raise RuntimeError('capture_deadline')
  p=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,close_fds=True,env=env)
  sel=selectors.DefaultSelector()
  for key,pipe in [('stdout',p.stdout),('stderr',p.stderr)]:
   os.set_blocking(pipe.fileno(),False);sel.register(pipe,selectors.EVENT_READ,key)
  while sel.get_map() and time.monotonic()<until:
   for item,_ in sel.select(min(.025,max(0,until-time.monotonic()))):
    data=os.read(item.fileobj.fileno(),65536);key=item.data
    if not data:receipt[key+'EOF']=True;sel.unregister(item.fileobj);continue
    if sum(x['bytes'] for x in streams.values())+len(data)>cap:
     overflow=True;raise RuntimeError('capture_output_cap')
    streams[key]['bytes']+=len(data);streams[key]['sha256'].update(data)
  if sel.get_map():raise RuntimeError('capture_missing_EOF')
  receipt['exit']=p.wait(timeout=max(.001,until-time.monotonic()))
 except BaseException as e:
  receipt['errors'].append({'stage':'capture','kind':type(e).__name__,'errno':e.errno if isinstance(e,OSError) else None})
 finally:
  # Never signal a guessed privileged descendant or infer manager cancellation.
  for pipe in ([p.stdout,p.stderr] if p else []):
   try:pipe.close()
   except BaseException:receipt['errors'].append({'stage':'pipe_close'})
  if sel:
   try:sel.close()
   except BaseException:receipt['errors'].append({'stage':'selector_close'})
  if p:
   try:
    if receipt['exit'] is None:receipt['exit']=p.wait(timeout=max(.001,until-time.monotonic()))
   except BaseException:receipt['errors'].append({'stage':'sudo_or_client_exit_unconfirmed'})
  receipt['timely']=time.monotonic()<until
  receipt['sudoEnvelopeTerminal']=receipt['exit'] is not None and receipt['stdoutEOF'] and receipt['stderrEOF']
  receipt['success']=receipt['timely'] and receipt['sudoEnvelopeTerminal'] and receipt['exit']==0 and not overflow and not receipt['errors']
  receipt['managerOutcome']='requires_independent_identity_observation' if op in {'start','prepareStart','recover'} else 'not_inferred_from_exit'
  receipt['streams']={k:{'bytes':v['bytes'],'sha256':v['sha256'].hexdigest()} for k,v in streams.items()}
  receipt['receiptProvisionalUntilFinalDeadlineCheck']=True
  raw=(json.dumps(receipt,sort_keys=True)+'\n').encode();budget.guard(claim,raw)
  with claim.open('xb') as f:
   if f.write(raw)!=len(raw):raise RuntimeError('capture_receipt_write')
   f.flush();os.fsync(f.fileno())
  if time.monotonic()>=until:receipt['success']=False;receipt['timely']=False
 return receipt
