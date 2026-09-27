# SIR02-KM-OE-13 — Supplemental Pair-Count Correction Review v1.0

## Review control

| Field | Value |
| --- | --- |
| Correction | `SIR-02-KM-OE-13-SUPPLEMENTAL-PAIR-COUNT-CORRECTION-v1.0.md` |
| Correction commit | `075cb956430e3683ddc6207231c3696f281361e3` |
| Correction SHA-256 | `01acc6c4b67fff68dcba5d2dbcdade386c0b510fce8fb9ee57f09bd9a40ddb0b` |
| Governance linkage | `5759efa417235819f9348e366890e19a179ee255` |
| Designated independent reviewer | SODBILEG Erkhembayar — Administrator |
| Technical verification | Completed against immutable repository evidence |
| Exact-correction reviewer attestation | **Missing** |
| Reviewer independence | **Not established for this correction** |
| Single correction-review result | **Needs Clarification** |
| Review date | 2026-09-27 |

This record reports technical verification of the published correction. It does not
claim that SODBILEG supplied a personal attestation or made an independent final
acceptance decision. Suggested attestation text is not an attestation. The exact
correction-commit attestation required by the review gate has not been supplied.

## Integrity and unchanged lineage

- The local correction artifact, its SHA-256 sidecar, and the correction-commit
  blob agree on SHA-256
  `01acc6c4b67fff68dcba5d2dbcdade386c0b510fce8fb9ee57f09bd9a40ddb0b`.
  Correction and linkage commits resolve, and the correction is an ancestor of
  the linkage commit.
- The raw supplemental measurements remain at SHA-256
  `31d1d636bf420d679f0ff21338affd89b82a3f04f67b21617fceb342ab319fac`.
  Git shows no change to the raw measurements or the original supplemental
  evidence, Vitest report, run log, or checksum manifest since evidence commit
  `d7626372612d60c4959bbdf51a89c00a80b3b9b1`.
- The original supplemental evidence retains SHA-256
  `6409af465cb4ea89403a62d5400ed7077eb1f3ce862b6edbbac944a96b6ba2ad`.
  The original formal OE-13 evidence retains SHA-256
  `908843689d9ccb1b5139d2ab8939a12067d046fc2f04c857cda065ea41544bee`;
  Git shows no change to the formal evidence or Vitest report since commit
  `a0bcdb4ef646b0322cca6e30ef1f8c3b282501c9`.

## Independent arithmetic check of the retained raw measurements

The unchanged raw file contains 46 case captures. For each case, the technical
check counted `conflictPairs.length` and the distinct `conflictPairs[].pairId`
values, then compared the latter with the retained `totalUniquePairCount`. All
46 retained per-case counts matched. The resulting metrics are:

| Exact term | Verified value | Meaning |
| --- | ---: | --- |
| `typed_pair_row_count` | 103 | Sum of retained typed conflict-pair rows across cases |
| `per_case_unique_pair_count_sum` | 96 | Sum of distinct pair IDs within each case |
| `cross_type_shared_pair_row_count` | 7 | Additional typed occurrences of pair IDs already counted within their case |

**103 − 96 = 7.** Exactly four case captures account for the seven additional
cross-type typed rows: the two subcases of “counts distinct same-type pairs twice
without counting repeated observations twice” contribute 2 and 1, and the two
subcases of “counts different typed pairs independently and preserves pair IDs
across input order” contribute 2 and 2. Their shared pair IDs in the correction
match the retained raw measurements. A pair ID represents an underlying affected
record/reference pair; multiple conflict types can yield multiple typed rows for
that same pair. Uniqueness is per case, so IDs repeated across separate cases
are counted once in each case. The correction does not state or imply that 103
is a unique-pair count.

## Scope and decision

The correction changes only the interpretation of the original supplemental
summary's mislabeled aggregate. Git differences confirm that the retained raw
pair IDs, left/right references, conflict types, quarantine references, hashes,
supplemental execution artifacts, and original formal-run artifacts were not
changed. No test or supplemental execution was performed for this review.

**Result: `Needs Clarification`.** Technical integrity, arithmetic, terminology,
and correction scope pass. Reviewer independence cannot be established without
SODBILEG's explicit personal attestation for correction commit
`075cb956430e3683ddc6207231c3696f281361e3`, confirming that they did not
author, modify, regenerate, overwrite, or replace the correction artifact, raw
measurements, original supplemental artifacts, or original formal OE-13 evidence.
Obtain and immutably retain that attestation before a final correction decision.
Supplemental evidence review is **not yet authorized to be finalized**.

Supplemental evidence remains `Captured / Awaiting Independent Review`; OE-13
remains `Executed / Awaiting Independent Review`. Other evidence statuses are
unchanged. `SIR02-DEF-02` remains `Missing / Not Reviewed`; SIR-02 remains
**Blocking**.
