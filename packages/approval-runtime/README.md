# Human Approval Runtime

Phase 9 provides a fail-closed boundary between AI-generated action proposals and
authoritative Core workflow decisions. AI can create a proposal, but it cannot submit an
approval decision, impersonate an approver, or mutate approval state.

Approval decisions are read from an approved server-side authority port. Every protected
execution revalidates the current authoritative decision as well as tenant, permission,
entitlement, ownership, target state, approval evidence, proposal integrity, and idempotency.
Rejected, cancelled, revoked, expired, unavailable, or conflicting authority state fails closed.
Live Core decision and execution adapters remain disabled until their exact contracts, identities,
authentication, workflow rules, and schemas are approved.
