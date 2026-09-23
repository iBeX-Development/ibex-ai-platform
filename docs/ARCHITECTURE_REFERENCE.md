# Architecture reference

The source of truth is the approved and active v1.0 package in [`docs/baseline/`](baseline/README.md). It contains all 17 mandatory documents, from Master AI Policy v1.0 through Implementation Plan v1.0.

Implementation must follow their dependency order and must not amend or override them. Missing or conflicting requirements are recorded as blockers or decisions required. Implementation-level decisions are kept separately in [`docs/decisions/`](decisions/) and do not modify architecture v1.0.

Phase 0 implements the repository and engineering foundation defined by Implementation Plan v1.0 section 8. It does not implement Phase 1 security enforcement or later business capabilities.
