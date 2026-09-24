# Evaluation tests

# Evaluation assets

Phase 10 evaluation datasets, golden labels, observations, and gate logic live only under this
test tree. Runtime packages, prompts, RAG corpora, Tool outputs, and agent context must never import
these files. Dataset versions are linked by identifier from agent profiles without embedding labels
in runtime modules.

Run `corepack pnpm test:phase10` for the hardening, Pilot Agent, security, and tenant gates.
