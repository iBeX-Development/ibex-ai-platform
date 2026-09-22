# iBeX Hybrid Intelligent AI Platform Architecture Baseline Package v1.0

**Package status:** Approved / Active  
**Baseline version:** 1.0

## Baseline purpose

This directory is the version-controlled repository package for the approved iBeX Hybrid Intelligent AI Platform architecture baseline. The 17 numbered Markdown documents are preserved from their approved source-of-truth files without content or architecture-decision changes.

This README is a repository navigation and governance index only. It does not override, reinterpret, or extend any approved baseline document.

## Repository layout

```text
docs/
  baseline/
    README.md
    01-master-ai-policy-v1.0.md
    ...
    17-implementation-plan-v1.0.md
```

## Active version list

| Order | Active baseline document | Repository file | Version | Status |
| --- | --- | --- | --- | --- |
| 01 | Master AI Policy | `01-master-ai-policy-v1.0.md` | v1.0 | Approved / Active |
| 02 | Tenant Security Contract | `02-tenant-security-contract-v1.0.md` | v1.0 | Approved / Active |
| 03 | Agent Architecture | `03-agent-architecture-v1.0.md` | v1.0 | Approved / Active |
| 04 | AI Gateway Contract | `04-ai-gateway-contract-v1.0.md` | v1.0 | Approved / Active |
| 05 | Tool/API Contract | `05-tool-api-contract-v1.0.md` | v1.0 | Approved / Active |
| 06 | RAG Architecture | `06-rag-architecture-v1.0.md` | v1.0 | Approved / Active |
| 07 | Model Gateway Architecture | `07-model-gateway-architecture-v1.0.md` | v1.0 | Approved / Active |
| 08 | Audit & Observability Architecture | `08-audit-observability-architecture-v1.0.md` | v1.0 | Approved / Active |
| 09 | Evaluation Framework | `09-evaluation-framework-v1.0.md` | v1.0 | Approved / Active |
| 10 | Pilot Domain Specifications | `10-pilot-domain-specifications-v1.0.md` | v1.0 | Approved / Active |
| 11 | General iBeX Agent Specification | `11-general-ibex-agent-specification-v1.0.md` | v1.0 | Approved / Active |
| 12 | Maintenance Agent Specification | `12-maintenance-agent-specification-v1.0.md` | v1.0 | Approved / Active |
| 13 | Asset Agent Specification | `13-asset-agent-specification-v1.0.md` | v1.0 | Approved / Active |
| 14 | Warehouse Agent Specification | `14-warehouse-agent-specification-v1.0.md` | v1.0 | Approved / Active |
| 15 | Implementation Readiness Review | `15-implementation-readiness-review-v1.0.md` | v1.0 | Approved / Active |
| 16 | Technical Design | `16-technical-design-v1.0.md` | v1.0 | Approved / Active |
| 17 | Implementation Plan | `17-implementation-plan-v1.0.md` | v1.0 | Approved / Active |

## Dependency order

The numbered files establish the repository dependency and reading order:

1. Master policy and tenant-security constraints establish the non-negotiable governance and trust boundary.
2. Agent, AI Gateway, Tool/API, RAG, Model Gateway, Audit & Observability, and Evaluation documents define the shared platform contracts and control layers.
3. Pilot Domain Specifications and the four pilot-agent specifications apply those shared controls to the approved pilot scope.
4. Implementation Readiness Review, Technical Design, and Implementation Plan govern the entry into implementation.

If an implementation question is not resolved by this order, stop and follow the architecture change procedure. Do not infer a new decision from a filename, summary, or implementation convenience.

## Approved and active status

All documents in the active version list are approved architecture-baseline documents at v1.0. Implementation work must comply with the full set; no individual service, agent, prompt, tool, model configuration, or deployment decision may override the package.

## v1.x minor update rule

A v1.x update may correct non-semantic errors, improve clarity, add traceability, or make an approved decision easier to apply without changing its meaning. It must:

- preserve the approved architecture, security, tenant-isolation, authorization, audit, and human-approval decisions;
- retain the source-of-truth record for the prior approved version;
- receive the required review and approval before becoming active; and
- update this README active-version list when the active version changes.

## v2.0 major update rule

A v2.0 update is required for a material architecture change, including a change to the Core iBeX and AI Platform boundary, trusted tenant context, tenant isolation, authorization, RAG and live-data separation, Tool/API action model, human-approval model, agent architecture, model-gateway governance, or release-gate requirements.

Create and approve a separate v2.0 baseline package before implementation adopts it. Do not overwrite or silently reinterpret this v1.0 package.

## Architecture change procedure

1. Record the requested change and the affected baseline documents.
2. Perform architecture review, including tenant/security, data, Tool/API, human-approval, audit, evaluation, cost, and implementation impacts.
3. Create a versioned architecture decision.
4. Update the affected Technical Design and Implementation Plan artifacts where required.
5. Obtain the required approval before the revised baseline becomes active.
6. Apply the approved version through the repository change process; do not implement an unapproved architecture change.

