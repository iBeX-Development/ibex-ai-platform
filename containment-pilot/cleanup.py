"""Exact-run fallback cleanup; never upgrades supervisor verdict to PASS."""
import json
import os
from pathlib import Path
import subprocess
import time

deadline=time.monotonic()+10

def command(args):
    return subprocess.run(args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,timeout=max(.01,deadline-time.monotonic()),check=True).stdout

try:
    run_id=os.environ.get('GITHUB_RUN_ID','');attempt=os.environ.get('GITHUB_RUN_ATTEMPT','')
    if not run_id.isdigit() or attempt!='1':raise RuntimeError('attempt')
    directory=Path(os.environ['RUNNER_TEMP'])/('ibex-pilot-'+run_id+'-'+attempt)
    path=directory/'owned-container.json'
    if directory.is_symlink() or path.is_symlink() or path.stat().st_size>4096:raise RuntimeError('claim_path')
    data=json.loads(path.read_text())
    if data.get('run_id')!=run_id or data.get('attempt')!=attempt or data.get('source_commit')!=os.environ.get('GITHUB_SHA'):raise RuntimeError('run_binding')
    cid=data['container_id'];token=data['token']
    if len(cid)!=64 or any(c not in '0123456789abcdef' for c in cid):raise RuntimeError('id')
    if len(token)!=32 or any(c not in '0123456789abcdef' for c in token):raise RuntimeError('token')
    identity=command(['docker','inspect','--format','{{.Id}}|{{index .Config.Labels "ibex.pilot"}}',cid]).decode().strip()
    if identity!=cid+'|'+token:raise RuntimeError('ownership')
    command(['docker','rm','--force',cid])
    print('FALLBACK_EXACT_ID_REMOVAL_OBSERVED_NOT_CLEANUP_ACCEPTANCE')
except BaseException:
    print('FALLBACK_ABSENT_OR_UNCONFIRMED_NO_ACCEPTANCE')
