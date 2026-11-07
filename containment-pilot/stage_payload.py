"""Fixed staging source, future root -c literal only after exact byte approval.
Never execute a candidate file as root. No imports of prepared modules or hooks.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys

FILES={'control_helper.py','parent_backend.py','independent_recovery.py','bootstrap_requests.py','runtime-support.json','config.json','source-pins.json','effective_properties.py','evidence_budget.py'}
def main():
    if os.geteuid()!=0 or len(sys.argv)!=5:raise RuntimeError('stage_invocation')
    source,destination,pin,gid=sys.argv[1:]
    if not re.fullmatch(r'/home/runner/work/_temp/ibex-bootstrap-inputs-[0-9]{1,20}-[a-f0-9]{32}',source):raise RuntimeError('stage_source')
    match=re.fullmatch(r'/run/ibexpilotcontrol([0-9]{1,20})a1t([a-f0-9]{32})',destination)
    if not match or not re.fullmatch(r'[a-f0-9]{64}',pin) or not gid.isdigit() or not 0<int(gid)<2147483647:raise RuntimeError('stage_binding')
    # No directory enumeration or arbitrary manifest destination is accepted.
    root=Path(source)
    # Resolve the directory chain by no-follow descriptors. O_NONBLOCK prevents
    # a FIFO open from blocking before fstat can reject non-regular inputs.
    directory=os.open('/',os.O_RDONLY|os.O_DIRECTORY)
    try:
        for part in root.parts[1:]:
            nxt=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=directory)
            os.close(directory);directory=nxt
        def bounded_read(name,cap):
            fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=directory)
            try:
                before=os.fstat(fd)
                if not stat.S_ISREG(before.st_mode) or before.st_size>cap:raise RuntimeError('stage_file_type_size')
                data=bytearray()
                while len(data)<=cap:
                    chunk=os.read(fd,min(65536,cap+1-len(data)))
                    if not chunk:break
                    data.extend(chunk)
                after=os.fstat(fd)
                if len(data)>cap or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):raise RuntimeError('stage_changed_or_cap')
                return bytes(data)
            finally:os.close(fd)
        raw=bounded_read('stage-manifest.json',16384)
        # All opened files below use the same retained directory identity.
        staged_reads={name:bounded_read(name,262144) for name in FILES}
    finally:os.close(directory)
    if hashlib.sha256(raw).hexdigest()!=pin:raise RuntimeError('stage_manifest')
    m=json.loads(raw)
    if set(m.get('files',{}))!=FILES or m.get('destination')!=destination or m.get('client_gid')!=int(gid):raise RuntimeError('stage_binding')
    contents={};total=0
    for name,want in m['files'].items():
        data=staged_reads[name]
        total+=len(data)
        if total>2080768 or hashlib.sha256(data).hexdigest()!=want:raise RuntimeError('stage_hash')
        contents[name]=bytes(data)
    c=json.loads(contents['config.json']);support=json.loads(contents['runtime-support.json'])
    if support.get('executionAllowed') is not True:raise RuntimeError('stage_not_admitted')
    profiles=support['profiles']
    if c.get('run_id')!=match[1] or c.get('nonce')!=match[2] or c.get('attempt')!='1' or c.get('client_gid')!=int(gid):raise RuntimeError('stage_binding')
    if len([p for p in profiles if p.get('profileSHA256')==c.get('profileSHA256')])!=1:raise RuntimeError('stage_profile')
    binding={'assuranceModel':'managed-runner-components-v1','policyReviewSHA256':'5f0b365406a585112c1b93c9283174b13f2ec20a062f7afa69d87aeb13ac96fe'}
    if type(binding['policyReviewSHA256'])is not str or re.fullmatch(r'[a-f0-9]{64}',binding['policyReviewSHA256'])is None:raise RuntimeError('stage_assurance')
    profile=profiles[0] if len(profiles)==1 else {}
    if any(v.get(k)!=want for v in (c,support,profile) for k,want in binding.items()) or m.get('assurance')!=binding:raise RuntimeError('stage_assurance')
    if 'files' in profile or 'identity' in profile:raise RuntimeError('legacy_profile')
    pins=json.loads(contents['source-pins.json'])
    owned=FILES-{'runtime-support.json','config.json','source-pins.json'}
    if set(pins)!=owned or profile.get('ownedSourcePins')!=pins:raise RuntimeError('stage_profile')
    for name in ['control_helper.py','parent_backend.py','independent_recovery.py','bootstrap_requests.py','effective_properties.py','evidence_budget.py']:
        if hashlib.sha256(contents[name]).hexdigest()!=pins.get(name):raise RuntimeError('stage_hash')
    # Existing destination always refuses. A partial stage is retained, never
    # repaired/reused or deleted automatically. /run must already be root-owned.
    parent=Path('/run').lstat()
    if not stat.S_ISDIR(parent.st_mode) or parent.st_uid!=0 or parent.st_mode&0o022:raise RuntimeError('stage_parent')
    os.mkdir(destination,0o750);os.chown(destination,0,int(gid));os.chmod(destination,0o750)
    for name,data in contents.items():
        fd=os.open(Path(destination)/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o440)
        try:
            os.fchown(fd,0,int(gid));os.fchmod(fd,0o440)
            offset=0
            while offset<len(data):
                n=os.write(fd,data[offset:])
                if n<=0:raise RuntimeError('stage_write')
                offset+=n
            os.fsync(fd)
        finally:os.close(fd)
    record={'assurance':binding,'manifestSHA256':pin,'destination':destination,'fileHashes':m['files']}
    fd=os.open(Path(destination)/'stage-receipt.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o440)
    try:
        # Descriptor-bound metadata: independent of creator group and umask.
        os.fchown(fd,0,int(gid));os.fchmod(fd,0o440)
        st=os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_uid!=0 or st.st_gid!=int(gid) or stat.S_IMODE(st.st_mode)!=0o440:raise RuntimeError('stage_receipt_metadata')
        b=(json.dumps(record,sort_keys=True)+'\n').encode()
        if len(b)>16384:raise RuntimeError('stage_receipt_cap')
        if os.write(fd,b)!=len(b):raise RuntimeError('stage_receipt')
        os.fsync(fd)
    finally:os.close(fd)
    return 0
DIAGNOSTIC_CODES=frozenset(['NOT_ACTIVATED', 'argv', 'assurance_binding', 'attempt_identity', 'base_binding', 'bind_inventory', 'binding', 'capture_assurance', 'capture_binding', 'capture_collision', 'capture_deadline', 'capture_missing_EOF', 'capture_output_cap', 'capture_receipt_write', 'cgroup_path', 'cgroup_v2_required', 'checkout_head_binding', 'cleanup_deadline', 'commit_binding', 'committed_bytes', 'committed_diff_allowlist', 'committed_mode', 'container_id', 'container_identity', 'container_not_clean', 'control_cleanup_incomplete', 'control_command_failed', 'control_deadline', 'control_deadline_or_cancel', 'control_exit_nonzero', 'control_internal', 'control_output_cap', 'control_remote_failure', 'cpu_limit', 'descendant_membership', 'diff_boundary', 'disabled', 'early_exit', 'effective_address_family', 'effective_dictionary', 'effective_environment_or_path', 'effective_exec', 'effective_extra_command', 'effective_kernel_cpu', 'effective_kernel_limit', 'effective_mismatch', 'effective_missing_type', 'effective_reply', 'empty_pins', 'event', 'event_binding', 'event_cap', 'event_size', 'evidence_budget_unbound', 'evidence_cap', 'evidence_name', 'evidence_partition_cap', 'evidence_short_write', 'first_publication', 'first_publication_only', 'git_cleanup_incomplete', 'git_deadline', 'git_exit', 'git_output_cap', 'identity', 'image_unpinned', 'input_cap', 'input_type_size', 'legacy_profile', 'memory_limit', 'mode', 'mount_or_network_mode', 'no_admitted_runtime_profile', 'no_immutable_container_identity', 'no_tree_observation', 'owned_source_pins', 'ownership', 'parent_api', 'parent_capability', 'parent_collision', 'parent_command', 'parent_controller', 'parent_counter', 'parent_deadline', 'parent_identity', 'parent_json', 'parent_lifetime', 'parent_limits', 'parent_membership', 'parent_mount', 'parent_not_empty', 'parent_profile', 'parent_read_cap', 'parent_receipt', 'parent_release', 'payload_root_binding', 'pid_limit', 'pin_allowlist', 'pin_drift', 'pin_path', 'pipe_eof_unconfirmed', 'platform', 'prior_operation_uncertain', 'profile_deadline', 'raw_output_cap', 'receipt_cap', 'recovery_assurance', 'recovery_cap', 'recovery_cgroup_events', 'recovery_cgroup_identity', 'recovery_cgroup_missing', 'recovery_collision', 'recovery_empty_evidence', 'recovery_harness_counters', 'recovery_harness_lifetime', 'recovery_harness_not_empty', 'recovery_harness_state', 'recovery_harness_stop_uncertain_no_retry', 'recovery_harness_stop_unconfirmed', 'recovery_helper_missing_without_stop_evidence', 'recovery_helper_pending_job', 'recovery_helper_pid', 'recovery_helper_state', 'recovery_identity', 'recovery_inside_helper', 'recovery_invocation', 'recovery_operation_cap', 'recovery_path', 'recovery_pending_create_absent_not_nonexecution', 'recovery_pending_create_state', 'recovery_pending_harness_create', 'recovery_pending_start_absent_not_nonexecution', 'recovery_pin', 'recovery_protocol', 'recovery_python', 'recovery_receipt_name', 'recovery_unowned_workload', 'recovery_workload_not_empty', 'recovery_workload_state', 'recovery_workload_stop_unconfirmed', 'recovery_write', 'ref_binding', 'repo_binding', 'rerun_refused', 'resource_handles_missing', 'resource_violation_latched', 'runner_path_binding', 'saved_capture_binding', 'saved_plan_binding', 'setup_failed', 'short_write', 'single_commit_base_required', 'sole_parent', 'source_pin', 'stage_assurance', 'stage_binding', 'stage_changed_or_cap', 'stage_file_type_size', 'stage_hash', 'stage_invocation', 'stage_manifest', 'stage_manifest_cap', 'stage_not_admitted', 'stage_parent', 'stage_partition', 'stage_profile', 'stage_receipt', 'stage_receipt_cap', 'stage_receipt_metadata', 'stage_source', 'stage_write', 'start_observation_failed', 'start_uncertain_client', 'startup_deadline', 'swap_limit', 'tmpfs_inventory', 'tree_empty_unconfirmed', 'unknown', 'unplanned_tmpfs', 'unplanned_volume', 'user_or_logging', 'vendor_image_identity', 'work_admission_deadline', 'work_deadline_or_cancel', 'working_committed_bytes', 'writable_bind'])
DIAGNOSTIC_CODES=DIAGNOSTIC_CODES | frozenset(['control_profile','control_protocol','control_container','container_security_contract'])
if __name__=='__main__':
    try:code=main()
    except BaseException as error:
        code=1
        value=error.args[0] if type(error)is RuntimeError and len(error.args)==1 else None
        number=error.errno if isinstance(error,OSError) else None
        try:print('PILOT_STAGE_DIAGNOSTIC '+json.dumps({'passed':False,'errors':[{'code':value if type(value)is str and value in DIAGNOSTIC_CODES else 'unknown','errno':number if type(number)is int and -4095<=number<=4095 else None}]}),flush=True)
        except BaseException:pass
    raise SystemExit(code)
