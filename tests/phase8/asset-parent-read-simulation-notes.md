# Asset Parent Read v0.1 simulation closure

## Authority and scope

The owner approved the presented Asset Parent Read v0.1 target contract and test-only adapter simulation on 2026-10-18 (approval supplied by parent delegation). This closes that finite test-only work package. Approval does not authorize production registration, live activation, deployment, a real Core mapping, or governance/finding closure.

Scope: one immediate parent ID for one authorized Asset. No root classification, hierarchy traversal, Warehouse data, writes, real HTTP/DB/provider/model calls, or production wiring. Report39 conventions remain source-reported candidates, not approved deployed schema authority.

## Gateway contract and Core independence

All Core–AI Platform information flows traverse AI Gateway:

- Core-facing request -> AI Gateway -> Platform orchestration.
- Platform -> Tool Runtime -> gateway-only adapter -> AI Gateway -> synthetic Core API.
- Synthetic Core API -> AI Gateway -> Platform.
- Platform final response -> AI Gateway -> Core-facing response.

Ordinary Core internal traffic is not routed through AI Gateway. Core must remain independently operable: AI Gateway or Platform outages disable only the optional AI feature, not Core startup, login, existing business operations or background jobs. AI fail-closed/startup dependencies apply only to the AI slice.

Contract ID asset-parent-read, version 0.1.0, operation asset.parent.read. Trusted stub context binds company, subject and correlation. Core produces the subject-bound internal reply; Platform validates the producer-supplied binding. Outward known/authorized unknown/unavailable/error is bounded. Missing, denied and hidden-parent results share the same 404 envelope without subject references, provenance or diagnostic reasons. Internal diagnostic differences remain in the separate stub audit accessor.

## Reviewed corrections and evidence

- Bind valid-looking request correlation/subject to trusted stub context; validate response operation, correlation, subject, strict shape and status.
- Reuse guarded snapshot/raw JSON parsing without modifying the accepted ingress utilities. Getter, prototype, duplicate-member, malformed UTF-8 and limit tests reject before orchestration. Bounds of 4096 bytes and depth 8 are synthetic test limits only.
- Establish company-authorized source scope before detailed row/cardinality validation; inaccessible absent/single/duplicate/malformed rows remain outward-identical.
- Exercise synthetic feature/profile/registration and Gateway-capability gates using independent Core-call observers.
- Produce the bound envelope at the actual Core return boundary and inject corruption there; wrong subject produces error and empty model context.
- Remove the unused fallback hook and vacuous assertions. No-fallback evidence is inspected absence of a fallback implementation plus independently observed Core-call counts; no deployed network enforcement is claimed.

Final focused execution: 62 passed, zero skipped; Vitest, scoped ESLint and scoped TypeScript each exit 0. The final finite remediation ran each check once. Original 33 cases were retained; 28 cycle-2 cases and one actual return-boundary corruption case were added. Initial lint/type correction, cycle 2, and the separately authorized finite review remediation are complete.

Parent reports independent reviewer thread/turn identifier 01a14e91-4073-772e-8ed4-6a3830b45a86 accepted the final test-only scope and independently executed 62 PASS with scoped lint/type exit 0. This records the communicated review result, not a newly retrieved review receipt.

## Exact final commands

PowerShell, from C:\Users\gantu\Documents\Codex\2026-10-15\task\ibex-local-recovery:

```powershell
& 'C:\Users\gantu\Documents\Codex\2026-10-15\task\ibex-tooling\node\node-v22.23.3-win-x64\node.exe' node_modules/vitest/vitest.mjs run tests/phase8/asset-parent-read-simulation.test.ts --config vitest.config.ts --configLoader runner --no-cache --pool=threads --experimental.fsModuleCache=false --reporter verbose
& 'C:\Users\gantu\Documents\Codex\2026-10-15\task\ibex-tooling\node\node-v22.23.3-win-x64\node.exe' node_modules/eslint/bin/eslint.js tests/testing/asset-parent-read-simulation.ts tests/phase8/asset-parent-read-simulation.test.ts --max-warnings 0
& 'C:\Users\gantu\Documents\Codex\2026-10-15\task\ibex-tooling\node\node-v22.23.3-win-x64\node.exe' node_modules/typescript/bin/tsc -p tests/phase8/asset-parent-read-simulation.tsconfig.json --noEmit
```

Direct Node 22.23.3; Vitest reported 4.1.11. No installs, network, temp redirection, escalation or Git mutations. No tests were run for this notes-only closure.

## Preservation

Branch codex/local-model-typing-recovery; HEAD 028934845591b3e569a1c5d639f81df7c72ca8ac. All 43 refs remained unchanged through implementation/review remediation.

The original 17 dirty/new files remained byte-identical. The accepted candidate added three files, giving 20 entries. Immediately before this notes creation, all 20 hashes matched the accepted final inventory. This notes file is the sole closure addition; the final verification is reported in the accompanying completion message.

SHA-256 inventory before notes creation (first 17 pre-existing; three candidate files identified by asset-parent-read-simulation):

```text
.github/workflows/ci.yml
2D2DBD7D4C126E1450D316324C45F19F415360A7F31328CA447C969293892742

docs/evaluation/findings/registry.v1.json
C1B4044E724460A450BD4F8EF867A2C3F99A843861BAE5D8385EE10749829FC2

docs/governance/sir-02/controls/SIR-02-KM-OPERATIONAL-EVIDENCE-ACCEPTANCE-MATRIX-v1.0.md
2F4EF5598D62C5131324A6F52067364E274CBD180B01B69915804FF6105ED15E

docs/governance/sir-02/SIR-02-EVIDENCE-COLLECTION-REGISTER-v1.0.md
A1C04647A705A1430FCD0C4740C64D901EC24180F331FDC84A6D3D656869B307

docs/governance/sir-02/SIR-02-EVIDENCE-DISPATCH-TRACKER-v1.0.md
BB5A551EE4E3B20BF705EC040931D01BD17A238F77025605B4072508BA2BDA4F

docs/integration/proposals/asset-component-chain-notes.md
957D26F559326CB0F7CAC543C3ED4E31A4ACFECD869AB760835AFB94D0471912

packages/model-gateway/src/service.ts
8315F351BC5BE7D763C19AA071C748C1C72BFC767F5936337087A964BDDEF0E6

tests/evaluation/evidence/phase10-runtime-evidence-v1.0.0.json
4ED10E5C98611A3F2A50FF1B98AD929B3B1950F73836D874BDF42F5A0D7FEC64

tests/integration/api-asset-composition.test.ts
28C45C59819891BC0B682E3A3C9E84840C19DD64D0AB5BA6BDF2C4FC7972FFF5

tests/integration/model-gateway-timeout-audit.test.ts
1C2CDF2BD7F59663CE223542538D67F04567CFCC0EB401998C47DEA9FF3DBE14

tests/phase8/asset-parent-read-simulation.test.ts
3460ABB51A857F2D8DC34297705C8002763956142F2AF4F21403BDBA493D7FBF

tests/phase8/asset-parent-read-simulation.tsconfig.json
CF5E65C20E7AC9523D88A67A3B7A7934685F289ADEE1689F50DF18AA21FF4A3F

tests/phase8/scoped-factual-grounding-notes.md
6DBF3B16F0A84388C48ECE7B93C2484750206B230F96B318AFE282A4C49F5D9A

tests/phase8/scoped-factual-grounding.test.ts
37BFC17BFBA8AA5176D842A7ACB0F929FF15D1C56DD729FCE086605805CF3002

tests/phase8/scoped-factual-grounding.tsconfig.json
58F05F5B2633CFA5F153A98C5C1B8B6854DC6DC8E0C97759ABD88A269060DF86

tests/testing/asset-component-chain.ts
3C2848B393DF9750EDED91396706FCCD1C6F3BB92E8927BD2000521888FAA079

tests/testing/asset-parent-read-simulation.ts
7CF9DC712A3FF36CC1119615497F3DA25EF1EF06BADCA9132EF1FAD899CFA0BE

tests/testing/scoped-factual-grounding-fixtures.ts
27A0A07D35E95150F8F33FFE02A859C03C592B07D7C553BEA3E60474ACFBA03A

tests/testing/scoped-factual-grounding-ingress.ts
3AAA75B71F7520F831FDD131F1D1455B0ABCE44644C04A8C45C472200F169F69

tests/testing/scoped-factual-grounding.ts
3B20E09738F0D243393898D242AE9BAD56DBE1C9CA08E9B4B1C994D197E79621
```

## Proof limits and next prerequisites

The session identity, company partition, source records, dispatch controls and Core operations are in-memory stubs. They are not security credentials, actual Core mapping authority, real startup/business-continuity evidence, or network controls. Timing equivalence is unproven. No timeouts, retention policy or live freshness values were invented.

Before any separately authorized live integration:

1. Approve the deployed Core source contract and mapping, including identity/company boundaries, parent cardinality/disclosure, null/missing/deleted/dangling semantics and approved provenance.
2. Establish actual authenticated delegation and Gateway-only transport enforcement; demonstrate rejection of direct Core access and absence of bypass/fallback.
3. Verify real Core startup, login, representative business operations and background jobs during Gateway outage, Platform outage and both outages; verify bounded optional-AI unavailability.
4. Assess timing/existence leakage and actual consumer rendering; approve applicable timeout/retry/freshness and audit access/retention policies.
5. Complete the required live-integration acceptance evidence and separate activation decision.

The target-contract and test-only approvals are resolved. No production activation or governance closure is implied.
