# Asset location local protocol — synthetic test only

This fixture ports reviewed local scenarios onto the committed AI base. It does not bind Core or describe the deployed Directus API.

The explicit local protocol returns `id`, `name`, `asset_code`, and an optional `location` containing a name or explicit null. Omitted location remains omitted. String identifiers are synthetic; no numeric conversion is tested. Four acceptance cases cover location object, null, omission, and strict rejection of a benign undeclared field.

Actual components: AiGatewayService, SharedAgentRuntime, ToolRuntimeService, ToolRegistry/ToolBindingCatalog, and PilotAgentRuntime. Authentication, authorization, ownership, transport and audit sinks are inert fixtures. The test-only dispatcher is a copy of the existing inactive dispatcher with output decoding/projection adapted to this local protocol. The product dispatcher remains asset_id-only and unchanged. Fixture approval metadata is not production authorization.

The existing Asset capability allowlist and tenant/resource checks remain in the composition. The production profile remains disabled. No Core, HTTP listener, database, provider, real credentials or network is used. The test helpers live under tests/testing and are excluded from production build.

Baseline links: [Asset specification](../../baseline/13-asset-agent-specification-v1.0.md), [Tool contract](../../baseline/05-tool-api-contract-v1.0.md). Asset fields are minimized; relationship/nullability/effective read-grant semantics for live integration still require authoritative mapping. No architectural or public contract change is proposed by these fixtures.

Reviewed origins: location packet manifest `64e7ae5216dffbda64666e13bacf01bd83ba1a842f2dae80b75f17e59680a6a8`; boundary packet manifest `dbcef276f39e41e792328d4d541b56b83e1129f49e3d9fa3809ae7192e4fb919`. Port validation is separate from those prior receipts.
