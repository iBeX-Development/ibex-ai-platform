# Non-Asset synthetic test port — inactive

Maintenance reads exactly `{id, wo_status}` for one synthetic work order. The status is an opaque reference; no label is inferred. Warehouse reads exactly `{id, qty}` for one synthetic bin row, not stock totals or availability; no unit is assigned. The negative quantity is signed-int4 fixture data, not a business rule approval.

The tests use actual ToolRegistry/ToolRuntimeService, context validation, permission/entitlement gates, ownership enforcement, schema validation and audit correlation. Registration schemas, authorization/ownership callbacks, transport and audit sink are inert fixtures. Projection is explicitly constructed, not automatic stripping of arbitrary Core output. General wrong-scope forwarding is fixture-only and is denied before transport or server-policy/ownership callbacks; no real General dispatch is claimed.

A separate positive test consumes an actual SharedAgentRuntime Maintenance decision using an explicit fixture handoff to the destination ToolRuntime. The authorized user's scope is established before routing and unchanged; destination authorization and ownership occur before one fake adapter invocation. This is Maintenance contextual Asset read permitted by the existing routing fixture, not a Work_order transport. No General PilotAgentRuntime/public entry is executed and no General Core tool binding is granted.

Coverage is distinct from existing Asset ID and routing-only cases: exact non-Asset result keys, no labels/units/private fields, and router decision-to-destination admission. Existing broad tenant/cancellation cases are not repeated. Production code, profiles and endpoints remain unchanged; no Core/HTTP/DB/provider/network executes.

Baseline: Maintenance spec section13 (read capabilities including Asset contextual read); Warehouse spec section14 (read capabilities, versioned registry requirement); Tool/API contract and Gateway/tenant boundaries. These tests adopt no live field/nullability/permission semantics.

Origins: reviewed `ibex-nonasset-synthetic-20261116-reviewer-v1` (3 cases) and `ibex-general-destination-handoff-301fa2a9` (1 case). This port adds explicit fixed validation time and type/lint-safe fixture annotations only. It is not release acceptance or production integration.
