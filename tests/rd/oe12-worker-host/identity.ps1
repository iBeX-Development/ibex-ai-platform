# R&D ONLY / NOT AUTHORIZED FOR EXECUTION. Read-only local identity observer.
param(
  [Parameter(Mandatory=$true)][int]$TargetPid,
  [Parameter(Mandatory=$true)][string]$RunToken,
  [Parameter(Mandatory=$true)][string]$Mode,
  [Parameter(Mandatory=$true)][string]$RunId,
  [Parameter(Mandatory=$true)][string]$GenerationId,
  [Parameter(Mandatory=$true)][string]$CaseId,
  [Parameter(Mandatory=$true)][string]$ConfigPath,
  [Parameter(Mandatory=$true)][string]$ManifestPath,
  [Parameter(Mandatory=$true)][string]$ManifestSha256,
  [Parameter(Mandatory=$true)][string]$AuthorizationPath,
  [Parameter(Mandatory=$true)][string]$AuthorizationSha256
)
$ErrorActionPreference = 'Stop'
try {
  if ($Mode -ne 'authorized-worker-host-rd' -or
      (Get-FileHash -Algorithm SHA256 -LiteralPath $ManifestPath).Hash.ToLowerInvariant() -ne $ManifestSha256 -or
      (Get-FileHash -Algorithm SHA256 -LiteralPath $AuthorizationPath).Hash.ToLowerInvariant() -ne $AuthorizationSha256) {
    throw 'STOP — Execution Authorization Inputs Invalid'
  }
  $manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
  $config = Get-Content -Raw -LiteralPath $ConfigPath | ConvertFrom-Json
  $authorization = Get-Content -Raw -LiteralPath $AuthorizationPath | ConvertFrom-Json
  $configItem = @($manifest.files | Where-Object { $_.path -eq 'config.json' })
  $sourceItem = @($manifest.files | Where-Object { $_.path -eq 'identity.ps1' })
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
  # No remote computer, provider write, service change, prompt, profile or network request.
  $observedAt = [DateTime]::UtcNow.ToString('o')
  $row = Get-CimInstance -ClassName Win32_Process -Filter ("ProcessId = {0}" -f $TargetPid) -ErrorAction Stop
  if ($null -eq $row -or @($row).Count -ne 1) { throw 'Missing or ambiguous process identity' }
  if ([string]::IsNullOrWhiteSpace([string]$row.ExecutablePath) -or
      [string]::IsNullOrWhiteSpace([string]$row.CreationDate) -or
      [string]::IsNullOrWhiteSpace([string]$row.CommandLine) -or
      $null -eq $row.ParentProcessId) { throw 'Incomplete mandatory identity tuple' }
  $tokenPresent = ([string]$row.CommandLine).Contains($RunToken)
  [pscustomobject]@{
    pid = [int]$row.ProcessId
    imagePath = [string]$row.ExecutablePath
    parentPid = [int]$row.ParentProcessId
    creationTime = ([DateTime]$row.CreationDate).ToUniversalTime().ToString('o')
    runTokenPresent = [bool]$tokenPresent
    observedUtc = $observedAt
    observerPid = [int]$PID
    query = 'local Win32_Process: ProcessId, ExecutablePath, ParentProcessId, CreationDate, CommandLine'
  } | ConvertTo-Json -Compress -Depth 4
  exit 0
} catch {
  [pscustomobject]@{ error='IDENTITY_OBSERVATION_FAILED'; category=[string]$_.CategoryInfo.Category } |
    ConvertTo-Json -Compress
  exit 21
}
