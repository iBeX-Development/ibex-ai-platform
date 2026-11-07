"""Pure exact property matching; no API calls at import."""
ENV=['PATH=/usr/bin:/bin','LANG=C','LC_ALL=C','HOME=/nonexistent']
UNSET=['LD_PRELOAD','LD_LIBRARY_PATH','LD_AUDIT','GCONV_PATH','LOCPATH','PYTHONPATH','PYTHONHOME','DBUS_SYSTEM_BUS_ADDRESS','DBUS_SESSION_BUS_ADDRESS','DBUS_STARTER_ADDRESS','SYSTEMD_PAGER','PAGER']
def typed(properties,key,kind):
    v=properties.get(key)
    if not isinstance(v,dict) or v.get('type')!=kind:raise RuntimeError('effective_missing_type')
    return v['data']
def exact(properties,key,kind,want):
    got=typed(properties,key,kind)
    if type(got)!=type(want) or got!=want:raise RuntimeError('effective_mismatch')
def service(c,unit,props):
    desc='ibex-control:'+c['run_id']+':1:'+c['commit']+':'+c['nonce']
    exact(unit,'Description','s',desc);exact(unit,'Transient','b',True)
    for key,kind,value in [('Type','s','exec'),('User','s','root'),('Group','s','root'),('Slice','s','ibexpilotharness'+c['run_id']+'a1t'+c['nonce']+'.slice'),('Restart','s','no'),('RuntimeMaxUSec','t',650000000),('TimeoutStartUSec','t',5000000),('TimeoutStopUSec','t',2000000),('KillMode','s','control-group'),('SendSIGKILL','b',True),('TasksMax','t',16),('MemoryMax','t',268435456),('MemorySwapMax','t',0),('CPUQuotaPerSecUSec','t',1000000),('NoNewPrivileges','b',True),('ProtectSystem','s','strict'),('ProtectHome','s','yes'),('PrivateTmp','b',True),('PrivateDevices','b',True),('RestrictNamespaces','t',0),('StandardInput','s','null'),('StandardOutput','s','null'),('StandardError','s','null'),('UMask','u',63)]:exact(props,key,kind,value)
    for key,want in [('Environment',ENV),('UnsetEnvironment',UNSET),('ReadWritePaths',[str(c['directory'])])]:
        got=typed(props,key,'as')
        if not isinstance(got,list) or sorted(got)!=sorted(want):raise RuntimeError('effective_environment_or_path')
    af=typed(props,'RestrictAddressFamilies','(bas)')
    if af!=[True,['AF_UNIX']]:raise RuntimeError('effective_address_family')
    for key,kind in [('EnvironmentFiles','a(sb)'),('PassEnvironment','as'),('BindPaths','a(ssbt)'),('BindReadOnlyPaths','a(ssbt)'),('TemporaryFileSystem','a(ss)')]:exact(props,key,kind,[])
    for key in ['ExecStartPre','ExecStartPost','ExecCondition','ExecReload','ExecStop','ExecStopPost']:
        if typed(props,key,'a(sasbttttuii)')!=[]:raise RuntimeError('effective_extra_command')
    command=typed(props,'ExecStart','a(sasbttttuii)')
    python=c['profile']['pythonExecutable'];argv=[python,'-I','-B','-S',str(c['directory']/'control_helper.py'),str(c['directory']/'config.json')]
    if not isinstance(command,list) or len(command)!=1 or len(command[0])!=10 or command[0][:3]!=[python,argv,False]:raise RuntimeError('effective_exec')
    return {'verifiedProperties':sorted(props),'interpreterMetadata':c['ambientExecutables'][python],'assurance':{k:c[k] for k in ('assuranceModel','policyReviewSHA256')},'scope':'all specified bootstrap properties; no claim about unrequested host settings'}
def workload(c,unit,props):
    exact(unit,'Description','s',c['description']);exact(unit,'Transient','b',True);exact(unit,'StopWhenUnneeded','b',False)
    for key,value in [('MemoryMax',4294967296),('MemorySwapMax',0),('TasksMax',128),('CPUQuotaPerSecUSec',2000000)]:exact(props,key,'t',value)
    exact(props,'ControlGroup','s','/'+c['unit'])

def unpack(reply):
    data=reply.get('data')
    if reply.get('type')!='a{sv}' or not isinstance(data,list) or len(data)!=1:raise RuntimeError('effective_reply')
    values=data[0]
    if isinstance(values,list):
        if any(not isinstance(x,list) or len(x)!=2 or not isinstance(x[0],str) for x in values):raise RuntimeError('effective_dictionary')
        if len({x[0] for x in values})!=len(values):raise RuntimeError('effective_dictionary')
        values=dict(values)
    if not isinstance(values,dict):raise RuntimeError('effective_dictionary')
    return values

def kernel_limits(path):
    from pathlib import Path
    path=Path(path)
    for name,want in [('memory.max','268435456'),('memory.swap.max','0'),('pids.max','16')]:
        with (path/name).open('rb') as f:b=f.read(128)
        if len(b)>=128 or b.decode('ascii').strip()!=want:raise RuntimeError('effective_kernel_limit')
    with (path/'cpu.max').open('rb') as f:b=f.read(128)
    parts=b.decode('ascii').strip().split()
    if len(b)>=128 or len(parts)!=2 or not all(x.isdigit() for x in parts) or not 0<int(parts[0])<=int(parts[1]):raise RuntimeError('effective_kernel_cpu')
