# Evaluation tests

# Evaluation assets

Phase 10 evaluation datasets, golden labels, runtime-derived observations, and gate logic live only
under this test tree. Runtime packages, prompts, RAG corpora, Tool outputs, and agent context must
never import these files. Dataset versions are linked by identifier from agent profiles without
embedding labels in runtime modules. Each evaluation record binds its observed runtime outcome to
normalized audit evidence and retains only an expected-result reference; comparison occurs inside
the test-only evaluator.

Run `corepack pnpm evaluate:phase10` for the evidence-derived release decision and
`corepack pnpm test:phase10` for the hardening, Pilot Agent, security, and tenant gates.

## Synthetic required facts and forbidden claims

`support/synthetic-answer-contract.ts` defines the separate
`AQ10-SYNTHETIC-REQUIRED-FACTS-FORBIDDEN-CLAIMS` contract, version `1.0.0`.
`required-fact-forbidden-claim.test.ts` runs the actual PilotAgentRuntime through
the existing trusted synthetic fixture, with independently constructed Tool output
containing only `resource_id: synthetic-resource-1` and `status: available`.
The answer candidates are synthetic stimuli, not model-generated answers. Required
fact labels and forbidden-claim metadata never enter runtime stimuli or grounding;
the returned answer is evaluated afterward. Correct Tool citations alone do not
establish factual correctness: negative answers retain those same valid citations.

This is a closed English grammar, not arbitrary-language semantic entailment.
The complete answer must contain period-terminated sentences separated by ASCII
whitespace. ASCII space, tab, LF, vertical tab (VT), form feed (FF) and CR are
collapsed and trimmed explicitly. Unicode NBSP and BOM are not normalized or
trimmed, including at answer boundaries. All other spelling and case are exact.
The supported fact forms are:

- `Resource <id> is <status>.`
- `The resource <id> has status <status>.`
- `Status of resource <id>: <status>.`
- `Resource ID: <id>.` and `Status: <status>.`, in either order.

Identifiers use ASCII letters, digits, underscore or hyphen; status tokens use
ASCII letters. Parsed values must equal independent labels exactly. Repeating a
consistent fact is allowed; different identifiers or statuses are contradictory.
Missing or wrong facts fail. No implied facts or domain assumptions are allowed.

Explicit forbidden forms are `Quantity: <integer>.`, `There are <integer|one|two|three>
units.`, `Transaction is/was approved.` and `Transaction is/was executed.` They fail
because the two-field Tool facts support neither quantities nor transaction state.
Any other wording, including negation, hedging, quoted assertions, unknown language,
extra clauses or unrecognized quantities, fails closed as unsupported grammar;
this is not a claim that such wording is necessarily false in natural language.
Every sentence is consumed in full; positive keyword presence cannot override
unknown or contradictory content.

This additive test-only contract traces baseline 09 lines 429-465 (golden-answer
required facts and forbidden claims, evaluated across supported paraphrases).
It does not change the historical v1 dataset, evaluator, scores, thresholds or
evidence artifacts, and establishes neither real domain/model quality nor AQ10
closure or release readiness.

## Diagnostic previous/current/delta comparator

`support/diagnostic-run-comparator.ts` is a separate test-only contract, version
`1.0.0`, tracing Evaluation Framework 09 section 15 (lines 617-648). It compares
independently supplied records over the exact same complete golden population.
`diagnostic-run-comparator.test.ts` supplies hand-authored synthetic arithmetic
fixtures, not executed historical evidence. No real prior run is supplied here.
Checked-in evidence parity is not a historical regression comparison.

Each record declares a source commit, distinct run/artifact identities and artifact
SHA-256 digest; dataset ID/version/content digest; exact case IDs; evaluator
ID/version and explicit flat scalar configuration; metric name, unit, direction,
measurement classification and numeric domain. Dataset, evaluator/configuration,
population and metric definitions must match exactly (collection order is ignored).
Source commits may differ. Reusing any run ID, artifact ID or artifact digest is
rejected. Distinct declarations are necessary, but do not prove independent
execution, authenticity, chronology or approval. Digests are declarations, not
recomputed hashes or authenticated evidence bindings.

This narrow contract requires exactly one numeric observation for every declared
case/metric pair. Unknown keys, duplicates, omitted observations, malformed fields,
unknown object fields, empty populations/metrics and nonfinite values invalidate
the entire comparison. No record is dropped or defaulted. Ratio observations use
unit `fraction` and inclusive range [0, 1]; `finite_number` has no additional domain
range policy. Delta overflow also invalidates the entire comparison. Configuration
supports only explicit flat string, finite-number, boolean or null values; no
nested configuration is inferred or normalized.
An own `__proto__` configuration key is rejected before record parsing, so it
cannot be silently discarded and make distinct configurations compare equal.

The output lists previous/current/delta (`current - previous`) for each metric
and case, sorted by metric name then case ID using JavaScript string order, with
units, direction and classification. It does not aggregate cases or interpret the
sign, invent tolerances, select a release baseline or emit a PASS/FAIL decision.
`COMPARED` means only compatible diagnostic arithmetic. Missing prior input
(`null`/`undefined`) with valid current data returns `UNESTABLISHED`; malformed
current data still returns `INVALID`. Invalid or incompatible inputs return no
delta rows. Inputs are not mutated and output metadata does not alias them.

Every result explicitly leaves authenticity and baseline approval `UNESTABLISHED`.
This adds no historical execution claim, AQ11 finding closure or release admission.
The production runtime, v1 dataset, evaluator/scoring, thresholds, release gate and
historical evidence artifacts remain unchanged.
