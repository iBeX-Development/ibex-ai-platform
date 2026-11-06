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
    binding={'assuranceModel':'managed-runner-vendor-trust-v1','policyReviewSHA256':'3e0170a902a379c3254e21058a2ddfb6fb76c8f67e7bf1c52ddf01d79bd5d7d6'}
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
if __name__=='__main__':
    try:code=main()
    except BaseException:code=1
    raise SystemExit(code)
