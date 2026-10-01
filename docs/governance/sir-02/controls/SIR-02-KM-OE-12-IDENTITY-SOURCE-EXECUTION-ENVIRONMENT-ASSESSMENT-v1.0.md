# SIR-02 KM OE-12 Mandatory Identity Source / Execution Environment Assessment v1.0

| Field | Value |
| --- | --- |
| Purpose | Assess two possible paths to restore mandatory non-formal process attribution; no path is selected or authorized |
| Assessment date | 2026-09-28 |
| Controlling Class C analysis | `b112e94e87ccfab9b5850890ab64ffe744144009` |
| Diagnostic v3 evidence / exact source / readiness | `27aeb464b2fd6aef2b63c7ed33743d75288126a7` / `9f8480b6c8f44cba616ff2bf80094a8cb664de7a` / `2773025d84488f0b3d36732c643f96a7aa533296` |
| Current diagnostic result | `FAIL — Lifecycle Attribution Not Supported` |
| Option A feasibility | **Not Currently Feasible** under the approved attribution contract; further identity-source proof and an explicit criterion decision would be needed |
| Option B feasibility | **Needs Clarification**; a CIM-capable host and the reason for the current failure have not been established |
| Decision status | No option selected; owner decision required |

## Evidence boundary and current facts

This is a read-only assessment of the published Class C record and exact v3 source, supplemented by Microsoft Windows API documentation. It is not a Diagnostic v4 design, authorization, environment repair, process probe, or OE-12 operational-evidence run. The v3 integrity result remains `19/19 MATCH`; manifest SHA-256 is `d7f647cfa749af7898dff4bad2cf158b93255c38b2ed12dafe97523fd9d93ea9`.

The mandatory membership-attribution gate stopped before conhost exit measurement. **Identity attribution is the demonstrated blocker; kernel exit-time measurement implementation is not.** The exact Node handle was retained, was nonsignaled before release, and yielded a valid kernel exit FILETIME through `GetProcessTimes` after exit. No conhost handle was retained for exit chronology because conhost attribution failed. Three retained `CimException` categories cover the conhost identity query, Node identity query, and Node post-exit PID-absence query; their messages, HRESULTs, provider statuses, and exact failure times were not retained. The underlying CIM cause remains **undetermined**.

| Mandatory fact still unavailable | Existing v3 requirement | Already available trusted evidence that does **not** replace it |
| --- | --- | --- |
| Exact Node parent PID | OS-observed `ParentProcessId` equals the launcher PID | `CreateProcessW` created and retained the exact Node handle, but v3 has no independent parent-PID readback. |
| Exact conhost parent PID | OS-observed `ParentProcessId` equals the exact Node PID | Trusted conhost image, same session, Job membership, and creation proximity do not prove parentage. Prior-run PIDs cannot be imported. |
| CIM/native creation-time agreement | Independent CIM `CreationDate` agrees with handle-bound native `GetProcessTimes` within the approved tolerance | Native creation FILETIMEs exist; repeating the same native source is not independent CIM/native agreement. |
| Actual Node command-line token and probe path | CIM `CommandLine` contains both the synthetic token and probe path | Launcher input and child ready record prove intended invocation and child response, not the required OS-observed actual command line. |

The existing helper **does** retain image paths, native creation times, exact Node handle, Job member set and membership, pre-release liveness, and Node kernel exit FILETIME. `ProcessIdToSessionId` directly measured session ID `5` for both Node and conhost; session consistency is not CIM-dependent.

## Option A — Trusted native identity source

Option A asks whether the four missing facts can be obtained without CIM **while preserving every approved attribution criterion**. The candidates below are analysis subjects, not approved replacements. “Rights/elevation” describes what would need to be verified; it is not permission to request elevation or change the host. No proposed candidate is implemented in the exact v3 native helper.

### A1. Exact Node parent PID

| Dimension | Assessment |
| --- | --- |
| Candidate source | Public `CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS)` with `Process32FirstW`/`Process32NextW` exposes `PROCESSENTRY32W.th32ParentProcessID`; alternative `NtQueryInformationProcess(ProcessBasicInformation).InheritedFromUniqueProcessId` uses an internal Windows interface. |
| Binding and provenance | Toolhelp is a **PID-based, systemwide snapshot**, not bound to the owned Node handle. An NT query would be **handle-bound** to that exact handle, but its interface is internal and version-sensitive. Both require comparison with the retained Node creation identity and live launcher identity. |
| Access / elevation | Toolhelp process-list snapshot is read-only; exact availability and host policy must be verified. NT query requires a suitable query-capable process handle; the owned `CreateProcessW` handle exists, but this proposed call has not been tested. Elevation is **not established as necessary or unnecessary** in this host. No elevation is authorized. |
| Lifetime / PID reuse | Capture while the processes are alive. A later snapshot cannot prove the original exited process's parent. Snapshot PID alone is vulnerable to reuse; bind the row to retained-handle PID, native creation FILETIME, and observation time, and fail on ambiguity. |
| Deterministic testability | A separately authorized synthetic parent/child check would need to compare the candidate reading against the exact owned handle and known launcher identity under bounded timing. Current helper support: **none**. Temporary diagnostic code: **required**. Production/runtime code: **none proposed**. |

The public snapshot enumerates host processes beyond the synthetic target. That broad observation is a security/data-minimization concern under the synthetic-only boundary, even if unrelated rows are discarded. It cannot be treated as authorized merely because its API is public. The internal NT alternative avoids systemwide enumeration but creates compatibility and query-right risks. [Microsoft documents the snapshot's process scope](https://learn.microsoft.com/en-us/windows/win32/api/tlhelp32/nf-tlhelp32-createtoolhelp32snapshot), [the parent-PID field](https://learn.microsoft.com/en-us/windows/win32/api/tlhelp32/ns-tlhelp32-processentry32w), and [the internal NT interface and its instability](https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntqueryinformationprocess).

### A2. Exact conhost parent PID

| Dimension | Assessment |
| --- | --- |
| Candidate source | The same public Toolhelp parent-PID snapshot, or an internal `NtQueryInformationProcess(ProcessBasicInformation)` query on a newly retained, creation-bound conhost handle. |
| Binding and provenance | Toolhelp is PID-based and systemwide. The NT route is handle-bound to the current conhost instance if `OpenProcess` succeeds and creation FILETIME matches the pre-release row. Neither result exists in v3. |
| Access / elevation | Current v3 `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE)` succeeded for conhost. Sufficiency of that right for the proposed internal query is **unverified**; additional rights, access denial, or elevation cannot be assumed away. No elevation is authorized. |
| Lifetime / PID reuse | Capture before conhost exits; retain its exact query/synchronize handle and creation time. A later PID-only query or a prior diagnostic's parent PID is not valid. Reject a changed PID/creation identity or missing parent. |
| Deterministic testability | A separately authorized diagnostic must show `conhost current instance → exact Node current instance`, including creation-bound parent handle and complete Job membership. Current helper support: image, creation, session, Job, liveness **only**; parent readback **none**. Temporary code: **required**. Production/runtime code: **none proposed**. |

The current Class C evidence does **not** prove that PID `24432` had parent PID `24588`. A candidate native parent field would need independent validation in the same future run. [Microsoft warns that process IDs can be reused and a reported parent PID can refer to a later process](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process).

### A3. Actual Node command line, token, and probe path

| Dimension | Assessment |
| --- | --- |
| Candidate source | A handle-bound read of the target process's `PEB.ProcessParameters.CommandLine` using an internal process-information/PEB layout plus public `ReadProcessMemory`; a process-creation audit event is a distinct, configuration-dependent candidate. Public `GetCommandLineW` returns only the **calling** process's command line and does not satisfy this field for Node. |
| Binding and provenance | PEB reading could use the exact owned Node handle while it is alive, but the PEB and process-parameter layouts are internal and may change. The command-line memory is target-process memory, not an immutable kernel identity receipt. Audit event 4688 is event/PID based, requires strict time/PID/creation correlation, and its command-line field is disabled by default. |
| Access / elevation | `ReadProcessMemory` requires `PROCESS_VM_READ`; the `CreateProcessW` handle has broad rights for this owned synthetic child, but the end-to-end path has not been validated in this host. An audit-event path needs enabled process-creation and command-line auditing plus Security log access; elevated or policy permissions may be needed. **No elevation, policy, or configuration change is authorized.** |
| Lifetime / PID reuse | PEB read must occur while the exact process is alive; post-exit access is not a supported evidence plan. Exact-handle binding mitigates PID reuse, but memory contents can change. Audit events can persist, yet require creation-event correlation and protected retention/sanitization. |
| Deterministic testability | A future synthetic probe would have to compare the actual retrieved command line against the exact token and probe path under bounded timing and reject missing/changed/ambiguous values. Existing helper: **no external-process command-line retrieval**. Temporary code: **required**; no production/runtime code proposed. |

No currently implemented, approved, stable public API in the helper returns another process's actual command line. Neither the launcher's constructed string nor `probe.cjs` ready output may silently replace the mandatory OS-observed field. The internal PEB route and systemwide audit route have unresolved trust, rights, privacy, and reproducibility questions. [Microsoft documents `GetCommandLine` for the current process](https://learn.microsoft.com/en-us/windows/win32/procthread/obtaining-additional-process-information), [the changeable process-parameter structure](https://learn.microsoft.com/en-us/windows/win32/api/winternl/ns-winternl-rtl_user_process_parameters), [`ReadProcessMemory` rights](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-readprocessmemory), and [the policy and plaintext exposure of process-command-line auditing](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/component-updates/command-line-process-auditing).

### A4. Required CIM/native creation-time agreement

| Dimension | Assessment |
| --- | --- |
| Candidate source | `GetProcessTimes` already supplies a handle-bound kernel creation FILETIME. A separate process snapshot or event source might provide another observed creation time, but **neither is CIM**. An internal system-process-information snapshot would be lower-level, systemwide, and not yet validated for true independence from the same kernel time source. |
| Binding and provenance | Native `GetProcessTimes` is exact-handle evidence; an alternative snapshot/event is PID/event based and must be bound to exact handle, creation identity, and observation interval. Reading `GetProcessTimes` twice is not independent corroboration. |
| Access / elevation | Existing native query needs `PROCESS_QUERY_LIMITED_INFORMATION`, already demonstrated for both members. Snapshot/event rights and possible policy/elevation requirements are unverified; no new privilege is authorized. |
| Lifetime / PID reuse | Capture any process snapshot while alive; event evidence may persist only if configured before process creation. PID-only matching can select a replacement process, so require the retained handle and creation-time binding. |
| Deterministic testability | A proposed replacement must prove genuinely independent provenance, explicit tolerance, missing/mismatch rejection, and behavior across process exit. Current helper: native time **yes**, independent second source **no**. Temporary diagnostic code or event instrumentation: **required**. Production/runtime code: **none proposed**. |

The **literal approved criterion is CIM/native agreement**. A non-CIM source cannot satisfy that wording, however strong it may later prove to be. Option A therefore **requires an explicit attribution-criterion change** before it could support PASS. This assessment does not make that change or claim that a substitute source has been validated. [Microsoft documents `GetProcessTimes` as a handle-based creation/exit-time API](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getprocesstimes).

### Option A feasibility result

**Not Currently Feasible** under the approved attribution contract. The exact CIM/native time-agreement criterion cannot be met with no CIM; an independently trusted actual Node command-line source is not yet demonstrated. Public parent-PID snapshots are PID-based and systemwide; internal handle-bound alternatives require separate compatibility, rights, security, and determinism proof. An owner could authorize **analysis/design of an identity-source path**, but that would not authorize use of a replacement, any criterion change, a Diagnostic v4, or another run. No production/runtime file or platform-architecture change is proposed.

## Option B — Approved CIM-capable execution environment

Option B retains the **existing** Node/conhost parent, command-line token/probe-path, and CIM/native time-agreement gates without weakening them. The exact v3 source uses Windows PowerShell 5.1 local `Get-CimInstance -ClassName Win32_Process` calls; with neither `ComputerName` nor `CimSession`, this is local WMI over COM. `Win32_Process` exposes `ParentProcessId`, `CommandLine`, and `CreationDate`. It does not follow that the present host's `CimException` is repairable or that another host will reproduce the same conhost topology. [PowerShell's 5.1 CIM cmdlet documentation](https://learn.microsoft.com/en-us/powershell/module/cimcmdlets/get-ciminstance?view=powershell-5.1) and [Microsoft's `Win32_Process` class reference](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process) define these interfaces.

| Requirement | Minimum controlled condition / evidence to retain |
| --- | --- |
| Host and PowerShell | Approved Windows host with Windows PowerShell **5.1**, compatible existing `node.exe`, same launcher/native-helper architecture, same synthetic console mode and Job limit flags. Record OS build, PowerShell/Node versions and paths, console/session identity, architecture, shell host, sandbox profile, working directory, and process token/elevation state. |
| CIM provider | `Winmgmt` and the `CIMWin32` provider / `root\cimv2` `Win32_Process` class functioning for each **current** synthetic Node and OS-managed conhost PID while alive. A bounded, separately authorized preflight must show the three required properties and record empty/denied/timeout states. No such preflight is authorized here. [WMI service/provider architecture](https://learn.microsoft.com/en-us/windows/win32/wmisdk/wmi-infrastructure). |
| Rights and elevation | The approved non-elevated account must have local namespace and target-process property access sufficient for the filtered query. Local WMI access can depend on namespace ACL, provider hosting, process protection, and account token. **Administrator elevation is not established as required**; if needed, it would be a separate security decision and might alter console/conhost behavior. No elevation is authorized. [WMI access controls](https://learn.microsoft.com/en-us/windows/win32/wmisdk/access-to-wmi-securable-objects); [UAC and WMI](https://learn.microsoft.com/en-us/windows/win32/wmisdk/user-account-control-and-wmi). |
| Topology comparability | Reproduce one explicitly assigned synthetic Node parent, optional one conclusively attributed `conhost.exe`, same Job/session checks, complete member set, cooperative release, and exact-handle exit measurement. Different host/console/privilege behavior must be reported as a comparability difference, not silently accepted. |
| Source and integrity | Carry immutable v3 source bytes, source-bundle SHA-256, commit references, and readiness/source-integrity checks into any approved environment. Preserve a fresh environment identity, exact invocation, timestamps, source hashes, binaries, sandbox/permission profile, and result manifest. A new source revision, if approved for error capture, must have its **own** immutable source and review lineage; do not overwrite v3. |
| Synthetic isolation | Use only the approved synthetic probe/token and non-live namespace. Filter CIM to the current synthetic PIDs; retain no unrelated host process rows or raw sensitive command lines. Keep no customer/tenant data, live ingestion, RAG, deployment, storage, secrets, credentials, or traffic activity. |
| Diagnosticability | For **every** CIM attempt retain exact class/filter/query, target PID, requested property names, start/end UTC, result count, exception type, sanitized exception message, HRESULT/Win32/CIM status and provider information where available, and whether the target exact handle was alive at the query. A missing error detail remains explicitly `Not Available`, never invented. |

The **exact v3 source remains synthetic and non-live**, but it only retains `CimException` type. It cannot meet the new error-diagnosticability requirement unchanged. A future attempt therefore needs a separately authorized temporary diagnostic-source revision or an independently approved wrapper that captures failure semantics without changing the mandatory attribution decisions. That is a test-tooling change, **not** an OE-12 fixture/test, production/runtime, dependency, or repository-configuration change. Moving hosts may require copy/transfer approval and fresh source verification; it does not make old evidence portable by assertion. Any local CIM/WMI repair, ACL change, service change, policy change, or elevation needs its own bounded authorization. No network or environment change is performed here.

### Option B feasibility result

**Needs Clarification.** The current host's precise CIM failure is unknown, so “feasible after controlled remediation on this host” is unproved. No separate approved host has been shown to return all required properties with the same conhost topology, so “feasible only in a separate environment” is also unproved. Option B is **conceptually compatible with the unchanged attribution criterion**; it may proceed without baseline amendment only after the owner approves a bounded environment/diagnosticability assessment and its results establish the required behavior. It does not authorize Diagnostic v4 or formal retry `0003`.

## Decision matrix

| Dimension | Option A — trusted native source | Option B — CIM-capable environment |
| --- | --- | --- |
| Preserves current acceptance criteria | **No** for literal CIM/native agreement; a criterion amendment is mandatory. All other mandatory facts must still be proved. | **Yes in design**, if CIM returns the same fields and the existing gate remains unchanged; not yet demonstrated. |
| Tenant/security boundary | Systemwide snapshot, target memory read, or audit log may expose unrelated host metadata; require minimization and specific approval. | Filtered local CIM queries can target only synthetic PIDs; provider/namespace/host rights and sanitization still require approval. |
| Evidence determinism / independence | Parent snapshot is PID-based; internal handle query could bind identity; PEB command line is changeable; independent replacement time source unproved. | CIM and native measurements are separate interfaces as specified by the existing gate; provider behavior/availability and timing remain to be demonstrated. |
| Code / runtime / dependency | New **temporary diagnostic** identity-source code; **no production/runtime or dependency change proposed**. | New temporary diagnostic error-capture code or wrapper; **no production/runtime or dependency change proposed**. |
| Environment / configuration | Potential rights or audit-policy change for candidate sources; none authorized. | Host/Winmgmt/provider/ACL/sandbox remediation or approved separate host may be needed; none authorized. |
| Privilege/elevation | Not proved necessary or avoidable for all candidates; no elevation allowed now. | Not proved necessary or avoidable for CIM properties; no elevation allowed now. |
| Portability / reproducibility | Public Toolhelp portable but PID-only/systemwide; NT/PEB internals have version/bitness risks. No complete reproducible path established. | Same scripts can be transported with hashes; OS build, WMI provider, console topology, and account must be matched and recorded. |
| Auditability | Requires per-field source, rights, handle/PID binding, timestamp, failure and privacy records. | Requires per-query fields, timestamps, provider/HRESULT/message where available, source/host identity and sanitized failures. |
| Operational complexity | New diagnostic implementation, criterion amendment, compatibility and rights validation, independent review. | Environment diagnosis/approval, possible host movement, source-integrity transfer, new error capture, independent review. |
| Another inconclusive diagnostic risk | **High** until command line and independent time source are proven. | **High** until CIM reliability and comparable conhost topology are proven. |
| Change-control burden | Explicit attribution-criterion change plus diagnostic design/authorization; possibly security/config approval. | Environment/permission approval and diagnostic-source review; no criterion change if unchanged gate is met. |

## Baseline and change-control implications

| Controlled area | Option A | Option B |
| --- | --- | --- |
| OE-12 diagnostic design/source | **Yes**: new identity-source design, source, static review, authorization, and independent validation before execution. | **Yes** for a fresh attempt/source revision or approved wrapper that retains richer CIM failures; v3 source/history unchanged. |
| Operational Evidence Execution Plan | **No direct change established**: OE-12's plan states outcome-level audit controls, not CIM-specific fields. If a proposed substitute changes the plan's evidence boundary, obtain explicit plan amendment before use. | **No change indicated** if execution stays synthetic/non-live under the existing plan. A host move outside approved controls requires separate plan/Gate A review. |
| Acceptance Matrix | **No direct change established** in its OE-12 row, but any weakening or redefinition of its required trusted reconstruction is prohibited; amend if affected. | **No change indicated** if the same acceptance result and gates are retained. |
| Lifecycle/conhost attribution criterion | **Yes**, at least the literal CIM/native time-agreement requirement; no change is made here. Parent and actual command-line criteria remain mandatory. | **No**, provided every existing identity and lifecycle check still passes. |
| Platform architecture | **No architecture change proposed**. A broad system audit/privileged observer would need separate architecture/security review if later chosen. | **No architecture change proposed**. Environment relocation may need security/operations approval. |
| Production/runtime implementation | **None proposed**. | **None proposed**. |
| Dependencies, migrations, repository/Git settings | **None proposed**. | **None proposed**. |

**Baseline conclusion:** Option A cannot proceed under the existing attribution criterion without an approved amendment and a proved source for every missing mandatory fact. Option B could preserve the criterion and the OE-12 plan/matrix, but cannot proceed to another diagnostic until an approved environment assessment establishes CIM access, comparable topology, and adequate failure capture. Neither path is implementation-ready or selected by this document.

## Preserved blocks

| Item | Unchanged state |
| --- | --- |
| Diagnostic v2 | `Needs Clarification` |
| Diagnostic v3 | `FAIL — Lifecycle Attribution Not Supported` |
| Diagnostic v4 | `Not Proposed` |
| Launcher v1.4 | `Blocked` |
| Smoke v5 | `Not Authorized` |
| Formal retry `0003` | `Not Authorized` |
| OE-12 | `Not Executed` |
| Operational evidence | `11 Accepted / 4 Not Executed` |
| `SIR02-DEF-02` | `Missing / Not Reviewed` |
| SIR-02 | `Blocking` |

No diagnostic, environment probe, code change, privilege elevation, configuration/dependency/Git-setting change, or status transition was performed in preparing this assessment. OE-08, OE-14, and OE-15 remain unchanged.
