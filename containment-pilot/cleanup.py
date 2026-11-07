"""Exact-owned-container and exact-owned-slice fallback; never grants pilot PASS."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import time

ROOT=Path(__file__).resolve().parent
until=time.monotonic()+10
ASSURANCE={'assuranceModel':'managed-runner-components-v1','policyReviewSHA256':'5f0b365406a585112c1b93c9283174b13f2ec20a062f7afa69d87aeb13ac96fe'}
result={'assurance':ASSURANCE,'passed':False,'container':'unconfirmed','parent':'unconfirmed','errors':[]}
backend=None;parent=None;operation='binding';output=None

def error_record(error):
    number=error.errno if isinstance(error,OSError) else None
    return {'operation':operation,'errno':number if type(number) is int and -4095<=number<=4095 else None,
            'command_cleanup_errors':getattr(error,'parent_cleanup_errors',[]),
            'code':error.args[0] if backend and type(error) is RuntimeError and len(error.args)==1 and error.args[0] in backend.CODES else None}

def safe_json(path):
    if path.is_symlink():raise RuntimeError('parent_identity')
    value=json.loads(backend.read_small(path,until))
    if value.get('assurance')!=ASSURANCE:raise RuntimeError('parent_identity')
    return value

def released_container_id(identity, claim, run, attempt, commit):
    """Reconcile exact earlier ownership; does not prove removal or release."""
    if type(identity) is not dict or type(claim) is not dict:
        raise RuntimeError('parent_identity')
    cid=claim.get('container_id');nonce=identity.get('nonce')
    if type(cid) is not str or re.fullmatch(r'[a-f0-9]{64}',cid) is None:
        raise RuntimeError('parent_identity')
    if type(nonce) is not str or re.fullmatch(r'[a-f0-9]{32}',nonce) is None:
        raise RuntimeError('parent_identity')
    if any(identity.get(k)!=v for k,v in [('run_id',run),('attempt',attempt),('commit',commit)]):
        raise RuntimeError('parent_identity')
    if any(claim.get(k)!=v for k,v in [('run_id',run),('attempt',attempt),('source_commit',commit),('token',nonce),('assurance',ASSURANCE)]):
        raise RuntimeError('parent_identity')
    if 'container_id' in identity and identity['container_id']!=cid:
        raise RuntimeError('parent_identity')
    return cid

def main():
    global backend,parent,operation,output
    try:
        # This fallback is future code, disabled at both publication activation gates.
        admission=json.loads((ROOT/'admission.json').read_text())
        if admission.get('enabled') is not True:raise RuntimeError('disabled')
        if any(admission.get(k)!=v for k,v in ASSURANCE.items()):raise RuntimeError('parent_identity')
        if hashlib.sha256((ROOT/'control_helper.py').read_bytes()).hexdigest()!=admission['files']['control_helper.py']:raise RuntimeError('binding')
        source=(ROOT/'parent_backend.py').read_bytes()
        if hashlib.sha256(source).hexdigest()!=admission['files']['parent_backend.py']:raise RuntimeError('binding')
        spec=importlib.util.spec_from_file_location('ibex_parent_backend',ROOT/'parent_backend.py')
        backend=importlib.util.module_from_spec(spec);spec.loader.exec_module(backend)
        run=os.environ.get('GITHUB_RUN_ID','');attempt=os.environ.get('GITHUB_RUN_ATTEMPT','');commit=os.environ.get('GITHUB_SHA','')
        if not re.fullmatch(r'[0-9]{1,20}',run) or attempt!='1' or not re.fullmatch(r'[a-f0-9]{40}',commit):raise RuntimeError('parent_identity')
        if os.environ.get('GITHUB_REPOSITORY')!=admission['repository'] or os.environ.get('GITHUB_REF')!=admission['ref']:raise RuntimeError('parent_identity')
        # Exact checked-out bytes, including admission, before trusting persisted claims.
        if backend.run_command(['/usr/bin/git','rev-parse','HEAD'],until).decode().strip()!=commit:raise RuntimeError('parent_identity')
        for name in ['parent_backend.py','cleanup.py','admission.json']:
            blob=backend.run_command(['/usr/bin/git','cat-file','blob',commit+':containment-pilot/'+name],until)
            if (ROOT/name).is_symlink() or (ROOT/name).read_bytes()!=blob:raise RuntimeError('parent_identity')
        output=Path(os.environ['RUNNER_TEMP'])/('ibex-pilot-'+run+'-'+attempt)
        if output.is_symlink() or not output.is_dir():raise RuntimeError('parent_identity')
        completed=output/'parent-released.json'
        if completed.exists():
            saved=safe_json(completed)
            d=saved['identity']
            probe=backend.Parent(output,run,attempt,commit,d['nonce'],until)
            if saved.get('released') is not True or any(d.get(k)!=v for k,v in probe.identity.items()):raise RuntimeError('parent_identity')
            cid=released_container_id(d,safe_json(output/'owned-container.json'),run,attempt,commit)
            probe.identity=d;probe.path=backend.ROOT/probe.name;probe.owned=True;probe.cleaning=True
            role=saved.get('role')
            complete,observation=probe.released_state(role)
            if not complete or observation!=saved.get('priorEmptyObservation'):raise RuntimeError('parent_release')
            live=backend.run_command(['/usr/bin/docker','container','ls','--all','--no-trunc','--filter','id='+cid,'--format','{{.ID}}'],until).strip()
            if live:raise RuntimeError('parent_identity')
            result['container']='already_removed_exact_claim'
            result['parent']='already_released_exact_claim'
            result['passed']=True # Cleanup-only result; never the workload verdict.
            return 0
        operation='parent_recover'
        try:
            parent=backend.Parent.recover(output,run,attempt,commit,until)
        except BaseException as error:result['errors'].append(error_record(error))
        # Container removal does not depend on parent recovery succeeding.
        operation='container_identity'
        try:
            d=safe_json(output/'owned-container.json')
            cid=d.get('container_id','');nonce=d.get('token','')
            if d.get('run_id')!=run or d.get('attempt')!=attempt or d.get('source_commit')!=commit or not re.fullmatch(r'[a-f0-9]{64}',cid) or not re.fullmatch(r'[a-f0-9]{32}',nonce):raise RuntimeError('parent_identity')
            state=json.loads(backend.run_command(['/usr/bin/docker','inspect',cid],until))[0]
            if state['Id']!=cid or state['Config']['Labels'].get('ibex.pilot')!=nonce:raise RuntimeError('parent_identity')
            if parent and (nonce!=parent.identity['nonce'] or state['HostConfig'].get('CgroupParent')!=parent.name or (parent.cid is not None and parent.cid!=cid)):raise RuntimeError('parent_identity')
            operation='container_remove'
            backend.run_command(['/usr/bin/docker','rm','--force',cid],until)
            result['container']='exact_id_removal_observed_not_tree_proof'
        except BaseException as error:result['errors'].append(error_record(error))
        operation='parent_release'
        if parent:
            try:
                # Missing child is allowed only after exact ownership established;
                # unknown child names, nonzero populated, missing counters fail closed.
                parent.release(role='fallback')
                result['parent']='exact_owned_unit_release_after_empty_observation'
            except BaseException as error:
                result['errors'].append(error_record(error));result['parent_operation']=parent.operation
        operation='fallback_receipt'
        try:backend.exclusive(output/'fallback-terminal.json',result)
        except BaseException as error:result['errors'].append(error_record(error))
    except BaseException as error:
        result['errors'].append(error_record(error))
    finally:
        # Only bounded fixed-schema diagnostics, never command stdout/error messages.
        try:
            payload=json.dumps(result,sort_keys=True)
            if len(payload)>4096:raise RuntimeError('receipt_cap')
            print('FALLBACK_INCOMPLETE_OR_REMOVAL_ONLY '+payload,flush=True)
        except BaseException:pass
    return 0 if not result['errors'] else 1

if __name__ == '__main__':
    raise SystemExit(main())
