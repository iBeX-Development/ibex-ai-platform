"""Occupied content-byte partitions, not cumulative I/O. Exclusive names only."""
from pathlib import Path
import re
TOTAL=16777216
PARTITIONS={'stage_inputs':2097152,'root_staged':2097152,'root_records':2097152,'supervisor':5242880,'outer':1048576}
ROOT_NAMES={'helper-terminal-discovery.json','helper.claim','workload-create-intent.json','workload-unit-identity.json','workload-stop-intent.json','workload-empty-observation.json','helper-start-intent.json','helper-unit-identity.json','helper-stop-intent.json','helper-before-stop.json','helper-final-observation.json','workload-recovery-stop-intent.json','workload-recovery-empty.json','recovery-claim.json','recovery-terminal.json','observe-terminal.json','prepare-start-terminal.json','helper-discovery.json','workload-discovery.json','harness-create-intent.json','harness-identity.json','harness-discovery.json','harness-stop-intent.json','harness-empty.json'}
SUPERVISOR_NAMES={'claim.json','owned-container.json','parent-intent.json','owned-parent.json','parent-initial.json','parent-container-binding.json','parent-final.json','parent-released.json','fallback-terminal.json'}|{'parent-release-'+r+'-'+k+'.json' for r in ['primary','fallback'] for k in ['claim','observation','stop-intent']}
OUTER_NAMES={'sealed-request.json','stage-manifest.json','preflight.json','final.json'}|{'capture-'+op+'.json' for op in ['stage','prepareStart','start','observe','imagePull','synthetic','userCleanup','recover']}
def guard(path,data):
 name=Path(path).name
 if name=='raw-output.bin':cap=4194304
 elif name=='terminal.json':cap=65536
 elif name in ROOT_NAMES or name in SUPERVISOR_NAMES:cap=16384
 elif name in OUTER_NAMES:cap=131072 if name=='sealed-request.json' else 32768
 elif name in {'intent-'+op+'.json' for op in ['stage','prepareStart','start','observe','imagePull','synthetic','userCleanup','recover']}:cap=1024
 elif re.fullmatch(r'receipt-[1-9][0-9]{0,2}\.json',name) and int(name[8:-5])<=768:cap=1024
 else:raise RuntimeError('evidence_name')
 if len(data)>cap:raise RuntimeError('evidence_partition_cap')
 return data
