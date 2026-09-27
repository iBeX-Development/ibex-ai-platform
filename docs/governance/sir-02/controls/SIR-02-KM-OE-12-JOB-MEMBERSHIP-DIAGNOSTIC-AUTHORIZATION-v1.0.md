# SIR-02 KM OE-12 Job Membership Diagnostic Authorization Record v1.0

## Decision record

| Field | Value |
| --- | --- |
| Version | `v1.0` |
| Classification | **Non-Formal Tooling Diagnostic — Not OE-12 Operational Evidence** |
| Scope | Exactly one local, synthetic Job Membership Diagnostic to establish ownership of every member before any future destructive Job-level termination test |
| Owner | `GANTUMUR Erdenedalai — Founder / Administrator` |
| Reviewer | `SODBILEG Erkhembayar — Administrator` |
| Decision date | `2026-09-28` |
| Authorization status | **Authorized for One Non-Formal Job Membership Diagnostic** |
| Immutable Class B forensic basis | `SIR-02-KM-OE-12-SMOKE-V4-JOB-MEMBERSHIP-FORENSIC-ANALYSIS-v1.0.md` at `fa656ca968129bbb6dea05e853c66d859ae5f1b1` |
| Failed Smoke v4 | `SIR02-KM-OE-12-LAUNCHER-SMOKE-V4-20260927T125158Z`; evidence `98bb5c30fd1619efbc0fba99d5062f258a65d811`; **FAIL** |
| Exact temporary diagnostic source/invocation | Must be reviewable against every gate below before the one permitted execution; no source or invocation was created by this decision |
| Diagnostic execution | **Authorized / Not Yet Executed; one attempt only** |
| Launcher v1.4 / Smoke v5 | **Not Authorized** |
| Formal retry `0003` | **Not Authorized** |
| OE-12 operational-evidence status | **Not Executed** |

## Owner decision

> The OE-12 Job Membership Diagnostic is authorized for one non-formal tooling diagnostic only, based on the Class B — Identity Not Recoverable finding at commit fa656ca968129bbb6dea05e853c66d859ae5f1b1. Its sole purpose is to identify every member of the newly created synthetic Job Object and establish ownership before any future destructive Job-level termination test. This authorization does not authorize Smoke v5 or formal retry 0003 and does not constitute OE-12 operational evidence.

The sole diagnostic question is: **Who are all members of the newly created synthetic Job Object, and can every member be conclusively attributed to the current synthetic diagnostic execution before any destructive Job-level termination action?** This decision does not run the diagnostic. Before execution, the exact temporary launcher/helper/probe source, full noninteractive command, native API and handle plan, output location, finite bounds, no-network controls, and safe cleanup must be reviewable. If the source cannot satisfy this authorization without new repository code, dependency, configuration, security-policy, or elevation changes, stop for separate change control rather than execute.

## Required identity and topology capture

For **every observed Job Object member**, retain: PID; executable/image path; parent PID; process creation timestamp; command line where safely available; expected synthetic role; unique synthetic diagnostic token; explicit-assignment versus inherited-membership classification where determinable; Job membership confirmation; expected-member allowlist result; and the evidence source for each identity claim. Preserve native query/API results and sanitized native errors. A missing, inaccessible, racing, or conflicting identity is **unresolved**, not an inferred role.

Construct a retained topology for each applicable role: PowerShell diagnostic launcher → temporary native helper/watchdog, if any → synthetic Node parent → synthetic Node descendant, if any. Every participating process must have a known role and retained PID identity. The diagnostic must distinguish in-process native code from a separate helper process. Record process creation, assignment, membership, and exit order with timestamps sufficient to correlate them. The diagnostic-specific token must be deterministic, unique to this one diagnostic, passed only to diagnostic-owned synthetic processes, visible in retained process identity evidence where technically possible, free of tenant/customer information, and never reused as a formal OE-12 evidence identity.

Before **any destructive Job-level action**, calculate and retain the intended parent PID, **Expected Synthetic Member PID Set**, **Observed Job Object Member PID Set**, and **Unexpected Member PID Set**. The allowlist gate passes only when the observed set equals the conclusively identified, current-diagnostic-owned allowlisted set and explicit/inherited membership is explained. Job membership or a matching PID count alone does not establish safe ownership. If any member is unidentified, lacks identity evidence, is not attributable to this diagnostic, or is unexpected, the **Allowlist Gate = FAIL** and the diagnostic stops before destructive Job-level termination.

## Mandatory safety and cleanup boundary

The Smoke v4 forensic record identified a **Safety Finding — Job-wide fallback termination occurred without complete member allowlisting**. The diagnostic must not repeat that fallback. While any Job member remains unidentified or unallowlisted, do **not** call `TerminateJobObject`, do **not** close a kill-on-close Job handle as a destructive validation, do **not** kill an unknown PID, and do **not** use any other Job-wide destructive termination. Preserve the unresolved membership evidence and stop.

The exact diagnostic design must resolve safe cleanup **before execution**. Construct diagnostic-owned processes with a cooperative, non-destructive exit mechanism. Prefer signalling only positively identified synthetic diagnostic processes to exit normally, waiting within a finite bound, and verifying their absence. If an unidentified member remains or safe cleanup would make it collateral to a destructive action, preserve the evidence, record the environment limitation, and stop without inferring success. Do not assume the Smoke v4 fallback is an acceptable cleanup method. The execution plan must account for handle lifetime and bounded exit without an automatic job-wide kill on an unidentified member.

This diagnostic is **identity and ownership discovery only**. It cannot prove S7 kill-on-close, timeout cleanup, or S8 parent/descendant termination. Smoke v4 remains **FAIL** with S7 **Failed / Unproven** and S8 **Not Reached / Unproven**, regardless of this diagnostic's outcome.

## Result and subsequent gates

Record exactly one diagnostic result: `PASS — All Job Members Conclusively Identified`, `FAIL — Unknown or Unsafe Member Present`, or `Needs Clarification`. PASS requires retained identity evidence for every member, attribution to the current synthetic diagnostic, reconciliation of expected and observed member sets, explained explicit/inherited membership, no unidentified PID, and safe cleanup without destructive action against an unknown member. Preserve the exact temporary source, raw observations, command/output, UTC timing, errors, cleanup, and SHA-256 immutably. Failed or partial attempts must remain distinct and must not be silently repaired, overwritten, or retried.

A PASS may support a **later design decision** for launcher v1.4; it does not implement v1.4, authorize Smoke v5, or authorize formal retry `0003`. FAIL or Needs Clarification leaves both blocked and prohibits designing around guessed PID ownership. Any resulting v1.4 containment design, Smoke v5, and formal retry `0003` require their own later governance gates. No result changes OE-12 status, counts toward OE-12 acceptance, or retroactively satisfies Smoke v4 S7/S8.

## Preserved scope and history

Formal attempts `0001`/`0002`, Smoke v1/v2/v3/v4, and accepted OE-12 implementation `826376cc84521a5d648462fdcc985cd2d412a24c` remain immutable. This authorization changes no OE-12 fixture or integration test, production/runtime source, dependency, migration, repository configuration, Git setting, `.gitattributes`, deployment, credential, secret, storage, ingestion, RAG, embedding, indexing, vector write, retrieval, network, or traffic path. OE-12 remains `Not Executed`; operational evidence remains **11 Accepted / 0 Awaiting Independent Review / 4 Not Executed**. OE-08, OE-14, OE-15, and `SIR02-DEF-02` at `Missing / Not Reviewed` remain unchanged; SIR-02 remains **Blocking**.
