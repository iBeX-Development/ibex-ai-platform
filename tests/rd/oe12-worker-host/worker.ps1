# R&D ONLY / NOT AUTHORIZED FOR EXECUTION. Dedicated non-interactive synthetic worker.
param(
  [Parameter(Mandatory=$true)][string]$Mode,
  [Parameter(Mandatory=$true)][string]$RunId,
  [Parameter(Mandatory=$true)][string]$GenerationId,
  [Parameter(Mandatory=$true)][string]$RunToken,
  [Parameter(Mandatory=$true)][string]$ArmNonce,
  [Parameter(Mandatory=$true)][string]$CaseId,
  [Parameter(Mandatory=$true)][string]$ConfigPath,
  [Parameter(Mandatory=$true)][string]$ManifestPath,
  [Parameter(Mandatory=$true)][string]$ManifestSha256,
  [Parameter(Mandatory=$true)][string]$AuthorizationPath,
  [Parameter(Mandatory=$true)][string]$AuthorizationSha256
)
$ErrorActionPreference = 'Stop'
if ($Mode -ne 'authorized-worker-host-rd' -or [string]::IsNullOrWhiteSpace($RunToken) -or
    [string]::IsNullOrWhiteSpace($GenerationId) -or [string]::IsNullOrWhiteSpace($ArmNonce)) {
  throw 'STOP — Execution Authorization Inputs Invalid'
}
$manifestHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ManifestPath).Hash.ToLowerInvariant()
$authorizationHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $AuthorizationPath).Hash.ToLowerInvariant()
if ($manifestHash -ne $ManifestSha256 -or $authorizationHash -ne $AuthorizationSha256) {
  throw 'STOP — Execution Authorization Inputs Invalid'
}
$manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
$config = Get-Content -Raw -LiteralPath $ConfigPath | ConvertFrom-Json
$authorization = Get-Content -Raw -LiteralPath $AuthorizationPath | ConvertFrom-Json
$configItem = @($manifest.files | Where-Object { $_.path -eq 'config.json' })
$sourceItem = @($manifest.files | Where-Object { $_.path -eq 'worker.ps1' })
$tokenSha = [System.BitConverter]::ToString(([System.Security.Cryptography.SHA256]::Create()).ComputeHash([System.Text.Encoding]::UTF8.GetBytes($RunToken))).Replace('-','').ToLowerInvariant()
if ($configItem.Count -ne 1 -or $sourceItem.Count -ne 1 -or
    (Get-FileHash -Algorithm SHA256 -LiteralPath $ConfigPath).Hash.ToLowerInvariant() -ne $configItem[0].sha256 -or
    (Get-FileHash -Algorithm SHA256 -LiteralPath $PSCommandPath).Hash.ToLowerInvariant() -ne $sourceItem[0].sha256 -or
    $config.readiness.StartsWith('STOP') -or
    $authorization.status -ne 'Authorized for One Worker-Host R&D Execution' -or
    $authorization.manifestSha256 -ne $ManifestSha256 -or
    $authorization.runId -ne $RunId -or $authorization.generationId -ne $GenerationId -or
    $authorization.runTokenSha256 -ne $tokenSha -or $authorization.cases -notcontains $CaseId) {
  throw 'STOP — Execution Authorization Inputs Invalid'
}
# Worker has no receipt, anchor, ownership-verifier or authoritative-state write authority.
try {
  [Console]::Out.WriteLine((@{type='READY';runId=$RunId;generationId=$GenerationId;workerPid=$PID} | ConvertTo-Json -Compress))
  $line = [Console]::In.ReadLine() # No CIM/provider operation before an explicit ARM message.
  if ([string]::IsNullOrWhiteSpace($line)) { throw 'STOP — ARM missing' }
  $arm = ConvertFrom-Json -InputObject $line -ErrorAction Stop
  if ($arm.type -ne 'ARM' -or $arm.runId -ne $RunId -or $arm.generationId -ne $GenerationId -or
      $arm.nonce -ne $ArmNonce) { throw 'STOP — ARM mismatch' }
  if ($CaseId -eq 'WH-04') { throw 'Synthetic worker exception' }
  if ($CaseId -eq 'WH-03' -or $CaseId -eq 'WH-09') {
    throw 'STOP — Safe Hang-Path Disposal Unproven: unresponsive/disposal-failure case cannot be launched'
  }
  if ($CaseId -eq 'WH-02') { Start-Sleep -Seconds 11 } # reviewed 10 s observer timeout case
  # This synthetic local query targets only the current worker; no tenant/Core/live target.
  $row = Get-CimInstance -ClassName Win32_Process -Filter ("ProcessId = {0}" -f $PID) -ErrorAction Stop
  if ($null -eq $row) { throw 'Provider partial result: missing worker row' }
  $candidate = @{
    type='RESULT';runId=$RunId;generationId=$GenerationId;sequence=1
    payload=@{ processId=[int]$row.ProcessId;parentProcessId=[int]$row.ParentProcessId
      creationDate=[string]$row.CreationDate;hasCommandLine=(-not [string]::IsNullOrWhiteSpace([string]$row.CommandLine)) }
  }
  if ($CaseId -eq 'WH-06') { $candidate.generationId = 'STALE-GENERATION' }
  [Console]::Out.WriteLine(($candidate | ConvertTo-Json -Compress -Depth 5))
  if ($CaseId -eq 'WH-05') {
    Start-Sleep -Seconds 11
    [Console]::Out.WriteLine(($candidate | ConvertTo-Json -Compress -Depth 5))
  }
  exit 0
} catch {
  [Console]::Error.WriteLine((@{type='WORKER_FAULT';category=[string]$_.CategoryInfo.Category} | ConvertTo-Json -Compress))
  exit 22
} finally {
  # Worker-owned local resources only. No worker authority to close controller state.
  [Console]::Error.Flush(); [Console]::Out.Flush()
}
