"""Closed-plan capture. Does not claim sudo's outer envelope is killed by timeout."""
import hashlib
import json
import os
import selectors
import subprocess
import time
from pathlib import Path
OPS={'stage','prepareStart','start','observe','imagePull','synthetic','userCleanup','recover'}

# Diagnostic data is advisory. Never participates in success or ownership decisions.
DIAGNOSTIC_CODES = frozenset(['NOT_ACTIVATED', 'argv', 'assurance_binding', 'attempt_identity', 'base_binding', 'bind_inventory', 'binding', 'capture_assurance', 'capture_binding', 'capture_collision', 'capture_deadline', 'capture_missing_EOF', 'capture_output_cap', 'capture_receipt_write', 'cgroup_path', 'cgroup_v2_required', 'checkout_head_binding', 'cleanup_deadline', 'commit_binding', 'committed_bytes', 'committed_diff_allowlist', 'committed_mode', 'container_id', 'container_identity', 'container_not_clean', 'control_cleanup_incomplete', 'control_command_failed', 'control_deadline', 'control_deadline_or_cancel', 'control_exit_nonzero', 'control_internal', 'control_output_cap', 'control_remote_failure', 'cpu_limit', 'descendant_membership', 'diff_boundary', 'disabled', 'early_exit', 'effective_address_family', 'effective_dictionary', 'effective_environment_or_path', 'effective_exec', 'effective_extra_command', 'effective_kernel_cpu', 'effective_kernel_limit', 'effective_mismatch', 'effective_missing_type', 'effective_reply', 'empty_pins', 'event', 'event_binding', 'event_cap', 'event_size', 'evidence_budget_unbound', 'evidence_cap', 'evidence_name', 'evidence_partition_cap', 'evidence_short_write', 'first_publication', 'first_publication_only', 'git_cleanup_incomplete', 'git_deadline', 'git_exit', 'git_output_cap', 'identity', 'image_unpinned', 'input_cap', 'input_type_size', 'legacy_profile', 'memory_limit', 'mode', 'mount_or_network_mode', 'no_admitted_runtime_profile', 'no_immutable_container_identity', 'no_tree_observation', 'owned_source_pins', 'ownership', 'parent_api', 'parent_capability', 'parent_collision', 'parent_command', 'parent_controller', 'parent_counter', 'parent_deadline', 'parent_identity', 'parent_json', 'parent_lifetime', 'parent_limits', 'parent_membership', 'parent_mount', 'parent_not_empty', 'parent_profile', 'parent_read_cap', 'parent_receipt', 'parent_release', 'payload_root_binding', 'pid_limit', 'pin_allowlist', 'pin_drift', 'pin_path', 'pipe_eof_unconfirmed', 'platform', 'prior_operation_uncertain', 'profile_deadline', 'raw_output_cap', 'receipt_cap', 'recovery_assurance', 'recovery_cap', 'recovery_cgroup_events', 'recovery_cgroup_identity', 'recovery_cgroup_missing', 'recovery_collision', 'recovery_empty_evidence', 'recovery_harness_counters', 'recovery_harness_lifetime', 'recovery_harness_not_empty', 'recovery_harness_state', 'recovery_harness_stop_uncertain_no_retry', 'recovery_harness_stop_unconfirmed', 'recovery_helper_missing_without_stop_evidence', 'recovery_helper_pending_job', 'recovery_helper_pid', 'recovery_helper_state', 'recovery_identity', 'recovery_inside_helper', 'recovery_invocation', 'recovery_operation_cap', 'recovery_path', 'recovery_pending_create_absent_not_nonexecution', 'recovery_pending_create_state', 'recovery_pending_harness_create', 'recovery_pending_start_absent_not_nonexecution', 'recovery_pin', 'recovery_protocol', 'recovery_python', 'recovery_receipt_name', 'recovery_unowned_workload', 'recovery_workload_not_empty', 'recovery_workload_state', 'recovery_workload_stop_unconfirmed', 'recovery_write', 'ref_binding', 'repo_binding', 'rerun_refused', 'resource_handles_missing', 'resource_violation_latched', 'runner_path_binding', 'saved_capture_binding', 'saved_plan_binding', 'setup_failed', 'short_write', 'single_commit_base_required', 'sole_parent', 'source_pin', 'stage_assurance', 'stage_binding', 'stage_changed_or_cap', 'stage_file_type_size', 'stage_hash', 'stage_invocation', 'stage_manifest', 'stage_manifest_cap', 'stage_not_admitted', 'stage_parent', 'stage_partition', 'stage_profile', 'stage_receipt', 'stage_receipt_cap', 'stage_receipt_metadata', 'stage_source', 'stage_write', 'start_observation_failed', 'start_uncertain_client', 'startup_deadline', 'swap_limit', 'tmpfs_inventory', 'tree_empty_unconfirmed', 'unknown', 'unplanned_tmpfs', 'unplanned_volume', 'user_or_logging', 'vendor_image_identity', 'work_admission_deadline', 'work_deadline_or_cancel', 'working_committed_bytes', 'writable_bind'])
DIAGNOSTIC_OPERATIONS = frozenset(['admission_read', 'attach_poll', 'attach_start', 'capture', 'cgroup_identity_stat', 'claim_directory_create', 'claim_write', 'cleanup', 'cleanup_attach_wait', 'cleanup_final_inspect', 'cleanup_identity_inspect', 'cleanup_kill', 'cleanup_pipe_drain', 'cleanup_populated_read', 'cleanup_remove', 'console', 'container_create', 'coordinator', 'created_identity_inspect', 'descendant_membership_read', 'entry', 'event_read', 'events_open', 'final_attach_kill', 'final_attach_poll', 'final_attach_wait', 'final_child_observation', 'final_console_encode', 'final_console_flush', 'final_console_write', 'final_events_close', 'final_memory_close', 'final_pids_close', 'final_raw_close', 'final_raw_flush', 'final_raw_open', 'final_raw_sync', 'final_raw_write', 'final_read', 'final_stderr_close', 'final_stderr_flush', 'final_stderr_write', 'final_stdin_close', 'final_stdout_close', 'final_terminal_close', 'final_terminal_encode', 'final_terminal_flush', 'final_terminal_open', 'final_terminal_sync', 'final_terminal_write', 'final_write', 'go_write', 'handle_close', 'host_config_validate', 'image_inspect', 'limits_final_read', 'limits_read', 'membership_read', 'owned_claim_write', 'parent_capability', 'parent_counter', 'parent_lifetime', 'parent_membership', 'parent_release', 'payload_pin_read', 'pipe_close', 'pipe_setup', 'publication_binding', 'raw_receipt_write', 'receipt_write', 'reconcile', 'resource_handles_open', 'resource_memory_read', 'resource_memory_seek', 'resource_pids_read', 'resource_pids_seek', 'selector_close', 'startup_inspect', 'sudo_or_client_exit_unconfirmed', 'terminal_receipt_write', 'unknown', 'workload_pipe_read'])
DIAGNOSTIC_OPERATIONS=DIAGNOSTIC_OPERATIONS|frozenset(['helper','harness','workload','partial_bootstrap','terminal'])
ERROR_ROLES=frozenset(['entry','supervisor_failure','cleanup_diagnostic','parent_cleanup_diagnostic','errors','finalization_errors','resource_observation_failures','unknown'])

DIAGNOSTIC_CODES=DIAGNOSTIC_CODES | frozenset(['parent_domain_threaded', 'parent_domain_domain_threaded', 'parent_domain_invalid', 'parent_domain_unknown', 'parent_controller_input', 'parent_available_missing_1', 'parent_available_missing_2', 'parent_available_missing_3', 'parent_available_missing_4', 'parent_available_missing_5', 'parent_available_missing_6', 'parent_available_missing_7', 'parent_propagated_missing_1', 'parent_propagated_missing_2', 'parent_propagated_missing_3', 'parent_propagated_missing_4', 'parent_propagated_missing_5', 'parent_propagated_missing_6', 'parent_propagated_missing_7', 'control_address', 'control_assurance', 'control_bootstrap', 'control_cap', 'control_child_exit', 'control_child_membership', 'control_client_uid', 'control_container', 'control_create_replay', 'control_deadline', 'control_descendant_unconfirmed', 'control_identity', 'control_not_empty', 'control_operation', 'control_output_cap', 'control_path', 'control_peer', 'control_profile', 'control_protocol', 'control_receipt_cap', 'control_receipt_name', 'control_receipt_write', 'control_request_cap', 'control_service_membership', 'control_socket', 'control_staged_changed', 'control_staged_metadata', 'control_stop_replay', 'control_unit_collision', 'control_unit_identity', 'diagnostic_cap', 'evidence_name', 'evidence_partition_cap', 'recovery_assurance', 'recovery_cap', 'recovery_cgroup_events', 'recovery_cgroup_identity', 'recovery_cgroup_missing', 'recovery_collision', 'recovery_empty_evidence', 'recovery_harness_counters', 'recovery_harness_lifetime', 'recovery_harness_not_empty', 'recovery_harness_state', 'recovery_harness_stop_uncertain_no_retry', 'recovery_harness_stop_unconfirmed', 'recovery_helper_missing_without_stop_evidence', 'recovery_helper_pending_job', 'recovery_helper_pid', 'recovery_helper_state', 'recovery_identity', 'recovery_inside_helper', 'recovery_invocation', 'recovery_operation_cap', 'recovery_path', 'recovery_pending_create_absent_not_nonexecution', 'recovery_pending_create_state', 'recovery_pending_harness_create', 'recovery_pending_start_absent_not_nonexecution', 'recovery_pin', 'recovery_protocol', 'recovery_python', 'recovery_receipt_name', 'recovery_unowned_workload', 'recovery_workload_not_empty', 'recovery_workload_state', 'recovery_workload_stop_unconfirmed', 'recovery_write'])
DIAGNOSTIC_OPERATIONS=DIAGNOSTIC_OPERATIONS | frozenset(['terminal_save','terminal_deadline'])

def error_view(value):
 if type(value) is not dict:value={}
 n=value.get('errno');code=value.get('code');op=value.get('operation',value.get('stage'))
 return {'role':value.get('role') if type(value.get('role'))is str and value['role'] in ERROR_ROLES else 'unknown','operation':op if type(op)is str and op in DIAGNOSTIC_OPERATIONS else 'unknown',
         'code':code if type(code)is str and code in DIAGNOSTIC_CODES else 'unknown',
         'errno':n if type(n)is int and -4095<=n<=4095 else None,
         'phase':value.get('phase') if value.get('phase') in ['preflight','startup','workload','cleanup','finalization'] else 'unknown'}
def exception_view(error,operation):
 code=error.args[0] if type(error)is RuntimeError and len(error.args)==1 else None
 return error_view({'operation':operation,'code':code,'errno':error.errno if isinstance(error,OSError) else None})
def canary_view(value):
 # Child-reported failure only. Missing/malformed data never proves a stage or success.
 if type(value)is not dict or value.get('status')!='reported_failure':return {'status':'unavailable_or_nonprotocol'}
 stage=value.get('stage');kind=value.get('kind');number=value.get('errno')
 if type(stage)is not str or stage not in ['ENTRY','IDENTITY','MOUNTS','DEVICES','READONLY','SCRATCH','NETWORK','DESCENDANT']:return {'status':'unavailable_or_nonprotocol'}
 if type(kind)is not str or kind not in ['ASSERT','OS','OTHER']:return {'status':'unavailable_or_nonprotocol'}
 if number is not None and (type(number)is not int or not -4095<=number<=4095 or number==0):return {'status':'unavailable_or_nonprotocol'}
 return {'status':'reported_failure','stage':stage,'kind':kind,'errno':number}

def diagnostic_view(v):
 if type(v)is not dict:return {'status':'invalid'}
 result={'status':'reported_not_independently_verified','errors':[], 'facts':{}}
 child=v.get('child_observation')
 result['canary']=canary_view(child.get('diagnostic')) if type(child)is dict and child.get('diagnostic_stream')=='stderr' else {'status':'unavailable_or_nonprotocol'}
 cut=False
 if 'code' in v or 'errno' in v:result['errors'].append({**error_view(v),'role':'entry'})
 for key in ['supervisor_failure','cleanup_diagnostic','parent_cleanup_diagnostic']:
  if key in v:result['errors'].append({**error_view(v[key]),'role':key})
 for key in ['errors','finalization_errors','resource_observation_failures']:
  items=v.get(key,[])
  if type(items)is list:
   cut=cut or len(items)>4
   for item in items[:4]:
    if type(item)is dict:result['errors'].append({**error_view(item.get('error',item)),'role':key})
 result['errorsTruncated']=cut or len(result['errors'])>8
 result['errors']=result['errors'][:8]
 for key in ['passed','resource_violation','parent_ownership_confirmed','parent_create_attempted','cancellation_observed','terminal_file_written']:
  if type(v.get(key))is bool:result['facts'][key]=v[key]
 for key in ['helper','harness','workload']:
  child=v.get(key)
  if type(child)is dict:
   for field in ['managerTerminal','observedKernelEmpty','cleanupComplete','released','priorKernelEmpty','neverAdmittedByThisSealedHelper','resourceViolation']:
    if type(child.get(field))is bool:result['facts'][key+'_'+field]=child[field]
 for key in ['attach_exit','container_exit']:
  if type(v.get(key))is int and -2147483648<=v[key]<=2147483647:result['facts'][key]=v[key]
 if v.get('cleanup') in ['confirmed','unconfirmed']:result['facts']['cleanup']=v['cleanup']
 if v.get('parent_cleanup') in ['released_after_empty_observation','unconfirmed']:result['facts']['parent_cleanup']=v['parent_cleanup']
 if v.get('final_populated') in ['0','1']:result['facts']['final_populated']=v['final_populated']
 return result
def unique_members(pairs):
 result={}
 for key,value in pairs:
  if key in result:raise ValueError('duplicate_protocol_member')
  result[key]=value
 return result

def consistent_success(v):
 # Diagnostic consistency only; does not grant runtime/cleanup acceptance.
 if type(v)is not dict:return False
 for key in ['success','sudoEnvelopeTerminal','timely','stdoutEOF','stderrEOF']:
  if v.get(key)is not True:return False
 if type(v.get('exit'))is not int or v['exit']!=0:return False
 if type(v.get('errors'))is not list or v['errors']:return False
 for key in ['persistenceUnconfirmed','uncertainClient']:
  if key in v and v[key]is not False:return False
 if 'diagnostics' in v:
  diagnostics=v['diagnostics']
  if type(diagnostics)is not dict:return False
  for stream in ['stdout','stderr']:
   if stream not in diagnostics:continue
   d=diagnostics[stream]
   if type(d)is not dict:return False
   if 'terminalFailure' in d or d.get('status')=='invalid':return False
   if canary_view(d.get('canary'))['status']=='reported_failure':return False
   if 'errors' in d and (type(d['errors'])is not list or d['errors']):return False
   if d.get('errorsTruncated')is True:return False
   facts=d.get('facts',{})
   if type(facts)is not dict:return False
   if 'passed' in facts and facts['passed']is not True:return False
   # Explicit textual uncertainty contradicts a successful diagnostic label.
   # Negative stage observations and missing facts are not inferred failures.
   for key in ['cleanup','parent_cleanup']:
    if facts.get(key)=='unconfirmed':return False
   for key in ['resource_violation','cancellation_observed','harness_resourceViolation']:
    if key in facts and facts[key]is not False:return False
 return True

def child_view(raw,truncated,op):
 # Only first bounded bytes retained transiently. No raw bytes are serialized.
 if truncated:return {'status':'truncated_unavailable'}
 prefixes={'synthetic':[b'PILOT_RECEIPT ',b'PILOT_INCOMPLETE_RECEIPT ',b'PILOT_REFUSED_OR_INCOMPLETE '],
           'userCleanup':[b'FALLBACK_INCOMPLETE_OR_REMOVAL_ONLY '],
           'prepareStart':[b'PILOT_CONTROL_DIAGNOSTIC '], 'observe':[b'PILOT_CONTROL_DIAGNOSTIC '],
           'recover':[b'PILOT_CONTROL_DIAGNOSTIC '], 'stage':[b'PILOT_STAGE_DIAGNOSTIC ']}
 matches=[];terminal=None
 terminal_prefix=b'PILOT_CONTROL_TERMINAL_FAILURE '
 control=op in {'prepareStart','observe','recover'}
 for line in bytes(raw).splitlines():
  if control and line.startswith(terminal_prefix):
   if terminal is not None:return {'status':'missing_or_ambiguous'}
   try:
    value=json.loads(line[len(terminal_prefix):],object_pairs_hook=unique_members)
    if type(value)is not dict or set(value)!={'version','passed','phase','code','errno'}:return {'status':'invalid'}
    if type(value['version'])is not int or value['version']!=1 or value['passed']is not False or value['phase']!='terminal' or value['code'] not in ['control_deadline','unknown']:return {'status':'invalid'}
    n=value['errno']
    if n is not None and (type(n)is not int or not -4095<=n<=4095):return {'status':'invalid'}
    terminal=error_view({'operation':'terminal','phase':'finalization','code':value['code'],'errno':n})
   except (ValueError,TypeError,RecursionError):return {'status':'invalid'}
   continue
  for prefix in prefixes.get(op,[]):
   if line.startswith(prefix):
    if terminal is not None:return {'status':'missing_or_ambiguous'} # reordered protocol
    try:
     value=json.loads(line[len(prefix):],object_pairs_hook=unique_members);matches.append(diagnostic_view(value))
    except (ValueError,TypeError,RecursionError):return {'status':'invalid'}
 if len(matches)>1:return {'status':'missing_or_ambiguous'}
 if terminal is not None:
  result=matches[0] if matches else {'status':'reported_not_independently_verified','facts':{},'errors':[]}
  result['terminalFailure']=terminal
  result['snapshotStatus']='present_provisional' if matches else 'unavailable'
  return result
 if len(matches)!=1:return {'status':'missing_or_ambiguous'}
 return matches[0]
def operation_view(op,v):
 if type(v)is not dict:v={}
 number=v.get('exit')
 return {'operation':op if op in OPS else 'unknown',
  'result':'reported_success' if consistent_success(v) else 'failed_or_unknown',
  'exit':number if type(number)is int and -2147483648<=number<=2147483647 else None,
  'terminal':v.get('sudoEnvelopeTerminal')is True,
  'errors':[error_view(x) for x in v.get('errors',[])[:8]] if type(v.get('errors'))is list else [],
  'stdout':{'status':'unavailable'},
  'stderr':{'status':'unavailable'}}
def terminal_view(plan,ph,results,errors,mode,passed,uncertain):
 # Re-sanitize stored diagnostic projections: never trust persisted arbitrary JSON.
 records=[]
 for op in sorted(OPS):
  v=results.get(op)
  if type(v)is not dict:records.append({'operation':op,'result':'unavailable'});continue
  r=operation_view(op,v)
  for stream in ['stdout','stderr']:
   d=v.get('diagnostics',{});d=d.get(stream,{}) if type(d)is dict else {}
   if type(d)is not dict:d={}
   r[stream]={'status':d.get('status') if d.get('status') in ['reported_not_independently_verified','invalid','truncated_unavailable','missing_or_ambiguous'] else 'unavailable'}
   if r[stream]['status']=='reported_not_independently_verified':
    if type(d.get('terminalFailure'))is dict:
     r[stream]['terminalFailure']=error_view(d['terminalFailure'])
     r[stream]['snapshotStatus']=d.get('snapshotStatus') if d.get('snapshotStatus') in ['present_provisional','unavailable'] else 'unavailable'
    r[stream]['canary']=canary_view(d.get('canary'))
    r[stream]['errorsTruncated']=d.get('errorsTruncated')is True
    r[stream]['errors']=[error_view(x) for x in d.get('errors',[])[:8]] if type(d.get('errors'))is list else []
    allowed={'passed','resource_violation','parent_ownership_confirmed','parent_create_attempted','cancellation_observed','terminal_file_written'}|{a+'_'+b for a in ['helper','harness','workload'] for b in ['managerTerminal','observedKernelEmpty','cleanupComplete','released','priorKernelEmpty','neverAdmittedByThisSealedHelper','resourceViolation']}
    facts=d.get('facts',{});r[stream]['facts']={k:x for k,x in facts.items() if k in allowed and type(x)is bool} if type(facts)is dict else {}
    if type(facts)is dict:
     for key,values in [('cleanup',['confirmed','unconfirmed']),('parent_cleanup',['released_after_empty_observation','unconfirmed']),('final_populated',['0','1'])]:
      if facts.get(key) in values:r[stream]['facts'][key]=facts[key]
     for key in ['attach_exit','container_exit']:
      if type(facts.get(key))is int and -2147483648<=facts[key]<=2147483647:r[stream]['facts'][key]=facts[key]
  records.append(r)
 binding=plan.get('binding',{})
 # Identity is a digest of the sealed plan, not an assertion of kernel ownership.
 return {'schema':'ibex-terminal-diagnostic-v1','planSHA256':ph,
  'mode':mode,'verdict':'failed_or_unknown' if not passed or uncertain else 'reported_success_requires_exit',
  'uncertainClient':bool(uncertain),'verification':'operation_reports_not_independent_cleanup_proof','identityEvidence':'sealed_capture_plan_binding_only_not_exported_kernel_identity',
  'operations':records,'coordinatorErrors':[error_view(x) for x in errors[:8]],'errorsTruncated':len(errors)>8}
def emit_terminal(value):
 try:
  raw=json.dumps(value,sort_keys=True,separators=(',',':'))
  if len(raw.encode('ascii'))>24576:raise RuntimeError('diagnostic_cap')
  print('PILOT_TERMINAL_DIAGNOSTIC '+raw,flush=True);return True
 except BaseException:
  try:print('PILOT_TERMINAL_DIAGNOSTIC {"schema":"ibex-terminal-diagnostic-v1","verdict":"failed_or_unknown","diagnostics":"unavailable"}',flush=True)
  except BaseException:pass
  return False

def capture(plan,plan_hash,op,until,output,budget):
 if {k:plan.get('binding',{}).get(k) for k in ('assuranceModel','policyReviewSHA256')}!={'assuranceModel':'managed-runner-components-v1','policyReviewSHA256':'5f0b365406a585112c1b93c9283174b13f2ec20a062f7afa69d87aeb13ac96fe'}:raise RuntimeError('capture_assurance')
 encoded=json.dumps(plan,sort_keys=True,separators=(',',':')).encode()
 if plan.get('executionAllowed') is not True or hashlib.sha256(encoded).hexdigest()!=plan_hash or op not in OPS:raise RuntimeError('capture_binding')
 argv=plan['commands'][op];env=plan['environment'];claim=output/('capture-'+op+'.json')
 if claim.exists():raise RuntimeError('capture_collision')
 # Caller admits only its constructed sealed fixed plan, not caller-supplied argv.
 receipt={'assurance':{k:plan['binding'][k] for k in ('assuranceModel','policyReviewSHA256')},'operation':op,'planSHA256':plan_hash,'exit':None,'stdoutEOF':False,'stderrEOF':False,'timely':False,'managerOutcome':'unknown','errors':[],'sudoEnvelopeTerminal':False}
 streams={'stdout':{'bytes':0,'sha256':hashlib.sha256()},'stderr':{'bytes':0,'sha256':hashlib.sha256()}}
 p=None;sel=None;cap=1048576;overflow=False
 samples={k:bytearray() for k in streams};sample_cut={k:False for k in streams}
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
    remaining=16384-len(samples[key]);samples[key].extend(data[:remaining])
    sample_cut[key]=sample_cut[key] or len(data)>remaining
  if sel.get_map():raise RuntimeError('capture_missing_EOF')
  receipt['exit']=p.wait(timeout=max(.001,until-time.monotonic()))
 except BaseException as e:
  receipt['errors'].append(exception_view(e,'capture'))
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
  try:receipt['diagnostics']={k:child_view(samples[k],sample_cut[k],op) for k in streams}
  except BaseException:
   receipt['diagnostics']={k:{'status':'invalid'} for k in streams}
   receipt['success']=False;receipt['errors'].append({'operation':'capture','code':'unknown'})
  try:
   raw=(json.dumps(receipt,sort_keys=True)+'\n').encode();budget.guard(claim,raw)
   with claim.open('xb') as f:
    if f.write(raw)!=len(raw):raise RuntimeError('capture_receipt_write')
    f.flush();os.fsync(f.fileno())
  except BaseException as error:
   receipt['errors'].append(exception_view(error,'receipt_write'));receipt['success']=False
   receipt['persistenceUnconfirmed']=True
  if time.monotonic()>=until:receipt['success']=False;receipt['timely']=False
 return receipt
