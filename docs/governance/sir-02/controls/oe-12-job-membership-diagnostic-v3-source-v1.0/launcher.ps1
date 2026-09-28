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
$token = 'SIR02-OE12-JOB-MEMBERSHIP-DIAGNOSTIC-V3-' + $start.ToString('yyyyMMddTHHmmssfffZ')
$capture = Join-Path $env:TEMP $token
if (Test-Path -LiteralPath $capture) { throw 'Capture directory already exists' }
[void](New-Item -ItemType Directory -Path $capture)
$recordPath = Join-Path $capture 'diagnostic-raw.json'
$ready = Join-Path $capture 'parent-ready.json'
$release = Join-Path $capture 'parent-release.flag'
$dash = [string][char]0x2014
$pass = 'PASS ' + $dash + ' Exit Chronology Conclusively Established'
$fail = 'FAIL ' + $dash + ' Lifecycle Attribution Not Supported'
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
  authorizationDecision='320698beba43d2aab9af30e74f2c983b93a67f55'
  governanceLinkage='c98415be85397d2e0e118bd715d5b8df2395ad9f'
  lifecycleForensicAnalysis='4e3936491e56b0bec58afc28b43b5c3e0278bec8'
  priorAttributionAnalysis='9136b1aa0a49e7753efd9e23d652787d6d398549'
  diagnosticToken=$token; startUtc=$start.ToString('o'); endUtc=$null
  sourceIntegrity=[ordered]@{receiptPath=$IntegrityReceiptPath; expectedBundleSha256=$ExpectedBundleSha256; verified=$false; bundleSha256=$null; sourceHashes=@{}; errorCategory=$null}
  expectedTopology=@('PowerShell launcher outside Job','in-process native helper outside Job','one synthetic Node parent in Job','optional one OS-managed conhost.exe in Job')
  parentPid=$null; expectedMemberPidSet=@(); observedMemberPidSet=@(); preReleaseConfirmationPidSet=@(); unexpectedMemberPidSet=@(); missingExpectedPidSet=@()
  trustedConhostImagePath=$null; members=@(); preReleaseGate='Not Evaluated'
  lifecycleCorrelation=[ordered]@{parentReleaseStartUtc=$null; parentReleaseUtc=$null; parentExitUtc=$null; originalParentNoLongerAlive=$null; parentPidAbsent=$null; parentPidAbsenceErrorCategory=$null; candidatePid=$null; candidateCreationFileTimeUtc=$null; nodeWaitBoundMs=12000; conhostObservationWindowMs=5000; nodeAliveImmediatelyBeforeRelease=$null; conhostAliveImmediatelyBeforeRelease=$null; result='Not Evaluated'}
  lifecycleMeasurement=[ordered]@{nodeExitObservation=$null; nodeExitAfterFallback=$null; conhostExitObservation=$null; nodeCreationFileTimeUtc=$null; conhostCreationFileTimeUtc=$null; nodeCreationUtc=$null; conhostCreationUtc=$null; nodeKernelExitFileTimeUtc=$null; conhostKernelExitFileTimeUtc=$null; nodeKernelExitUtc=$null; conhostKernelExitUtc=$null; nodeTerminationObservationUtc=$null; conhostTerminationObservationUtc=$null; exitOrdering=$null; conhostMinusNodeExitTicks=$null; signedExitDeltaMilliseconds=$null; result='Not Evaluated'}
  lifecycleEvaluation=[ordered]@{criterion='Conhost kernel exit must be after Node kernel exit, after cooperative release, and within the bounded lifecycle observation'; satisfied=$false; result='Not Evaluated'}
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
  $session = New-Object Sir02JobMembershipDiagnosticV3.NativeSession
  $record.trustedConhostImagePath = $session.TrustedConsoleHostPath()
  [string[]]$processArguments = @($probe,$token,$ready,$release)
  $commandLine = [string]::Join(' ',[string[]](@((Quote-WindowsArgument $node)) + @($processArguments | ForEach-Object { Quote-WindowsArgument $_ })))
  $session.StartSyntheticParent($node,$commandLine,$root)
  $record.parentPid = $session.ParentPid
  $record.lifecycleMeasurement.nodeCreationFileTimeUtc = [long]$session.ParentCreationFileTimeUtc
  $record.lifecycleMeasurement.nodeCreationUtc = [DateTime]::FromFileTimeUtc([long]$session.ParentCreationFileTimeUtc).ToString('o')
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
      $record.lifecycleMeasurement.conhostCreationFileTimeUtc = [long]$session.CompanionCreationFileTimeUtc
      $record.lifecycleMeasurement.conhostCreationUtc = [DateTime]::FromFileTimeUtc([long]$session.CompanionCreationFileTimeUtc).ToString('o')
    }
  } else { $record.preReleaseGate = 'FAIL — Unknown or unsafe member'; $record.result = $fail }
} catch {
  $record.errorCategory = $_.Exception.GetType().Name
  if ($record.result -ne $fail) { $record.result = 'Needs Clarification' }
} finally {
  if ($null -ne $session) {
    try {
      try {
        $record.lifecycleCorrelation.nodeAliveImmediatelyBeforeRelease = $session.OwnedParentAliveBeforeRelease()
        if ($null -ne $candidate -and $session.CompanionPid -eq [int]$candidate.pid) {
          $record.lifecycleCorrelation.conhostAliveImmediatelyBeforeRelease = $session.RetainedConsoleHostAliveBeforeRelease()
        }
      } catch {
        $record.lifecycleCorrelation.nodeAliveImmediatelyBeforeRelease = $false
        $record.lifecycleCorrelation.conhostAliveImmediatelyBeforeRelease = $false
        $record.safeCleanup.errorCategory = $_.Exception.GetType().Name
      }
      if (-not $record.lifecycleCorrelation.nodeAliveImmediatelyBeforeRelease -or
          ($null -ne $candidate -and -not $record.lifecycleCorrelation.conhostAliveImmediatelyBeforeRelease)) {
        $record.preReleaseGate = 'FAIL — Required exact process handle not nonsignaled immediately before release'
        $record.result = $fail
      }
      $record.lifecycleCorrelation.parentReleaseStartUtc = [DateTime]::UtcNow.ToString('o')
      [IO.File]::WriteAllText($release,$token,(New-Object Text.UTF8Encoding($false)))
      $releaseCompletedUtc = [DateTime]::UtcNow
      $record.safeCleanup.cooperativeSignalIssued = $true
      $record.lifecycleCorrelation.parentReleaseUtc = $releaseCompletedUtc.ToString('o')
      $nodeExit = $session.ObserveOwnedParentExit(12000)
      $record.lifecycleMeasurement.nodeExitObservation = $nodeExit
      $record.lifecycleMeasurement.nodeTerminationObservationUtc = $nodeExit.ObservationUtc
      $record.safeCleanup.knownParentExited = $nodeExit.Signaled
      if ($nodeExit.Signaled) { $record.lifecycleCorrelation.parentExitUtc = $nodeExit.ObservationUtc }
      if (-not $record.safeCleanup.knownParentExited -and $session.ParentPid -gt 0) {
        $record.safeCleanup.exactOwnedHandleFallbackUsed = $true
        [void]$session.TerminateVerifiedOwnedParentOnly()
        $nodeExitAfterFallback = $session.ObserveOwnedParentExit(2000)
        $record.lifecycleMeasurement.nodeExitAfterFallback = $nodeExitAfterFallback
        $record.safeCleanup.knownParentExited = $nodeExitAfterFallback.Signaled
      }
      $record.lifecycleCorrelation.originalParentNoLongerAlive = -not $session.OriginalOwnedParentStillPresent()
      if ($record.safeCleanup.knownParentExited) {
        try {
          $remaining = @(Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $($session.ParentPid)" -OperationTimeoutSec 2 -ErrorAction Stop)
          $record.lifecycleCorrelation.parentPidAbsent = $remaining.Count -eq 0
          if ($remaining.Count -gt 0) { $record.lifecycleCorrelation.parentPidAbsenceErrorCategory = 'PIDStillPresentOrReused' }
        } catch { $record.lifecycleCorrelation.parentPidAbsent = $false; $record.lifecycleCorrelation.parentPidAbsenceErrorCategory = $_.Exception.GetType().Name }
      }
      $conhostExit = $null
      if ($null -ne $candidate -and $session.CompanionPid -eq [int]$candidate.pid -and $record.safeCleanup.knownParentExited) {
        # The same retained handle is queried even when it was already signaled before this call.
        $conhostExit = $session.ObserveRetainedConsoleHostExit(5000)
        $record.lifecycleMeasurement.conhostExitObservation = $conhostExit
        $record.lifecycleMeasurement.conhostTerminationObservationUtc = $conhostExit.ObservationUtc
      }

      $nodeTimingValid = $null -ne $nodeExit -and $nodeExit.Signaled -and $nodeExit.TimesSucceeded -and
        $nodeExit.CreationMatchesExpected -and $nodeExit.ExitAfterCreation -and -not $record.safeCleanup.exactOwnedHandleFallbackUsed
      $conhostTimingValid = $null -ne $conhostExit -and $conhostExit.Signaled -and $conhostExit.TimesSucceeded -and
        $conhostExit.CreationMatchesExpected -and $conhostExit.ExitAfterCreation
      if ($nodeTimingValid) {
        $record.lifecycleMeasurement.nodeCreationFileTimeUtc = [long]$nodeExit.CreationFileTimeUtc
        $record.lifecycleMeasurement.nodeKernelExitFileTimeUtc = [long]$nodeExit.ExitFileTimeUtc
        $record.lifecycleMeasurement.nodeCreationUtc = [DateTime]::FromFileTimeUtc([long]$nodeExit.CreationFileTimeUtc).ToString('o')
        $record.lifecycleMeasurement.nodeKernelExitUtc = [DateTime]::FromFileTimeUtc([long]$nodeExit.ExitFileTimeUtc).ToString('o')
      }
      if ($conhostTimingValid) {
        $record.lifecycleMeasurement.conhostCreationFileTimeUtc = [long]$conhostExit.CreationFileTimeUtc
        $record.lifecycleMeasurement.conhostKernelExitFileTimeUtc = [long]$conhostExit.ExitFileTimeUtc
        $record.lifecycleMeasurement.conhostCreationUtc = [DateTime]::FromFileTimeUtc([long]$conhostExit.CreationFileTimeUtc).ToString('o')
        $record.lifecycleMeasurement.conhostKernelExitUtc = [DateTime]::FromFileTimeUtc([long]$conhostExit.ExitFileTimeUtc).ToString('o')
      }
      if ($nodeTimingValid -and $conhostTimingValid) {
        $nodeExitTicks = [long]$nodeExit.ExitFileTimeUtc
        $conhostExitTicks = [long]$conhostExit.ExitFileTimeUtc
        $deltaTicks = $conhostExitTicks - $nodeExitTicks
        $record.lifecycleMeasurement.conhostMinusNodeExitTicks = $deltaTicks
        $record.lifecycleMeasurement.signedExitDeltaMilliseconds = [decimal]$deltaTicks / [decimal]10000
        $record.lifecycleMeasurement.exitOrdering = if ($deltaTicks -gt 0) { 'Node before conhost' }
          elseif ($deltaTicks -lt 0) { 'Conhost before Node' } else { 'Equal kernel exit times' }
        $record.lifecycleMeasurement.result = 'Complete — Both exact retained-handle kernel exit times available'
        $nodeObservationUtc = [DateTime]::Parse([string]$nodeExit.ObservationUtc,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::AdjustToUniversal)
        $nodeAfterRelease = $nodeExitTicks -ge $releaseCompletedUtc.ToFileTimeUtc()
        $conhostAfterNode = $deltaTicks -gt 0
        $conhostWithinBound = $conhostExitTicks -le $nodeObservationUtc.AddMilliseconds(5000).ToFileTimeUtc()
        $record.lifecycleEvaluation.nodeAfterRelease = $nodeAfterRelease
        $record.lifecycleEvaluation.conhostAfterNode = $conhostAfterNode
        $record.lifecycleEvaluation.conhostWithinBound = $conhostWithinBound
        $record.lifecycleEvaluation.satisfied = $nodeAfterRelease -and $conhostAfterNode -and $conhostWithinBound
        $record.lifecycleEvaluation.result = if ($record.lifecycleEvaluation.satisfied) { 'Satisfied — Existing lifecycle criterion' }
          else { 'Failed — Measured chronology does not satisfy existing lifecycle criterion' }
        $record.lifecycleCorrelation.result = $record.lifecycleEvaluation.result
        if ($record.lifecycleEvaluation.satisfied) { $candidate.membershipClass = $companionClass }
        else { $record.result = $fail }
      } else {
        $record.lifecycleMeasurement.result = 'Incomplete — Required exact-handle kernel exit chronology unavailable'
        $record.lifecycleEvaluation.result = 'Needs Clarification — Missing valid Node/conhost kernel exit chronology'
        $record.lifecycleCorrelation.result = $record.lifecycleEvaluation.result
      }
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
      $record.lifecycleCorrelation.nodeAliveImmediatelyBeforeRelease -eq $true -and
      $record.lifecycleCorrelation.conhostAliveImmediatelyBeforeRelease -eq $true -and
      $record.lifecycleMeasurement.result -eq 'Complete — Both exact retained-handle kernel exit times available' -and
      $record.lifecycleEvaluation.satisfied -eq $true -and
      $record.safeCleanup.result -eq 'CooperativeOrNaturalExitVerified' -and
      $record.safeCleanup.nativeHandleCleanupSucceeded -eq $true -and
      $null -ne $candidate -and $candidate.membershipClass -eq $companionClass) { $record.result = $pass }
  elseif ($record.result -ne $fail) { $record.result = 'Needs Clarification' }
  $record.endUtc = [DateTime]::UtcNow.ToString('o')
  [IO.File]::WriteAllText($recordPath,(ConvertTo-Json -InputObject $record -Depth 14),(New-Object Text.UTF8Encoding($false)))
}
Write-Output ('DIAGNOSTIC_RESULT=' + $record.result)
Write-Output ('DIAGNOSTIC_RECORD=' + $recordPath)
if ($record.result -ne $pass) { exit 1 }
