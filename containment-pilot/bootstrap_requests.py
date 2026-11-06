"""Pure request construction; no subprocess, shell, staging or manager action.
All substitutions require a separately sealed activation request and runtime profile.
"""
import hashlib
import re

STAGE_SOURCE_SHA256='3b88ab31d8d60597acd80c56e2504554f9613bfad690c95958e1cf4175ce03bc'

PROPERTIES=['Type=exec','User=root','Group=root','Restart=no',
 'RuntimeMaxSec=650','TimeoutStartSec=5','TimeoutStopSec=2','KillMode=control-group',
 'SendSIGKILL=yes','TasksMax=16','MemoryMax=268435456','MemorySwapMax=0','CPUQuota=100%',
 'NoNewPrivileges=yes','ProtectSystem=strict','ProtectHome=yes','PrivateTmp=yes','PrivateDevices=yes',
 'RestrictAddressFamilies=AF_UNIX','RestrictNamespaces=yes','StandardInput=null','StandardOutput=null','StandardError=null',
 'UMask=0077','Environment=PATH=/usr/bin:/bin LANG=C LC_ALL=C HOME=/nonexistent',
 'UnsetEnvironment=LD_PRELOAD LD_LIBRARY_PATH LD_AUDIT GCONV_PATH LOCPATH PYTHONPATH PYTHONHOME DBUS_SYSTEM_BUS_ADDRESS DBUS_SESSION_BUS_ADDRESS DBUS_STARTER_ADDRESS SYSTEMD_PAGER PAGER']

def requests(run,nonce,commit,client_gid,python,stage_source,stage_source_sha256,stage_manifest_sha256):
    if not re.fullmatch(r'[0-9]{1,20}',run) or not re.fullmatch(r'[a-f0-9]{32}',nonce) or not re.fullmatch(r'[a-f0-9]{40}',commit):raise ValueError('binding')
    if type(client_gid)is not int or not 0<client_gid<2147483647 or not re.fullmatch(r'/usr/bin/python3\.[0-9]{1,2}',python):raise ValueError('binding')
    if not re.fullmatch(r'[a-f0-9]{64}',stage_manifest_sha256) or stage_source_sha256!=STAGE_SOURCE_SHA256 or hashlib.sha256(stage_source.encode()).hexdigest()!=STAGE_SOURCE_SHA256:raise ValueError('stage_binding')
    root='/run/ibexpilotcontrol'+run+'a1t'+nonce;unit='ibexpilotcontrol'+run+'a1t'+nonce+'.service'
    config=root+'/config.json';description='ibex-control:'+run+':1:'+commit+':'+nonce
    # Fixed sudo + root GNU timeout; deliberately no --foreground. The privileged
    # client group is bounded after timeout starts, not sudo policy/PAM/plugins.
    prefix=['/usr/bin/sudo','-n','--','/usr/bin/timeout','--signal=TERM','--kill-after=2s','10s']
    py=[python,'-I','-B','-S']
    source='/home/runner/work/_temp/ibex-bootstrap-inputs-'+run+'-'+nonce
    stage=prefix+py+['-c',stage_source,source,root,stage_manifest_sha256,str(client_gid)]
    prepare=prefix+py+[root+'/independent_recovery.py','prepare-start',config]
    start=prefix+['/usr/bin/systemd-run','--system','--no-ask-password','--unit='+unit,'--description='+description]
    start+=['--property='+v for v in PROPERTIES+['Slice=ibexpilotharness'+run+'a1t'+nonce+'.slice','ReadWritePaths='+root]]
    start+=['--',*py,root+'/control_helper.py',config]
    observe=prefix+py+[root+'/independent_recovery.py','observe',config]
    recover=prefix+py+[root+'/independent_recovery.py','recover',config]
    return {'executionAllowed':False,'environment':{'PATH':'/usr/bin:/bin','LANG':'C','LC_ALL':'C','HOME':'/nonexistent'},'stage':stage,'prepareStart':prepare,'start':start,'observe':observe,'recover':recover,
            'controlConfigEnvironment':{'IBEX_CONTROL_CONFIG':config},
            'doNotAutomaticallyRetry':['stage','prepareStart','start','observe','recover'],
            'guard':'These requests are data, not authority. Exact runtime profile/source hashes, privilege, outer capture and uncertainty reconciliation are mandatory.'}
