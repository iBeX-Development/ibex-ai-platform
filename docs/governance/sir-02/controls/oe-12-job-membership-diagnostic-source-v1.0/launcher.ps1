$ErrorActionPreference = 'Stop'
$env:COREPACK_ENABLE_NETWORK = '0'
$env:npm_config_offline = 'true'

$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$nativeSource = Join-Path $sourceRoot 'native-helper.cs'
$probe = Join-Path $sourceRoot 'probe.cjs'
$node = 'C:\Program Files\nodejs\node.exe'
$startUtc = [DateTime]::UtcNow
$token = 'SIR02-OE12-JOB-MEMBERSHIP-DIAGNOSTIC-' + $startUtc.ToString('yyyyMMddTHHmmssfffZ')
$captureDir = Join-Path $env:TEMP $token
if (Test-Path -LiteralPath $captureDir) { throw 'Diagnostic capture directory already exists' }
[void](New-Item -ItemType Directory -Path $captureDir)
$recordPath = Join-Path $captureDir 'diagnostic-raw.json'
$readyPath = Join-Path $captureDir 'parent-ready.json'
$releasePath = Join-Path $captureDir 'parent-release.flag'

function Quote-WindowsArgument([AllowEmptyString()][string]$value) {
  if ($value.IndexOf([char]0) -ge 0) { throw 'NUL in diagnostic argument' }
  $builder = New-Object System.Text.StringBuilder
  $slash = [string][char]92
  $quote = [string][char]34
  [void]$builder.Append($quote)
  $backslashes = 0
  foreach ($ch in $value.ToCharArray()) {
    if ($ch -eq [char]92) { $backslashes++; continue }
    if ($ch -eq [char]34) {
      [void]$builder.Append(($slash * (2 * $backslashes + 1)))
      [void]$builder.Append($quote)
      $backslashes = 0
      continue
    }
    if ($backslashes -gt 0) { [void]$builder.Append(($slash * $backslashes)); $backslashes = 0 }
    [void]$builder.Append($ch)
  }
  if ($backslashes -gt 0) { [void]$builder.Append(($slash * (2 * $backslashes))) }
  [void]$builder.Append($quote)
  return $builder.ToString()
}

$record = [ordered]@{
  classification = 'Non-Formal Tooling Diagnostic — Not OE-12 Operational Evidence'
  authorizationDecision = '70755e8571e8c2ccf8bdf182064993f1a91511e1'
  forensicBasis = 'fa656ca968129bbb6dea05e853c66d859ae5f1b1'
  diagnosticToken = $token
  startUtc = $startUtc.ToString('o')
  endUtc = $null
  expectedTopology = @(
    [ordered]@{ role='PowerShell diagnostic launcher'; executable='powershell.exe'; pid=$PID; creator='invoking shell'; jobMemberExpected=$false; membership='outside new Job'; cleanup='natural exit after bounded diagnostic' },
    [ordered]@{ role='Native helper'; executable='in-process Add-Type native-helper.cs'; pid=$PID; creator='diagnostic launcher'; jobMemberExpected=$false; membership='same process as launcher'; cleanup='no separate process' },
    [ordered]@{ role='Watchdog'; executable=$null; pid=$null; creator=$null; jobMemberExpected=$false; membership='not created'; cleanup='not applicable' },
    [ordered]@{ role='Synthetic Node parent'; executable=$node; pid=$null; creator='diagnostic launcher'; jobMemberExpected=$true; membership='explicit assignment before resume'; cleanup='cooperative release or finite natural exit; exact owned-handle fallback only on failure' },
    [ordered]@{ role='Synthetic Node descendant'; executable=$null; pid=$null; creator=$null; jobMemberExpected=$false; membership='not created by probe'; cleanup='not applicable' }
  )
  intendedParentPid = $null
  expectedSyntheticMemberPidSet = @()
  observedJobMemberPidSet = @()
  unexpectedJobMemberPidSet = @()
  missingExpectedPidSet = @()
  members = @()
  allowlistGate = 'Not Evaluated'
  nativeSteps = @()
  safeCleanup = [ordered]@{ cooperativeSignalIssued=$false; knownParentExited=$false; originalParentIdentityStillPresent=$null; exactOwnedHandleFallbackUsed=$false; unidentifiedMemberTerminated=$false; jobWideTerminationUsed=$false; nativeHandleCleanupSucceeded=$null; result='Not Started'; errorCategory=$null }
  errorCategory = $null
  result = 'Needs Clarification'
  formalRunIdGenerated = $false
  oe12StatusChanged = $false
}

$session = $null
$parentReady = $null
try {
  if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) { throw 'Windows PowerShell 5.1 required' }
  if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw 'Installed Node executable unavailable' }
  if (-not (Test-Path -LiteralPath $nativeSource -PathType Leaf)) { throw 'Exact native helper source unavailable' }
  if (-not (Test-Path -LiteralPath $probe -PathType Leaf)) { throw 'Exact synthetic probe source unavailable' }
  Add-Type -Path $nativeSource
  $session = New-Object Sir02JobMembershipDiagnostic.NativeSession
  [string[]]$arguments = @($probe, $token, $readyPath, $releasePath)
  $quoted = @((Quote-WindowsArgument $node)) + @($arguments | ForEach-Object { Quote-WindowsArgument $_ })
  $commandLine = [string]::Join(' ', [string[]]$quoted)
  $session.StartSyntheticParent($node, $commandLine, $sourceRoot)
  $record.intendedParentPid = $session.ParentPid
  $record.expectedSyntheticMemberPidSet = @($session.ParentPid)
  $record.expectedTopology[3].pid = $session.ParentPid

  $readyDeadline = [Diagnostics.Stopwatch]::StartNew()
  while (-not (Test-Path -LiteralPath $readyPath -PathType Leaf) -and $readyDeadline.ElapsedMilliseconds -lt 3000) {
    Start-Sleep -Milliseconds 25
  }
  if (Test-Path -LiteralPath $readyPath -PathType Leaf) {
    $parentReady = Get-Content -LiteralPath $readyPath -Raw | ConvertFrom-Json
  }

  $observed = @($session.ReadJobMembers() | Sort-Object -Unique)
  $record.observedJobMemberPidSet = @($observed)
  $record.unexpectedJobMemberPidSet = @($observed | Where-Object { $_ -ne $session.ParentPid })
  $record.missingExpectedPidSet = @(if ($observed -notcontains $session.ParentPid) { $session.ParentPid })
  $memberRecords = New-Object System.Collections.ArrayList
  foreach ($memberPid in $observed) {
    $native = $session.InspectMember([int]$memberPid)
    $cim = $null
    $cimError = $null
    try {
      $matches = @(Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $memberPid" -OperationTimeoutSec 2 -ErrorAction Stop)
      if ($matches.Count -eq 1) { $cim = $matches[0] } else { $cimError = 'ProcessRecordCountNotOne' }
    } catch { $cimError = $_.Exception.GetType().Name }
    $commandLineObserved = if ($null -ne $cim) { [string]$cim.CommandLine } else { $null }
    $parentPidObserved = if ($null -ne $cim) { [int]$cim.ParentProcessId } else { $null }
    $cimCreatedUtc = if ($null -ne $cim -and $null -ne $cim.CreationDate) { ([DateTime]$cim.CreationDate).ToUniversalTime().ToString('o') } else { $null }
    $tokenPresent = $null -ne $commandLineObserved -and $commandLineObserved.Contains($token)
    $expectedRole = if ($memberPid -eq $session.ParentPid) { 'Synthetic Node parent' } else { 'Unknown' }
    $explicit = $memberPid -eq $session.ParentPid -and $session.ParentExplicitlyAssigned
    $imageMatch = $native.ImageQuerySucceeded -and [string]::Equals($native.ImagePath, $node, [System.StringComparison]::OrdinalIgnoreCase)
    $nativeCreationMatch = $native.CreationFileTimeUtc -ne 0 -and $native.CreationFileTimeUtc -eq $session.ParentCreationFileTimeUtc
    $readyMatch = $null -ne $parentReady -and [int]$parentReady.pid -eq $session.ParentPid -and [string]$parentReady.token -ceq $token
    $owned = $explicit -and $memberPid -eq $session.ParentPid -and $native.Opened -and $native.InJob -and
      $native.MembershipQuerySucceeded -and $nativeCreationMatch -and $imageMatch -and $null -ne $cim -and
      $parentPidObserved -eq $PID -and $tokenPresent -and $readyMatch
    $class = if ($owned) { 'Allowlisted — Explicitly Assigned' } else { 'Unknown / Not Allowlisted' }
    [void]$memberRecords.Add([ordered]@{
      pid=[int]$memberPid; executableImagePath=$native.ImagePath; parentPid=$parentPidObserved
      creationFileTimeUtc=$native.CreationFileTimeUtc; cimCreationUtc=$cimCreatedUtc
      commandLine=$commandLineObserved; diagnosticTokenObserved=$tokenPresent; expectedRole=$expectedRole
      membershipClass=$class; explicitAssignment=$explicit; inheritedMembership=$false
      inJob=$native.InJob; imageMatchesInstalledNode=$imageMatch; creationMatchesOwnedHandle=$nativeCreationMatch
      parentReadyRecordMatches=$readyMatch; nativeOpenError=$native.OpenError; nativeImageError=$native.ImageError
      nativeMembershipError=$native.MembershipError; cimErrorCategory=$cimError
      evidenceSources=@('CreateProcessW handle and PID','GetProcessTimes','QueryFullProcessImageNameW',
        'IsProcessInJob','JobObjectBasicProcessIdList','local Win32_Process CIM','synthetic probe ready record')
    })
  }
  $record.members = @($memberRecords.ToArray())
  $onlyExpected = $observed.Count -eq 1 -and $observed[0] -eq $session.ParentPid
  $oneAllowlisted = $memberRecords.Count -eq 1 -and $memberRecords[0].membershipClass -eq 'Allowlisted — Explicitly Assigned'
  if ($onlyExpected -and $oneAllowlisted) {
    $record.allowlistGate = 'PASS — All observed members conclusively allowlisted'
    $record.result = 'PASS — All Job Members Conclusively Identified'
  } else {
    $record.allowlistGate = 'FAIL — Unknown or unexpected Job member, or missing intended parent'
    $record.result = 'FAIL — Unknown or Unsafe Member Present'
  }
} catch {
  $record.errorCategory = $_.Exception.GetType().Name
  if ($record.allowlistGate -ne 'FAIL — Unknown or unexpected Job member, or missing intended parent') {
    $record.result = 'Needs Clarification'
  }
} finally {
  if ($null -ne $session) {
    try {
      [IO.File]::WriteAllText($releasePath, $token, (New-Object Text.UTF8Encoding($false)))
      $record.safeCleanup.cooperativeSignalIssued = $true
      $record.safeCleanup.knownParentExited = $session.WaitForOwnedParent(12000)
      if (-not $record.safeCleanup.knownParentExited -and $session.ParentPid -gt 0) {
        $record.safeCleanup.exactOwnedHandleFallbackUsed = $true
        [void]$session.TerminateVerifiedOwnedParentOnly()
        $record.safeCleanup.knownParentExited = $session.WaitForOwnedParent(2000)
      }
      $record.safeCleanup.originalParentIdentityStillPresent = $session.OriginalOwnedParentStillPresent()
      $record.safeCleanup.result = if ($record.safeCleanup.knownParentExited -and -not $record.safeCleanup.originalParentIdentityStillPresent -and -not $record.safeCleanup.exactOwnedHandleFallbackUsed) {
        'CooperativeOrNaturalExitVerified'
      } elseif ($record.safeCleanup.knownParentExited -and -not $record.safeCleanup.originalParentIdentityStillPresent) { 'TargetedOwnedParentFallback — DiagnosticCannotPass' }
      else { 'KnownParentExitUnverified — DiagnosticCannotPass' }
    } catch {
      $record.safeCleanup.result = 'CleanupError — DiagnosticCannotPass'
      $record.safeCleanup.errorCategory = $_.Exception.GetType().Name
    }
    $session.Dispose() # The Job was verified to have no kill-on-close flag.
    $record.safeCleanup.nativeHandleCleanupSucceeded = $session.HandleCleanupSucceeded
    $record.nativeSteps = @($session.Steps)
  }
  if (($record.safeCleanup.result -ne 'CooperativeOrNaturalExitVerified' -or $record.safeCleanup.nativeHandleCleanupSucceeded -ne $true) -and $record.result -eq 'PASS — All Job Members Conclusively Identified') {
    $record.result = 'Needs Clarification'
  }
  $record.endUtc = [DateTime]::UtcNow.ToString('o')
  $json = ConvertTo-Json -InputObject $record -Depth 12
  [IO.File]::WriteAllText($recordPath, $json, (New-Object Text.UTF8Encoding($false)))
}

Write-Output ('DIAGNOSTIC_RESULT=' + $record.result)
Write-Output ('DIAGNOSTIC_RECORD=' + $recordPath)
if ($record.result -ne 'PASS — All Job Members Conclusively Identified') { exit 1 }
