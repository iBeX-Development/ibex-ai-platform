# Scoped factual grounding: synthetic work package

Status: synthetic-only prototype accepted by independent review; no production integration.

## Finite scope and evidence

The prototype covers Asset parent identity and individually selected Warehouse quantity/Issue-status facts for one bound WO material line. It uses explicitly synthetic source schemas, units, mappings, record inventories and Issue associations. It does not infer real Core field mappings, calculate readiness, aggregate lines, or assure full hierarchy graphs.

The supplied original population contains 52 cases: H01-H09 and 43 variants across G1-G8. The original case block and repaired G4-04/G5-03 remain intact. Eighteen separate independent-review regressions were added:

- Eight pre-normalization evidence-equality tests: seven whitespace mutations plus a valid control, each checking raw JSON and structured-object ingress.
- Two canonical-order tests: reversed Unknown facts and reversed two-evidence/fact arrays.
- Eight authoritative-context tests: seven mutually matching acquired/offered evidence pairs that disagree with trusted context, plus a valid control.

The focused suite reports **70 passed and 3 skipped (73 tests)**. Three skipped tests concern actual downstream consumers for G8-01, G8-02 and G8-03. Their portable rendering assertions pass, but this does not establish actual display safety or satisfy those original cases' full consumer-integration requirements. H09 checks that the unchanged real Asset and Warehouse profiles remain blocked. Other positive results concern the isolated synthetic prototype, not a deployed production gate.

Historical H01-H05 failures and H06-H09 passing controls were injected synthetic grounding results, not real Core/model/provider evidence. The new execution does not rewrite those historical outcomes.

## Reproducible focused commands

Working directory:

```text
C:\Users\gantu\Documents\Codex\2026-10-15\task\ibex-local-recovery
```

Verified executable: Node **22.23.3**, SHA-256:

```text
9c9245166b4a8e182e0b797da9c20136117ff24368eaff1fec8343a123c8db0e
```

Installed versions executed: Vitest **4.1.11**, TypeScript **5.9.3**, ESLint **9.39.5**. pnpm was not invoked; package-manager validation is not claimed.

```powershell
$node = 'C:\Users\gantu\Documents\Codex\2026-10-15\task\ibex-tooling\node\node-v22.23.3-win-x64\node.exe'
& $node node_modules/vitest/vitest.mjs run tests/phase8/scoped-factual-grounding.test.ts --config vitest.config.ts --configLoader runner --no-cache --pool=threads --experimental.fsModuleCache=false --reporter verbose
& $node node_modules/eslint/bin/eslint.js tests/testing/scoped-factual-grounding.ts tests/testing/scoped-factual-grounding-ingress.ts tests/testing/scoped-factual-grounding-fixtures.ts tests/phase8/scoped-factual-grounding.test.ts --max-warnings 0
& $node node_modules/typescript/bin/tsc -p tests/phase8/scoped-factual-grounding.tsconfig.json --noEmit
```

All three commands exited **0** after the bounded independent-review remediation. No further test run was performed to create this notes file.

An earlier forks-pool attempt failed before test collection with `EPERM` during an atomic rename of transformed code in a sandbox temporary directory. Installed Vitest source confirmed that `--no-cache` does not prevent forks transport copies. The subsequently authorized threads transport returns transformed code in memory with filesystem module caching disabled; the rename failure did not recur in the focused run. No temporary path relocation, permission change, escalation, dependency patch or installation was used. This is evidence for this selected suite, not blanket authorization or compatibility evidence for other tests. The underlying Windows/sandbox cause of the original rename failure remains unresolved.

## Independent review

Independent reviewer task: `01a14e54-30ca-71df-b852-1404eee15021`.

The coordinating task reported that this reviewer accepted the bounded remediation and independently reran **70 PASS / 3 SKIP**, with lint and focused type checking exiting **0** and unchanged reviewed-file hashes. This notes file records that communicated review result; it does not invent an independently retrieved receipt or receipt hash.

Review remediation established raw evidence comparison before shared-schema normalization, canonical facts/limitations/citations, and tests that reach the intended authoritative-context rejection branch. Review acceptance is limited to this synthetic work package.

## Historical artifact identities

These hashes were supplied as identities of retained original artifacts. They were **not recomputed from the conversation transcription**, and this task does not claim access to the original external artifacts.

| Historical artifact                                          | Supplied SHA-256                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `semantic-assurance-spec-v1.0.1/contract-specification.json` | `1794d0796a34527ebe981ff3911b7ac025633ddf6ddc1bcf674cf1bf44991325` |
| `semantic-assurance-52-case-plan/case-plan.json`             | `c8c0d7bfb3edcd224a473fdc33656983f1b6f056046a5972c0e87ded50325281` |
| Parent specification v1.0.0                                  | `9da1f9fcd59250a02b86c6162bac004b40c2397f9f8d4a2cf7497557788f6100` |
| Decision package                                             | `a7b12b276545de78d548bb9cb75d5bc328584b069b948c9cdecefa5fb98c4045` |
| Nine-case execution receipt                                  | `a48d101f2612c893e3c53f28763def408d8dc40a2dd32f72f0a340184aec0997` |
| Acceptance manifest                                          | `f4b9b48e0782e57580f68645bed3483aeec00998e1d1d4f0fe2b75e38b288f69` |
| Historical 1719-test toolchain receipt, not a binary hash    | `ef971dc58c3ae43be0d7da99c6ff6e8bd051d0dedba0ef0d4a67724cce297bf1` |

The supplied 13 historical clause/context rows retain mapping status `UNKNOWN` and baseline commit `529951f9818c301aae67d94e980deafe7495391f`. This work does not change their authority, population or status.

## Preservation

Repository identity: `gt7719/ibex-ai-platform` on `DESKTOP-6JS61FP`.
Preserved branch: `codex/local-model-typing-recovery`.
Preserved HEAD: `028934845591b3e569a1c5d639f81df7c72ca8ac`.

All original nine modified and two untracked files were preserved with matching before/after SHA-256 hashes:

| Original file                                                                              | Preserved SHA-256                                                  |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `.github/workflows/ci.yml`                                                                 | `2D2DBD7D4C126E1450D316324C45F19F415360A7F31328CA447C969293892742` |
| `docs/evaluation/findings/registry.v1.json`                                                | `C1B4044E724460A450BD4F8EF867A2C3F99A843861BAE5D8385EE10749829FC2` |
| `docs/governance/sir-02/SIR-02-EVIDENCE-COLLECTION-REGISTER-v1.0.md`                       | `A1C04647A705A1430FCD0C4740C64D901EC24180F331FDC84A6D3D656869B307` |
| `docs/governance/sir-02/SIR-02-EVIDENCE-DISPATCH-TRACKER-v1.0.md`                          | `BB5A551EE4E3B20BF705EC040931D01BD17A238F77025605B4072508BA2BDA4F` |
| `docs/governance/sir-02/controls/SIR-02-KM-OPERATIONAL-EVIDENCE-ACCEPTANCE-MATRIX-v1.0.md` | `2F4EF5598D62C5131324A6F52067364E274CBD180B01B69915804FF6105ED15E` |
| `docs/integration/proposals/asset-component-chain-notes.md`                                | `957D26F559326CB0F7CAC543C3ED4E31A4ACFECD869AB760835AFB94D0471912` |
| `packages/model-gateway/src/service.ts`                                                    | `8315F351BC5BE7D763C19AA071C748C1C72BFC767F5936337087A964BDDEF0E6` |
| `tests/evaluation/evidence/phase10-runtime-evidence-v1.0.0.json`                           | `4ED10E5C98611A3F2A50FF1B98AD929B3B1950F73836D874BDF42F5A0D7FEC64` |
| `tests/testing/asset-component-chain.ts`                                                   | `3C2848B393DF9750EDED91396706FCCD1C6F3BB92E8927BD2000521888FAA079` |
| `tests/integration/api-asset-composition.test.ts`                                          | `28C45C59819891BC0B682E3A3C9E84840C19DD64D0AB5BA6BDF2C4FC7972FFF5` |
| `tests/integration/model-gateway-timeout-audit.test.ts`                                    | `1C2CDF2BD7F59663CE223542538D67F04567CFCC0EB401998C47DEA9FF3DBE14` |

Work-package additions are limited to the three `tests/testing/scoped-factual-grounding*.ts` files, the focused test, its no-emit TypeScript configuration, and this notes file. Production code, existing documentation, manifests, lockfiles and approved baselines were not changed by this package.

## Production-integration prerequisites

Source facts to investigate:

1. Exact authoritative Core schemas/versions, field pointers, record cardinalities, parent/root/null semantics, quantity units and lossless decimal representations, and Issue-state tokens.
2. Trusted acquisition completeness/conflict evidence and unique Issue-to-WO/material-line associations; applicable existing authorization and freshness rules.
3. Actual orchestration subject/selector inputs and raw-JSON ingress location, including existing size/depth limits and duplicate-aware parsing responsibilities.
4. Actual consuming view and text-processing chain: literal sink, linkification, escaping, bidi handling and secondary decoding.
5. A source-authorized `source_unavailable` mapping. The prototype declares that reason but does not implement a mapping path for it.

Owner decisions required before integration:

1. Approve domain-owned mapping IDs/versions, field semantics, evidence inventories and unavailable-source behavior after the source facts are established; synthetic mappings are not substitutes.
2. Approve a bounded production integration package: trusted routing/selector binding, grounding-contract compatibility, runtime validation/rendering placement and retained legacy behavior for unrelated routes.
3. Approve the actual consumer integration and its acceptance evidence, and explicitly authorize any later production-profile enablement through the existing governance process. This package does not authorize activation.

No new readiness formula, precedence rule, expiry threshold, quantity conversion or aggregation is supplied.

## Explicit non-claims

- No F06, F07, F08, F09 or other governance-finding closure; no registry/status changes.
- No production gate, production semantic-assurance claim, live Core/model integration or rollout.
- No actual UI/display-safety assurance from portable string checks.
- No whole-architecture compliance claim from this focused suite.
- No commits, publication or deployment.
