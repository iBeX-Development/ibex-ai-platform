param(
  [Parameter(Mandatory=$true)][ValidateNotNullOrEmpty()][string]$InputPath,
  [Parameter(Mandatory=$true)][ValidateNotNullOrEmpty()][string]$EvidenceDirectory,
  [ValidateRange(1000,30000)][int]$OuterTimeoutMs = 8000,
  [ValidateRange(500,10000)][int]$StopTimeoutMs = 2000,
  [string]$CancellationFlagPath = ''
)

$ErrorActionPreference = 'Stop'
$script:stopQueries = $false
$script:unresolvedPipeline = $false
$script:openPipelines = New-Object System.Collections.ArrayList
$script:ownedHandles = @{}
$script:resourceLedger = New-Object System.Collections.ArrayList
$script:record = [ordered]@{
  classification = 'Non-Formal Read-Only CIM Environment Validation — Not OE-12 Operational Evidence'
  result = 'STOP / Validation Not Executed'
  startedUtc = [DateTime]::UtcNow.ToString('o')
  endedUtc = $null
  branches = @()
  environment = [ordered]@{}
  targets = @()
  errors = @()
  cleanup = [ordered]@{stopQueries=$false; probeStateRecorded=$false; cooperativeExit='N/A — no process created or controlled'; boundedWait='N/A — no process created or controlled'; freshState='Not Started'; pipelineDisposal='Not Started'; handleDisposal='Not Started'; temporaryFiles='Not Started'; resourceVerification='Not Started'; result='Not Started'}
}
$scratchDirectory = $null
$scratchFile = $null
$evidencePath = $null

function Add-Branch([string]$id,[string]$condition,[string]$detail) {
  $script:record.branches += [ordered]@{id=$id;condition=$condition;detail=$detail;utc=[DateTime]::UtcNow.ToString('o')}
}

function Add-Error([string]$stage,[System.Management.Automation.ErrorRecord]$errorRecord) {
  $exception = $errorRecord.Exception
  $nativeCode = $null
  if ($null -ne $exception -and $null -ne $exception.PSObject.Properties['NativeErrorCode']) { $nativeCode = [string]$exception.NativeErrorCode }
  $script:record.errors += [ordered]@{
    stage=$stage; type=if ($null -ne $exception) { $exception.GetType().FullName } else { 'Unknown' }; exactMessage=if ($null -ne $exception) { [string]$exception.Message } else { [string]$errorRecord }
    hresult=if ($null -ne $exception) { $exception.HResult } else { $null }; nativeErrorCode=$nativeCode
    fullyQualifiedErrorId=$errorRecord.FullyQualifiedErrorId
    category=[string]$errorRecord.CategoryInfo.Category
    utc=[DateTime]::UtcNow.ToString('o')
  }
}

function Assert-Input($inputObject) {
  if ($inputObject.templateOnly -eq $true) { throw 'Template input cannot be used for validation' }
  if ($inputObject.namespace -cne 'sir02-km-evidence-v1' -or $inputObject.fixtureSchema -cne 'SIR02-KM-EVIDENCE-FIXTURE v1.0' -or $inputObject.classification -cne 'Synthetic') { throw 'Synthetic namespace/schema/classification gate failed' }
  if ([string]$inputObject.runToken -notmatch '^SIR02-OE12-CIM-[A-Za-z0-9-]+$') { throw 'Run token missing or invalid' }
  if (-not [IO.Path]::IsPathRooted([string]$inputObject.probePath) -or [string]$inputObject.probePath -match '[*?\x00]') { throw 'Invalid or wildcard probe path' }
  if ($null -eq $inputObject.node -or $null -eq $inputObject.conhost) { throw 'Both exact synthetic target identities are required' }
  foreach ($role in @('node','conhost')) {
    $target = $inputObject.$role
    if ([int]$target.pid -le 0 -or [int]$target.parentPid -le 0 -or [long]$target.creationFileTimeUtc -le 0) { throw "Incomplete $role PID, parent, or creation identity" }
    if ([string]::IsNullOrWhiteSpace([string]$target.imagePath) -or [string]::IsNullOrWhiteSpace([string]$target.creationEvidenceRef) -or [string]::IsNullOrWhiteSpace([string]$target.assignmentEvidenceRef)) { throw "Incomplete $role image or creation/assignment receipt" }
    if ([string]$target.runToken -cne [string]$inputObject.runToken) { throw "$role run token mismatch" }
  }
  if ([int]$inputObject.node.pid -eq [int]$inputObject.conhost.pid -or [int]$inputObject.conhost.parentPid -ne [int]$inputObject.node.pid) { throw 'Synthetic Node/conhost topology mismatch' }
  if ([string]::IsNullOrWhiteSpace([string]$inputObject.receiptPath) -or [string]$inputObject.receiptSha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Immutable synthetic receipt path/hash missing' }
  if (-not (Test-Path -LiteralPath ([string]$inputObject.receiptPath) -PathType Leaf)) { throw 'Synthetic receipt unavailable' }
  $actualReceiptHash = (Get-FileHash -Algorithm SHA256 -LiteralPath ([string]$inputObject.receiptPath)).Hash
  if ($actualReceiptHash -cne ([string]$inputObject.receiptSha256).ToUpperInvariant()) { throw 'Synthetic receipt checksum mismatch' }
  $receipt = Get-Content -LiteralPath ([string]$inputObject.receiptPath) -Raw | ConvertFrom-Json
  if ([string]$receipt.runToken -cne [string]$inputObject.runToken) { throw 'Synthetic receipt run token mismatch' }
  foreach ($role in @('node','conhost')) {
    $expected = $inputObject.$role
    $observed = $receipt.$role
    if ($null -eq $observed -or [int]$observed.pid -ne [int]$expected.pid -or [int]$observed.parentPid -ne [int]$expected.parentPid -or [long]$observed.creationFileTimeUtc -ne [long]$expected.creationFileTimeUtc -or [string]$observed.imagePath -cne [string]$expected.imagePath -or [string]$observed.runToken -cne [string]$expected.runToken -or [string]$observed.creationEvidenceRef -cne [string]$expected.creationEvidenceRef -or [string]$observed.assignmentEvidenceRef -cne [string]$expected.assignmentEvidenceRef) { throw "Synthetic receipt $role identity mismatch" }
  }
  Add-Branch 'B00' 'preflight' 'Synthetic input and immutable receipt fields verified; caller assertions alone are insufficient'
}

function Test-CancelRequested {
  if ($script:stopQueries) { throw 'Cancellation or prior failure stopped new queries' }
  if (-not [string]::IsNullOrEmpty($CancellationFlagPath) -and (Test-Path -LiteralPath $CancellationFlagPath -PathType Leaf)) {
    $script:stopQueries = $true
    Add-Branch 'B12' 'cancellation' 'Approved cancellation flag observed; no process action'
    throw 'Cancellation requested'
  }
}

function Invoke-BoundedPowerShell([string]$command,[hashtable]$parameters,[string]$stage) {
  Test-CancelRequested
  $pipeline = [System.Management.Automation.PowerShell]::Create()
  [void]$script:openPipelines.Add($pipeline)
  $async = $null
  $quiesced = $false
  try {
    [void]$pipeline.AddCommand($command)
    foreach ($key in @($parameters.Keys | Sort-Object)) { [void]$pipeline.AddParameter([string]$key,$parameters[$key]) }
    $async = $pipeline.BeginInvoke()
    if (-not $async.AsyncWaitHandle.WaitOne($OuterTimeoutMs)) {
      $script:stopQueries = $true
      Add-Branch 'B09' 'outer timeout' "$stage exceeded outer deadline; requesting non-destructive pipeline cancellation"
      $stop = $pipeline.BeginStop($null,$null)
      if (-not $stop.AsyncWaitHandle.WaitOne($StopTimeoutMs)) {
        $script:unresolvedPipeline = $true
        throw 'OuterTimeoutUnquiesced — pipeline cannot be safely disposed'
      }
      $pipeline.EndStop($stop)
      if (-not $async.IsCompleted) {
        $script:unresolvedPipeline = $true
        throw 'OuterTimeoutStopReturnedWithoutInvocationQuiescence'
      }
      $quiesced = $true
      throw 'OuterTimeoutStopped — validation cannot pass'
    }
    $output = @($pipeline.EndInvoke($async))
    $quiesced = $true
    if ($pipeline.Streams.Error.Count -gt 0 -or $pipeline.HadErrors) {
      $firstError = $pipeline.Streams.Error[0]
      if ($null -ne $firstError) { throw $firstError }
      throw "$stage returned PowerShell error stream"
    }
    return $output
  } catch {
    if ($_.Exception.Message -match 'timed out|timeout' -and -not $script:unresolvedPipeline) { Add-Branch 'B08' 'inner timeout or stopped outer timeout' $stage }
    elseif ($_.Exception.Message -match 'provider|service|CIM') { Add-Branch 'B04' 'CIM/provider/service error' $stage }
    else { Add-Branch 'B03' 'command exception' $stage }
    Add-Error $stage $_
    throw
  } finally {
    if ($null -eq $async -or $quiesced -or $async.IsCompleted) {
      try { $pipeline.Dispose(); [void]$script:openPipelines.Remove($pipeline) }
      catch { Add-Branch 'B14' 'pipeline disposal failure' $stage; Add-Error "$stage pipeline disposal" $_; $script:unresolvedPipeline = $true }
    } else {
      $script:unresolvedPipeline = $true
      Add-Branch 'B14' 'pipeline still active' "$stage retained unresolved pipeline; no unsafe disposal or process termination"
    }
  }
}

function Assert-NativeIdentity($target,$snapshot,[string]$role) {
  if ($snapshot.Exited) { Add-Branch 'B10' 'early target exit' "$role exact handle already signaled"; throw "$role exited before or during observation" }
  if ([int]$snapshot.Pid -ne [int]$target.pid) { throw "$role PID mismatch" }
  if (-not [string]::Equals([string]$snapshot.ImagePath,[string]$target.imagePath,[StringComparison]::OrdinalIgnoreCase)) { throw "$role image mismatch" }
  if ([long]$snapshot.CreationFileTimeUtc -ne [long]$target.creationFileTimeUtc) { throw "$role creation-time mismatch or PID reuse" }
  if ($null -ne $target.sessionId -and [int]$snapshot.SessionId -ne [int]$target.sessionId) { throw "$role session mismatch" }
}

function Assert-CimIdentity($target,$cim,$native,[string]$role,$inputObject) {
  if (@($cim).Count -ne 1) { Add-Branch 'B06' 'partial or ambiguous result' "$role record count is not one"; throw "$role CIM record count not one" }
  $row = @($cim)[0]
  foreach ($field in @('ProcessId','ParentProcessId','CreationDate','CommandLine')) {
    if ($null -eq $row.$field -or [string]::IsNullOrWhiteSpace([string]$row.$field)) { Add-Branch 'B05' 'missing mandatory field' "$role missing $field"; throw "$role missing mandatory $field" }
  }
  $created = ([DateTime]$row.CreationDate).ToUniversalTime().ToFileTimeUtc()
  if ([int]$row.ProcessId -ne [int]$target.pid -or [int]$row.ParentProcessId -ne [int]$target.parentPid) { throw "$role PID/parent mismatch" }
  if ([Math]::Abs([double]($created - [long]$native.CreationFileTimeUtc)) -gt 10000000) { throw "$role CIM/native creation-time disagreement" }
  if ($role -eq 'node' -and (-not ([string]$row.CommandLine).Contains([string]$inputObject.runToken) -or -not ([string]$row.CommandLine).Contains([string]$inputObject.probePath))) { throw 'Node command-line token/probe path mismatch' }
  return [ordered]@{pid=[int]$row.ProcessId;parentPid=[int]$row.ParentProcessId;creationFileTimeUtc=$created;commandLineTokenObserved=([string]$row.CommandLine).Contains([string]$inputObject.runToken);probePathObserved=([string]$row.CommandLine).Contains([string]$inputObject.probePath)}
}

try {
  $resolvedInput = [IO.Path]::GetFullPath($InputPath)
  $resolvedEvidence = [IO.Path]::GetFullPath($EvidenceDirectory)
  $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if (-not $resolvedEvidence.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $resolvedEvidence)) { throw 'Evidence directory must be a new child of the local temp root' }
  if (-not (Test-Path -LiteralPath $resolvedInput -PathType Leaf)) { throw 'Input file missing' }
  $inputObject = Get-Content -LiteralPath $resolvedInput -Raw | ConvertFrom-Json
  Assert-Input $inputObject
  [void](New-Item -ItemType Directory -Path $resolvedEvidence -ErrorAction Stop)
  $evidencePath = Join-Path $resolvedEvidence 'cim-validation-result.json'
  $scratchDirectory = Join-Path $resolvedEvidence 'scratch'
  [void](New-Item -ItemType Directory -Path $scratchDirectory -ErrorAction Stop)
  $scratchFile = Join-Path $scratchDirectory 'result.partial.json'
  [IO.File]::WriteAllText($scratchFile,'{"state":"prepared-only"}',(New-Object Text.UTF8Encoding($false)))
  Add-Type -Path (Join-Path $PSScriptRoot 'native-readonly.cs') -ErrorAction Stop

  $script:record.environment.windows = [Environment]::OSVersion.VersionString
  $script:record.environment.powerShell = $PSVersionTable.PSVersion.ToString()
  $script:record.environment.is64BitProcess = [Environment]::Is64BitProcess
  $script:record.environment.executionPolicyScopes = @(Invoke-BoundedPowerShell 'Get-ExecutionPolicy' @{List=$true} 'P0 execution policy')
  $service = @(Invoke-BoundedPowerShell 'Get-Service' @{Name='Winmgmt';ErrorAction='Stop'} 'P1 WMI service')
  $script:record.environment.wmiServiceStatus = if ($service.Count -eq 1) { [string]$service[0].Status } else { 'Missing or ambiguous' }
  if ($service.Count -ne 1 -or [string]$service[0].Status -ne 'Running') { Add-Branch 'B04' 'provider/service unavailable' 'Winmgmt is not running'; throw 'Winmgmt unavailable' }
  $class = @(Invoke-BoundedPowerShell 'Get-CimClass' @{Namespace='root/cimv2';ClassName='Win32_Process';OperationTimeoutSec=2;ErrorAction='Stop'} 'P1 Win32_Process provider')
  $script:record.environment.win32ProcessClassCount = $class.Count
  if ($class.Count -ne 1) { Add-Branch 'B04' 'provider/class unavailable' 'Win32_Process class count not one'; throw 'Win32_Process provider unavailable' }
  Add-Branch 'B01' 'environment success' 'Fingerprint, policy, service, and provider checks completed'

  foreach ($role in @('node','conhost')) {
    Test-CancelRequested
    $target = $inputObject.$role
    $handle = [Sir02CimEnvironmentValidationV1.ReadOnlyProcessHandle]::Open([int]$target.pid)
    $script:ownedHandles[$role] = $handle
    $before = $handle.Read()
    Assert-NativeIdentity $target $before $role
    $observations = @()
    for ($sequence=1; $sequence -le 3; $sequence++) {
      Test-CancelRequested
      Assert-NativeIdentity $target ($handle.Read()) $role
      $queryStart = [DateTime]::UtcNow.ToString('o')
      $rows = @(Invoke-BoundedPowerShell 'Get-CimInstance' @{Namespace='root/cimv2';ClassName='Win32_Process';Filter="ProcessId = $([int]$target.pid)";Property=@('ProcessId','ParentProcessId','CreationDate','CommandLine');OperationTimeoutSec=2;ErrorAction='Stop'} "P2 $role query $sequence")
      $queryEnd = [DateTime]::UtcNow.ToString('o')
      $actual = Assert-CimIdentity $target $rows $before $role $inputObject
      Assert-NativeIdentity $target ($handle.Read()) $role
      $observations += [ordered]@{sequence=$sequence;startedUtc=$queryStart;endedUtc=$queryEnd;requestedFields=@('ProcessId','ParentProcessId','CreationDate','CommandLine');returnedRowCount=$rows.Count;identity=$actual}
      Add-Branch 'B02' 'CIM query success' "$role query $sequence complete"
    }
    $after = $handle.Read()
    Assert-NativeIdentity $target $after $role
    $first = $observations[0].identity
    foreach ($observation in $observations) {
      if ($observation.identity.pid -ne $first.pid -or $observation.identity.parentPid -ne $first.parentPid -or $observation.identity.creationFileTimeUtc -ne $first.creationFileTimeUtc -or $observation.identity.commandLineTokenObserved -ne $first.commandLineTokenObserved) { Add-Branch 'B07' 'repeated-query disagreement' "$role identity changed"; throw "$role repeated query mismatch" }
    }
    $script:record.targets += [ordered]@{role=$role;pid=[int]$target.pid;imagePath=[string]$after.ImagePath;sessionId=[int]$after.SessionId;creationFileTimeUtc=[long]$after.CreationFileTimeUtc;creationEvidenceRef=[string]$target.creationEvidenceRef;assignmentEvidenceRef=[string]$target.assignmentEvidenceRef;repeatability='Three matching exact-field observations';observations=$observations}
  }
  Add-Branch 'B02' 'all CIM queries complete' 'Both exact synthetic identities stable across three local observations'
  $script:record.result = 'PASS — Option B Environment Feasible'
} catch {
  $script:stopQueries = $true
  Add-Error 'main' $_
  if ($_.Exception.Message -match 'Cancellation|mismatch|missing|partial|unavailable|disagreement|exited|unquiesced') { $script:record.result = 'Needs Clarification' }
  else { $script:record.result = 'STOP / Validation Not Executed' }
  Add-Branch 'B03' 'main exception' 'No further CIM query; primary error retained'
} finally {
  $script:stopQueries = $true
  $script:record.cleanup.stopQueries = $true
  $script:record.cleanup.probeStateRecorded = $true
  Add-Branch 'B15' 'final cleanup entered' 'New queries stopped and primary state retained'
  # This source creates no child, Job, or CIM session; cooperative exit and wait are source-proven N/A.
  $script:record.cleanup.freshState = 'N/A — no process-affecting action; prior retained-handle snapshots recorded'
  if ($script:openPipelines.Count -eq 0 -and -not $script:unresolvedPipeline) { $script:record.cleanup.pipelineDisposal = 'Passed' }
  else { $script:record.cleanup.pipelineDisposal = 'STOP — unresolved pipeline'; $script:record.result = 'STOP / Validation Not Executed'; Add-Branch 'B14' 'incomplete pipeline disposal' 'No destructive cleanup attempted' }
  $allHandlesClosed = $true
  foreach ($role in @($script:ownedHandles.Keys)) {
    try {
      $closed = $script:ownedHandles[$role].CloseOwnedHandle()
      if (-not $closed) { $allHandlesClosed = $false; Add-Branch 'B14' 'native handle close failure' "$role Win32=$($script:ownedHandles[$role].CloseError)" }
    } catch { $allHandlesClosed = $false; Add-Error "$role native handle disposal" $_ }
  }
  $script:record.cleanup.handleDisposal = if ($allHandlesClosed) { 'Passed' } else { 'STOP — handle close unverified' }
  if (-not $allHandlesClosed) { $script:record.result = 'STOP / Validation Not Executed' }
  try {
    if ($null -ne $scratchFile -and (Test-Path -LiteralPath $scratchFile)) { Remove-Item -LiteralPath $scratchFile -Force -ErrorAction Stop }
    if ($null -ne $scratchDirectory -and (Test-Path -LiteralPath $scratchDirectory)) { Remove-Item -LiteralPath $scratchDirectory -ErrorAction Stop }
    $script:record.cleanup.temporaryFiles = 'Passed'
  } catch { $script:record.cleanup.temporaryFiles = 'STOP — temporary cleanup failed'; $script:record.result = 'STOP / Validation Not Executed'; Add-Error 'temporary cleanup' $_; Add-Branch 'B13' 'temporary-file cleanup failure' 'Owned scratch path retained for governance' }
  $scratchGone = ($null -eq $scratchDirectory -or -not (Test-Path -LiteralPath $scratchDirectory))
  $resourcesGone = $scratchGone -and $allHandlesClosed -and $script:openPipelines.Count -eq 0 -and -not $script:unresolvedPipeline
  $script:record.cleanup.resourceVerification = if ($resourcesGone) { 'Passed' } else { 'STOP — diagnostic-owned resource unresolved' }
  if (-not $resourcesGone) { $script:record.result = 'STOP / Validation Not Executed' }
  $script:record.cleanup.result = if ($resourcesGone) { 'Passed' } else { 'STOP — cleanup incomplete' }
  $script:record.endedUtc = [DateTime]::UtcNow.ToString('o')
  try {
    if ($null -ne $evidencePath) {
      $json = ConvertTo-Json -InputObject $script:record -Depth 18
      [IO.File]::WriteAllText($evidencePath,$json,(New-Object Text.UTF8Encoding($false)))
    }
  } catch { Add-Error 'final evidence write' $_; Add-Branch 'B13' 'final evidence write failure' 'Primary result preserved in memory and emitted to stdout'; $script:record.result = 'STOP / Validation Not Executed' }
  Write-Output (ConvertTo-Json -InputObject $script:record -Depth 18)
}
