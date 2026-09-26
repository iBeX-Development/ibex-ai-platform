# SIR-02 KM OE-13 Test-Only Implementation Review

## Review control

| Field                                    | Value                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Review version                           | `v1.0`                                                                                                                         |
| Evidence item                            | `SIR02-KM-OE-13`                                                                                                               |
| Assigned reviewer                        | SODBILEG Erkhembayar — Administrator                                                                                           |
| Reviewer independence                    | Explicit personal attestation supplied and preserved verbatim in `SIR-02-KM-OE-13-IMPLEMENTATION-REVIEWER-ATTESTATION-v1.0.md` |
| Technical inspection and recorded result | Codex; no separate personal final decision by SODBILEG is asserted                                                             |
| Implementation-review result             | `Rejected`                                                                                                                     |
| Final implementation under review        | `1d8ef170a73ceceffc270a1a9ae61b434a012681`                                                                                     |
| Initial implementation                   | `7387e8d8a9f742933a071ffa8f910914ed73a65a`                                                                                     |
| Approved design                          | `92f08b23a77202a7773e09ff6b722db402d7c840`                                                                                     |
| Authorization decision                   | `8e1ea66c669a59f93268555ffa5e943d784a1f74`                                                                                     |
| Authorization linkage                    | `c43c2ba725b9faa092768b123e476afeaa7df8f3`                                                                                     |
| Formal OE-13 execution                   | Not authorized and not performed                                                                                               |

This is an implementation review only. The single technical implementation-review result is **`Rejected`**, because the implementation violates the approved tenant-isolation and exact conflict-count requirements. The supplied attestation establishes the requested personal independence assertion but does not remove these technical findings or claim that SODBILEG issued this final decision.

## Independence and scope

**Independence: attested.** SODBILEG's exact statement is preserved in the companion attestation record. Git identifies GANTUMUR as author of the final implementation commit and does not show SODBILEG changing either file in that commit. The attestation is a supplied personal statement; this review does not independently authenticate the identity of the person who supplied it.

**Scope: PASS.** Between authorization linkage `c43c2ba725b9faa092768b123e476afeaa7df8f3` and final implementation `1d8ef170a73ceceffc270a1a9ae61b434a012681`, exactly the two authorized files changed:

- `tests/testing/sir02-km-oe13-duplicate-conflict-fixture.ts`
- `tests/integration/sir02-km-oe13-duplicate-conflict.test.ts`

OE-09 and OE-11 implementations remained unchanged. No production/runtime source, dependency, migration, configuration, deployment, storage, secret, credential, ingestion, RAG, embedding, indexing, vector-store, retrieval, or traffic file changed.

## Architecture and scenario assessment

The fixture has an in-memory registry and logical artifact inventory, deterministic submission handling, exact-repeat detection, typed conflict codes, test-only quarantine decisions, downstream spies, sanitized audit records, and `try/finally` cleanup. It imports the OE-09 accepted-input loader and inventory builder and the OE-11 processing spies read-only. The tests name all **20/20 approved scenario categories**. Exact-repeat no-op checks, zero additional active/downstream artifacts, zero downstream calls on tested conflict cases, and cleanup on normal and exceptional paths pass in the implemented tests.

The named scenarios do not establish full design conformance. The following two findings block acceptance.

### Finding 1 — foreign registration existence is caller-visible

The fixture's `classify()` scans every tenant's registry records for the candidate registration ID. A Tenant B submission using a Tenant A registration ID gains `CROSS_TENANT_INJECTION`, while an otherwise valid Tenant B submission with a fresh ID can be classified `DISTINCT_SCOPED_IDENTITY`. `executeSubmission()` exposes these different decisions and reasons to the caller. This reveals the existence of a Tenant A registration claim. The `protectedFieldsDisclosed` measurement only searches for literal protected values in the response, so its reported `0` does not detect this existence signal. The integration test confirms the distinct Tenant B path but does not compare it with an otherwise identical colliding-ID path.

The same distinct path copies accepted OE-01 through OE-07 immutable references from Tenant A while substituting a new tenant, registration, owner, source, provenance, and lineage root. `refsValid()` validates the reference tuple against a global pinned list without validating that those references authorize the substituted bindings. The resulting new registry record is non-active and unapproved, but it is still admitted as an authoritative record without evidence for its new tenant/source binding. The design requires a distinct identity only when all bindings and authority are valid, and requires zero foreign-tenant existence signals. See fixture lines 263–275, 328–341, 457–509 and tests lines 54–75, 361–379; design lines 68 and 96.

**Assessment:** tenant-isolation and authority-binding requirement **FAIL**. This is a design and safety boundary violation, irrespective of passing literal-field disclosure assertions.

### Finding 2 — conflict counts are code counts, not occurrence counts

`classify()` accumulates conflict types in a `Set`, compares the candidate with only `existing[0]` when more than one authoritative record exists, and discards the affected record/reference pair identity. `executeSubmission()` then sets each `conflictCounts[code]` and each quarantine `exactConflictCount` to `1`, and sets `totalConflicts` to `codes.length`. Thus multiple conflicts of the same type across distinct record/reference pairs cannot be counted exactly. The integration helper asserts the same implementation-derived equation and never independently checks multi-pair counts. The approved design requires counts of actual occurrences once per affected key and conflicting reference pair. See fixture lines 279–281, 352–357, 510–527, 618–619 and tests lines 83–90; design line 90.

**Assessment:** exact conflict counts **FAIL**. The implementation remains deterministic, but its numeric result cannot substantiate the required count.

## Other checks and independent validation

| Check                                                                                      | Result                                 |
| ------------------------------------------------------------------------------------------ | -------------------------------------- |
| Exact-repeat suppression in implemented tests                                              | PASS                                   |
| Human-decision quarantine on tested conflicts                                              | PASS; exact counts fail as above       |
| No silent merge, overwrite, newest-wins, or inferred approval on tested same-key conflicts | PASS                                   |
| Zero downstream calls for tested conflicts                                                 | PASS                                   |
| Literal Tenant B protected-field disclosure check                                          | `0`; existence-signal requirement FAIL |
| Sanitized audit/correlation output on tested paths                                         | PASS                                   |
| Cleanup and cross-case isolation on tested paths                                           | PASS                                   |
| OE-13 integration tests rerun                                                              | `32/32 PASS`                           |
| Full repository tests rerun                                                                | `435/435 PASS`                         |
| Lint rerun                                                                                 | PASS                                   |
| Typecheck rerun                                                                            | PASS                                   |
| Prettier check on both implementation files                                                | PASS                                   |

Passing validation confirms current assertions but does not cover the two failing design requirements.

## Decision and unchanged status

**Implementation-review result: `Rejected`.** Formal controlled OE-13 evidence execution is **not authorized**. Remediation must close both findings within the authorized two-file implementation scope or obtain revised authorization if another file is required; then a new independent implementation review must assess the corrected immutable commit. The supplied SODBILEG attestation covers only implementation commit `1d8ef170a73ceceffc270a1a9ae61b434a012681` and must not be reused as an attestation for a future commit.

- OE-13: `Not Executed`.
- Operational evidence: `9 Accepted / 6 Not Executed`.
- `SIR02-DEF-02`: `Missing / Not Reviewed`.
- SIR-02: `Blocking`.
- OE-08, OE-10, OE-12, OE-14, OE-15, After Config Scope, and Final Sign-Off: unchanged.
