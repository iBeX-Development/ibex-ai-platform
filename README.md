# iBeX Hybrid Intelligent AI Platform

This repository is reserved for the AI Platform, separated from Core iBeX by the AI Gateway. Phase 0 implementation is pending access to the approved Technical Design v1.0 and Implementation Plan v1.0. No runtime or service stack has been selected in this repository.

## Architecture boundary

Core iBeX → AI Gateway → iBeX Hybrid Intelligent AI Platform. The platform must not connect directly to the Core iBeX database. Live Core data must pass through approved Tool/APIs; approved document knowledge must pass through RAG. Tenant context must originate from trusted Core or AI Gateway context, never a user prompt. See [SECURITY.md](SECURITY.md).

## Local setup

There are no dependencies or runnable services yet. Runtime, environment configuration, start commands, and test commands will be documented after the approved design and plan are available. Do not add real credentials to this repository.

## Project status

See [Phase 0 validation](docs/PHASE_0_VALIDATION.md) for the current gate and decisions required before implementation proceeds.
