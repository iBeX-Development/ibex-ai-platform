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
