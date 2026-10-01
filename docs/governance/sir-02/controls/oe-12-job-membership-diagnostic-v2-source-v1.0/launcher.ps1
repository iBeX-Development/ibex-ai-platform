param(
  [Parameter(Mandatory=$true)][ValidateNotNullOrEmpty()][string]$IntegrityReceiptPath,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedBundleSha256
)

$ErrorActionPreference = 'Stop'
$env:COREPACK_ENABLE_NETWORK = '0'
$env:npm_config_offline = 'true'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$nativeSource = Join-Path $root 'native-helper.cs'
$probe = Join-Path $root 'probe.cjs'
$node = 'C:\Program Files\nodejs\node.exe'
$start = [DateTime]::UtcNow
$token = 'SIR02-OE12-JOB-MEMBERSHIP-DIAGNOSTIC-V2-' + $start.ToString('yyyyMMddTHHmmssfffZ')
$capture = Join-Path $env:TEMP $token
if (Test-Path -LiteralPath $capture) { throw 'Capture directory already exists' }
[void](New-Item -ItemType Directory -Path $capture)
$recordPath = Join-Path $capture 'diagnostic-raw.json'
$ready = Join-Path $capture 'parent-ready.json'
$release = Join-Path $capture 'parent-release.flag'
$dash = [string][char]0x2014
$pass = 'PASS ' + $dash + ' Complete Job Membership Attributed'
$fail = 'FAIL ' + $dash + ' Unknown or Unsafe Member Present'
$ownedClass = 'Allowlisted ' + $dash + ' Explicitly Assigned Synthetic Parent'
$candidateClass = 'Candidate ' + $dash + ' OS-Managed Console Host for Current Synthetic Parent'
$companionClass = 'Allowlisted ' + $dash + ' OS-Managed Console Host for Current Synthetic Parent'
$unknownClass = 'Unknown / Not Allowlisted'

function Quote-WindowsArgument([AllowEmptyString()][string]$value) {
  if ($value.IndexOf([char]0) -ge 0) { throw 'NUL in diagnostic argument' }
  $builder = New-Object System.Text.StringBuilder
  $slash = [string][char]92; $quote = [string][char]34; $backslashes = 0
  [void]$builder.Append($quote)
  foreach ($ch in $value.ToCharArray()) {
    if ($ch -eq [char]92) { $backslashes++; continue }
    if ($ch -eq [char]34) {
      [void]$builder.Append(($slash * (2 * $backslashes + 1)))
      [void]$builder.Append($quote); $backslashes = 0; continue
    }
    if ($backslashes -gt 0) { [void]$builder.Append(($slash * $backslashes)); $backslashes = 0 }
    [void]$builder.Append($ch)
  }
  if ($backslashes -gt 0) { [void]$builder.Append(($slash * (2 * $backslashes))) }
  [void]$builder.Append($quote)
  return $builder.ToString()
}
function FileHash([string]$path) {
  return ([BitConverter]::ToString(([Security.Cryptography.SHA256]::Create()).ComputeHash([IO.File]::ReadAllBytes($path)))).Replace('-','').ToLowerInvariant()
}
function CimMember([int]$memberPid) {
  $item = [ordered]@{success=$false; parentPid=$null; createdUtc=$null; creationFileTimeUtc=$null; commandLine=$null; errorCategory=$null}
  try {
    $found = @(Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $memberPid" -OperationTimeoutSec 2 -ErrorAction Stop)
    if ($found.Count -ne 1) { throw 'ProcessRecordCountNotOne' }
    $created = ([DateTime]$found[0].CreationDate).ToUniversalTime()
    $item.success = $true; $item.parentPid = [int]$found[0].ParentProcessId
    $item.createdUtc = $created.ToString('o'); $item.creationFileTimeUtc = $created.ToFileTimeUtc()
    $item.commandLine = [string]$found[0].CommandLine
  } catch { $item.errorCategory = $_.Exception.GetType().Name }
  return $item
}

$record = [ordered]@{
  classification='Non-Formal Tooling Diagnostic — Not OE-12 Operational Evidence'
  authorizationDecision='2f9cfcc687e376ab8ff5372886e8820ea5cce2bb'
  governanceLinkage='346793104887b2ac6d5e268b82026fa4cfe57fca'
  attributionAnalysis='9136b1aa0a49e7753efd9e23d652787d6d398549'
  diagnosticToken=$token; startUtc=$start.ToString('o'); endUtc=$null
  sourceIntegrity=[ordered]@{receiptPath=$IntegrityReceiptPath; expectedBundleSha256=$ExpectedBundleSha256; verified=$false; bundleSha256=$null; sourceHashes=@{}; errorCategory=$null}
  expectedTopology=@('PowerShell launcher outside Job','in-process native helper outside Job','one synthetic Node parent in Job','optional one OS-managed conhost.exe in Job')
  parentPid=$null; expectedMemberPidSet=@(); observedMemberPidSet=@(); preReleaseConfirmationPidSet=@(); unexpectedMemberPidSet=@(); missingExpectedPidSet=@()
  trustedConhostImagePath=$null; members=@(); preReleaseGate='Not Evaluated'
  lifecycleCorrelation=[ordered]@{parentReleaseUtc=$null; parentExitUtc=$null; originalParentNoLongerAlive=$null; parentPidAbsent=$null; parentPidAbsenceErrorCategory=$null; candidatePid=$null; candidateCreationFileTimeUtc=$null; conhostObservationWindowMs=5000; conhostAliveImmediatelyAfterParent=$null; conhostExitedNaturally=$null; conhostExitObservedUtc=$null; result='Not Evaluated'}
  safeCleanup=[ordered]@{cooperativeSignalIssued=$false; knownParentExited=$false; exactOwnedHandleFallbackUsed=$false; unidentifiedMemberTerminated=$false; jobWideTerminationUsed=$false; nativeHandleCleanupSucceeded=$null; result='Not Started'; errorCategory=$null}
  nativeSteps=@(); errorCategory=$null; result='Needs Clarification'; formalRunIdGenerated=$false; oe12StatusChanged=$false
}
$session = $null; $candidate = $null
try {
  if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) { throw 'Windows PowerShell 5.1 required' }
  foreach ($path in @($node,$nativeSource,$probe,$IntegrityReceiptPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Required source, executable, or integrity receipt unavailable' }
  }
  $receipt = Get-Content -LiteralPath $IntegrityReceiptPath -Raw | ConvertFrom-Json
  $hashes = [ordered]@{'launcher.ps1'=FileHash $MyInvocation.MyCommand.Path; 'native-helper.cs'=FileHash $nativeSource; 'probe.cjs'=FileHash $probe}
  $record.sourceIntegrity.sourceHashes = $hashes
  $record.sourceIntegrity.bundleSha256 = [string]$receipt.bundleSha256
  $record.sourceIntegrity.verified = $receipt.bundleVerified -eq $true -and $receipt.committedSourceVerified -eq $true -and
    $receipt.extractedSourceVerified -eq $true -and [string]$receipt.bundleSha256 -ceq $ExpectedBundleSha256 -and
    $hashes['launcher.ps1'] -ceq [string]$receipt.launcherSha256 -and
    $hashes['native-helper.cs'] -ceq [string]$receipt.nativeHelperSha256 -and
    $hashes['probe.cjs'] -ceq [string]$receipt.probeSha256
  if (-not $record.sourceIntegrity.verified) { throw 'External source-integrity gate failed closed' }

  Add-Type -Path $nativeSource
  $session = New-Object Sir02JobMembershipDiagnosticV2.NativeSession
  $record.trustedConhostImagePath = $session.TrustedConsoleHostPath()
  [string[]]$processArguments = @($probe,$token,$ready,$release)
  $commandLine = [string]::Join(' ',[string[]](@((Quote-WindowsArgument $node)) + @($processArguments | ForEach-Object { Quote-WindowsArgument $_ })))
  $session.StartSyntheticParent($node,$commandLine,$root)
  $record.parentPid = $session.ParentPid
  $record.expectedMemberPidSet = @($session.ParentPid)
  $readyWatch = [Diagnostics.Stopwatch]::StartNew()
  while (-not (Test-Path -LiteralPath $ready -PathType Leaf) -and $readyWatch.ElapsedMilliseconds -lt 3000) { Start-Sleep -Milliseconds 25 }
  $readyRecord = if (Test-Path -LiteralPath $ready -PathType Leaf) { Get-Content -LiteralPath $ready -Raw | ConvertFrom-Json } else { $null }
  $observed = @($session.ReadJobMembers() | Sort-Object -Unique)
  $record.observedMemberPidSet = $observed
  $record.unexpectedMemberPidSet = @($observed | Where-Object { $_ -ne $session.ParentPid })
  $record.missingExpectedPidSet = @(if ($observed -notcontains $session.ParentPid) { $session.ParentPid })
  $nodeNative = $session.InspectMember([int]$session.ParentPid)
  $rows = New-Object System.Collections.ArrayList
  foreach ($memberPid in $observed) {
    $native = $session.InspectMember([int]$memberPid)
    $cim = CimMember ([int]$memberPid)
    $nativeTime = [long]$native.CreationFileTimeUtc
    $timeAgreement = $cim.success -and $nativeTime -gt 0 -and [Math]::Abs([double]($nativeTime - [long]$cim.creationFileTimeUtc)) -le 10000000
    $tokenPresent = $null -ne $cim.commandLine -and $cim.commandLine.Contains($token)
    $checks = [ordered]@{}
    $class = $unknownClass
    if ($memberPid -eq $session.ParentPid) {
      $checks.explicitAssignment = $session.ParentExplicitlyAssigned
      $checks.image = $native.ImageQuerySucceeded -and [string]::Equals($native.ImagePath,$node,[StringComparison]::OrdinalIgnoreCase)
      $checks.creationBoundToOwnedHandle = $nativeTime -gt 0 -and $nativeTime -eq $session.ParentCreationFileTimeUtc
      $checks.cimTimeAgreement = $timeAgreement
      $checks.parentPid = $cim.success -and $cim.parentPid -eq $PID
      $checks.tokenAndProbePath = $tokenPresent -and $cim.commandLine.Contains($probe)
      $checks.readyRecord = $null -ne $readyRecord -and [int]$readyRecord.pid -eq $session.ParentPid -and [string]$readyRecord.token -ceq $token
      $checks.jobMembership = $native.Opened -and $native.MembershipQuerySucceeded -and $native.InJob
      $checks.sessionAvailable = $native.SessionQuerySucceeded
      $checks.alive = $native.StateQuerySucceeded -and $native.Alive -and $session.OwnedParentAliveBeforeRelease()
      if (@($checks.Values | Where-Object { $_ -ne $true }).Count -eq 0) { $class = $ownedClass }
    } else {
      $checks.trustedImage = $native.ImageQuerySucceeded -and [string]::Equals($native.ImagePath,$record.trustedConhostImagePath,[StringComparison]::OrdinalIgnoreCase)
      $checks.exactNodeParent = $cim.success -and $cim.parentPid -eq $session.ParentPid
      $checks.creationAfterNode = $nativeTime -ge $session.ParentCreationFileTimeUtc -and $nativeTime -le [DateTime]::UtcNow.ToFileTimeUtc()
      $checks.creationWithinFiveSeconds = $checks.creationAfterNode -and ($nativeTime - $session.ParentCreationFileTimeUtc) -le 50000000
      $checks.cimTimeAgreement = $timeAgreement
      $checks.sameSession = $native.SessionQuerySucceeded -and $nodeNative.SessionQuerySucceeded -and $native.SessionId -eq $nodeNative.SessionId
      $checks.jobMembership = $native.Opened -and $native.MembershipQuerySucceeded -and $native.InJob
      $checks.alive = $native.StateQuerySucceeded -and $native.Alive
      if (@($checks.Values | Where-Object { $_ -ne $true }).Count -eq 0) { $class = $candidateClass }
    }
    $row = [ordered]@{
      pid=[int]$memberPid; membershipClass=$class; preReleaseClass=$class; imagePath=$native.ImagePath
      parentPid=$cim.parentPid; nativeCreationFileTimeUtc=$nativeTime; cimCreationUtc=$cim.createdUtc
      sessionId=$(if ($native.SessionQuerySucceeded) { $native.SessionId } else { $null })
      commandLine=$cim.commandLine; tokenObserved=$tokenPresent; inJob=$native.InJob; aliveBeforeRelease=$native.Alive
      explicitAssignment=$memberPid -eq $session.ParentPid -and $session.ParentExplicitlyAssigned; inheritedMembership='Not Determined'
      checks=$checks; nativeErrors=[ordered]@{open=$native.OpenError; image=$native.ImageError; membership=$native.MembershipError; session=$native.SessionError; state=$native.StateError}
      cimErrorCategory=$cim.errorCategory; observedUtc=[DateTime]::UtcNow.ToString('o')
      evidenceSources=@('CreateProcessW owned handle','GetProcessTimes','QueryFullProcessImageNameW','IsProcessInJob','ProcessIdToSessionId','WaitForSingleObject','JobObjectBasicProcessIdList','local Win32_Process CIM','synthetic ready record')
    }
    [void]$rows.Add($row)
    if ($class -eq $candidateClass) { $candidate = $row }
  }
  $record.members = @($rows.ToArray())
  $confirmed = @($session.ReadJobMembers() | Sort-Object -Unique)
  $record.preReleaseConfirmationPidSet = $confirmed
  $membershipStable = [string]::Join(',', [string[]]$observed) -ceq [string]::Join(',', [string[]]$confirmed)
  $nodeAllowed = @($rows.ToArray() | Where-Object { $_.pid -eq $session.ParentPid -and $_.membershipClass -eq $ownedClass }).Count -eq 1
  $unknownCount = @($rows.ToArray() | Where-Object { $_.membershipClass -eq $unknownClass }).Count
  $candidateCount = @($rows.ToArray() | Where-Object { $_.membershipClass -eq $candidateClass }).Count
  if ($membershipStable -and $nodeAllowed -and $unknownCount -eq 0 -and $candidateCount -le 1 -and $rows.Count -le 2) {
    $record.preReleaseGate = 'PASS — Exact Node parent plus at most one conhost candidate'
    if ($null -ne $candidate) {
      $record.expectedMemberPidSet = @($session.ParentPid,$candidate.pid)
      $record.lifecycleCorrelation.candidatePid = $candidate.pid
      $record.lifecycleCorrelation.candidateCreationFileTimeUtc = $candidate.nativeCreationFileTimeUtc
      $session.RetainCandidateConsoleHost([int]$candidate.pid,[long]$candidate.nativeCreationFileTimeUtc)
    }
  } else { $record.preReleaseGate = 'FAIL — Unknown or unsafe member'; $record.result = $fail }
} catch {
  $record.errorCategory = $_.Exception.GetType().Name
  if ($record.result -ne $fail) { $record.result = 'Needs Clarification' }
} finally {
  if ($null -ne $session) {
    try {
      [IO.File]::WriteAllText($release,$token,(New-Object Text.UTF8Encoding($false)))
      $record.safeCleanup.cooperativeSignalIssued = $true
      $record.lifecycleCorrelation.parentReleaseUtc = [DateTime]::UtcNow.ToString('o')
      $record.safeCleanup.knownParentExited = $session.WaitForOwnedParent(12000)
      if ($record.safeCleanup.knownParentExited) { $record.lifecycleCorrelation.parentExitUtc = [DateTime]::UtcNow.ToString('o') }
      if (-not $record.safeCleanup.knownParentExited -and $session.ParentPid -gt 0) {
        $record.safeCleanup.exactOwnedHandleFallbackUsed = $true
        [void]$session.TerminateVerifiedOwnedParentOnly()
        $record.safeCleanup.knownParentExited = $session.WaitForOwnedParent(2000)
      }
      $record.lifecycleCorrelation.originalParentNoLongerAlive = -not $session.OriginalOwnedParentStillPresent()
      if ($record.safeCleanup.knownParentExited) {
        try {
          $remaining = @(Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $($session.ParentPid)" -OperationTimeoutSec 2 -ErrorAction Stop)
          $record.lifecycleCorrelation.parentPidAbsent = $remaining.Count -eq 0
          if ($remaining.Count -gt 0) { $record.lifecycleCorrelation.parentPidAbsenceErrorCategory = 'PIDStillPresentOrReused' }
        } catch { $record.lifecycleCorrelation.parentPidAbsent = $false; $record.lifecycleCorrelation.parentPidAbsenceErrorCategory = $_.Exception.GetType().Name }
      }
      if ($null -ne $candidate -and $session.CompanionPid -eq [int]$candidate.pid -and
          $record.safeCleanup.knownParentExited -and -not $record.safeCleanup.exactOwnedHandleFallbackUsed) {
        $aliveAfterParent = $session.RetainedConsoleHostAliveAfterParent()
        $record.lifecycleCorrelation.conhostAliveImmediatelyAfterParent = $aliveAfterParent
        if ($aliveAfterParent) { $record.lifecycleCorrelation.conhostExitedNaturally = $session.WaitForRetainedConsoleHostExit(5000) }
        if ($record.lifecycleCorrelation.conhostExitedNaturally -eq $true) {
          $record.lifecycleCorrelation.conhostExitObservedUtc = [DateTime]::UtcNow.ToString('o')
          $record.lifecycleCorrelation.result = 'PASS — Same creation-bound conhost exited after cooperative parent exit'
          $candidate.membershipClass = $companionClass
        } else { $record.lifecycleCorrelation.result = 'Needs Clarification — Candidate exit order or bounded exit unproven' }
      } elseif ($null -eq $candidate) { $record.lifecycleCorrelation.result = 'Not Applicable — No candidate conhost' }
      else { $record.lifecycleCorrelation.result = 'Needs Clarification — Parent exit or candidate identity unavailable' }
      $record.safeCleanup.result = if ($record.safeCleanup.knownParentExited -and $record.lifecycleCorrelation.originalParentNoLongerAlive -and $record.lifecycleCorrelation.parentPidAbsent -and -not $record.safeCleanup.exactOwnedHandleFallbackUsed) { 'CooperativeOrNaturalExitVerified' }
        elseif ($record.safeCleanup.knownParentExited -and $record.lifecycleCorrelation.originalParentNoLongerAlive) { 'TargetedOwnedParentFallbackOrPidAbsenceUnverified — Cannot Pass' }
        else { 'KnownParentExitUnverified — Cannot Pass' }
    } catch { $record.safeCleanup.result = 'CleanupError — Cannot Pass'; $record.safeCleanup.errorCategory = $_.Exception.GetType().Name }
    $session.Dispose() # Zero Job limit flags: no kill-on-close.
    $record.safeCleanup.nativeHandleCleanupSucceeded = $session.HandleCleanupSucceeded
    $record.nativeSteps = @($session.Steps)
  }
  if ($record.result -ne $fail -and $record.sourceIntegrity.verified -and
      $record.preReleaseGate -eq 'PASS — Exact Node parent plus at most one conhost candidate' -and
      $record.safeCleanup.result -eq 'CooperativeOrNaturalExitVerified' -and
      $record.safeCleanup.nativeHandleCleanupSucceeded -eq $true -and
      ($null -eq $candidate -or $candidate.membershipClass -eq $companionClass)) { $record.result = $pass }
  elseif ($record.result -ne $fail) { $record.result = 'Needs Clarification' }
  $record.endUtc = [DateTime]::UtcNow.ToString('o')
  [IO.File]::WriteAllText($recordPath,(ConvertTo-Json -InputObject $record -Depth 14),(New-Object Text.UTF8Encoding($false)))
}
Write-Output ('DIAGNOSTIC_RESULT=' + $record.result)
Write-Output ('DIAGNOSTIC_RECORD=' + $recordPath)
if ($record.result -ne $pass) { exit 1 }
