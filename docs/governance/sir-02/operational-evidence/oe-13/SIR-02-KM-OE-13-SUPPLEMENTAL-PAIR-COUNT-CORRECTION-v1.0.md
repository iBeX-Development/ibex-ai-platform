# SIR02-KM-OE-13 — Supplemental Pair-Count Correction v1.0

## Document control

- Correction status: `Published / Awaiting Independent Correction Review`
- Evidence item: `SIR02-KM-OE-13`
- Supplemental capture: `SIR02-KM-OE-13-SUPPLEMENTAL-V1_0-20260927T012529Z-0001`
- Supplemental evidence status: `Captured / Awaiting Independent Review`
- OE-13 evidence status: `Executed / Awaiting Independent Review`
- Original formal run: `SIR02-KM-OE-13-V1_0-20260926T131738Z-0001`
- Owner: GANTUMUR Erdenedalai — Founder / Administrator
- Independent correction reviewer: SODBILEG Erkhembayar — Administrator
- Correction date: 2026-09-27
- Independent correction decision: `Not Reviewed`

This is an interpretation-only erratum for the supplemental evidence summary in commit
`d7626372612d60c4959bbdf51a89c00a80b3b9b1`. It addresses the affected-pair
counting finding in independent review `63132f6dc44b5326c9f244a0b27182897eb933ca`.
It supersedes only the summary's interpretation of pair counts. It does not replace,
rewrite, supersede, or backfill the raw capture, its test report, or formal run `0001`.

## Corrected terms and counting model

- `typed_pair_row_count = 103`: the number of retained conflict-pair rows across the 46
  case captures. Each row has a conflict type, deterministic pair ID, and left/right
  synthetic record or reference identifiers.
- `per_case_unique_pair_count_sum = 96`: for each case, deduplicate its conflict-pair
  rows by pair ID, then sum those 46 per-case unique counts. Uniqueness is scoped to
  one case; equal pair IDs in different case captures are not deduplicated together.
- `cross_type_shared_pair_row_count = 7`: the additional typed rows that reuse a pair
  ID already counted under another conflict type in the same case.

One deterministic pair ID represents one underlying affected record/reference pair.
The same pair ID may support more than one conflict type. Each typed occurrence adds
one typed row, while the per-case unique count adds that pair ID only once. These
are distinct metrics derived from the same immutable raw evidence. The field
`sumOfPerCaseUniquePairCounts = 103` in the original supplemental summary is
misnamed: its value counts typed pair rows, not per-case unique pair IDs. The
correct per-case unique-pair-count sum is **96**. No claim that 103 is a unique-pair
count is made by this correction.

## Mathematical verification from unchanged raw measurements

The authoritative input is
`SIR-02-KM-OE-13-SUPPLEMENTAL-RAW-MEASUREMENTS-0001-v1.0.json`, SHA-256
`31d1d636bf420d679f0ff21338affd89b82a3f04f67b21617fceb342ab319fac`,
committed at `d7626372612d60c4959bbdf51a89c00a80b3b9b1`.

Across all 46 case captures, summing `conflictPairs.length` gives **103**; summing
`totalUniquePairCount` gives **96**. For each case, the latter equals the size of
the set of retained `conflictPairs[].pairId`. Therefore **103 − 96 = 7** additional
typed rows share an existing pair ID within their case. The per-type counts also
sum to 103 typed rows. Exactly four case captures contain these seven additional
cross-type occurrences:

1. `counts distinct same-type pairs twice without counting repeated observations
twice`, subcase `1`: 4 typed rows, 2 unique pair IDs, 2 additional cross-type
   rows. Shared pair IDs:
   `428967cb297c469e0cd4f679a7400b3ea98ace777b715676fd9356008925a0be`,
   `9e8e0e6181441e801eb87e1959ffb4bb530edf34f4f3470710a4c0c2960e6c46`.
2. The same scenario, subcase `2`: 2 typed rows, 1 unique pair ID, 1 additional
   cross-type row. Shared pair ID:
   `9e8e0e6181441e801eb87e1959ffb4bb530edf34f4f3470710a4c0c2960e6c46`.
3. `counts different typed pairs independently and preserves pair IDs across input
order`, subcase `1`: 4 typed rows, 2 unique pair IDs, 2 additional cross-type
   rows. Shared pair IDs:
   `a7c4267eaf7db41c4b1f744da1af09d9390014a48edd32c0f63f897ed9c5f922`,
   `a7f0cb22696431ff2bf39afd3d7bd5a9b183f50694160025ec69a22d9083924e`.
4. The same scenario, subcase `2`: 4 typed rows, 2 unique pair IDs, 2 additional
   cross-type rows. Shared pair IDs:
   `a7c4267eaf7db41c4b1f744da1af09d9390014a48edd32c0f63f897ed9c5f922`,
   `a7f0cb22696431ff2bf39afd3d7bd5a9b183f50694160025ec69a22d9083924e`.

The raw conflict types and left/right references remain attached to each of these
rows. No raw pair ID or reference was lost, rewritten, merged, or synthesized.
The repeated IDs shown across separate case captures are counted separately under
the defined per-case scope.

## Immutable lineage and decision boundary

- Original supplemental evidence, raw measurements, Vitest report, run log, and
  checksum manifest remain at their original bytes and references.
- Original formal evidence remains at commit
  `a0bcdb4ef646b0322cca6e30ef1f8c3b282501c9`; its independent clarification
  review remains open at `ca366ee8fd2814695051fa745c6f71236d9e1508`.
- Exact-capture reviewer attestation remains at
  `093732697eeb5da4c00827c4dc4875037972b30d`. The correction requires its own
  independent review; that prior attestation does not pre-accept this erratum.
- No test was rerun and no implementation, runtime path, configuration, dependency,
  deployment, credential, secret, storage, ingestion, RAG, vector, retrieval, or
  traffic path is changed by this document.

This publication does not mark the supplement or OE-13 `Accepted`. It does not reopen
the final OE-13 review or alter any other operational-evidence item. `SIR02-DEF-02`
remains `Missing / Not Reviewed`, and SIR-02 remains **Blocking**.
