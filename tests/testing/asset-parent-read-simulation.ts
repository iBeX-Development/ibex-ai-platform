// Test-only target-contract simulation: no production registration or transport.
// Synthetic fields are not Report39 mappings or an approved deployed Core schema.
import { z } from 'zod';
import { rawJsonSnapshot, structuredSnapshot } from './scoped-factual-grounding-ingress.js';

// Negative-test bounds only, not approved production limits.
const syntheticLimits = { bytes: 4096, depth: 8 };

const id = z.string().regex(/^[A-Za-z0-9_-]+$/);
const binding = {
  contract_id: z.literal('asset-parent-read'),
  contract_version: z.literal('0.1.0'),
  operation: z.literal('asset.parent.read'),
  correlation_id: id
};
const requestSchema = z
  .object({
    ...binding,
    subject: z.object({ asset_id: id }).strict(),
    selectors: z.tuple([z.literal('parent')])
  })
  .strict();
const rowSchema = z.object({ id, company: id, parent: id.nullable() }).strict();
export const fixtureRequest = () => ({
  contract_id: 'asset-parent-read',
  contract_version: '0.1.0',
  operation: 'asset.parent.read',
  correlation_id: 'request-1',
  subject: { asset_id: 'child' },
  selectors: ['parent']
});
type Request = z.infer<typeof requestSchema>;
type Outcome =
  { outcome: 'known'; parent_id: string } | { outcome: 'unknown' | 'unavailable' | 'error' };
export type Wire = {
  status: number;
  body: Pick<Request, 'contract_id' | 'contract_version' | 'operation' | 'correlation_id'> &
    Outcome;
};
const wireSchema = z
  .object({
    status: z.number(),
    body: z.union([
      z.object({ ...binding, outcome: z.literal('known'), parent_id: id }).strict(),
      z.object({ ...binding, outcome: z.enum(['unknown', 'unavailable', 'error']) }).strict()
    ])
  })
  .strict();
const replySchema = z.object({ subject_id: id, wire: wireSchema }).strict();
export interface SimulationOptions {
  rows?: unknown;
  company?: string;
  readable?: readonly string[];
  discloseUnknown?: boolean;
  // Synthetic policy only: null never implies root.
  nullMeansUnknown?: boolean;
  gatewayDownAt?: 'ingress' | 'tool' | 'final';
  platformDown?: boolean;
  coreReadDown?: boolean;
  trustedBinding?: { subject_id: string; correlation_id: string };
  featureEnabled?: boolean;
  profileEnabled?: boolean;
  registered?: boolean;
  invalidGatewayAuthority?: boolean;
  // Test-owned fault injection and boundary observers, never production extension points.
  corruptCoreReply?: (reply: unknown) => unknown;
  observeCoreCall?: () => void;
}

export function createAssetParentSimulation(options: SimulationOptions = {}) {
  const trace: string[] = [];
  const restrictedAudit: string[] = [];
  const modelContext: Wire[] = [];
  // Object identity represents an already authenticated stub session, not credentials.
  const session = Object.freeze({ syntheticSession: true });
  const expected = Object.freeze({
    ...(options.trustedBinding ?? {
      subject_id: 'child',
      correlation_id: 'request-1'
    })
  });
  const trustedCompany = options.company ?? 'company-a';
  const readable = new Set(options.readable ?? ['child', 'parent']);
  const rows: unknown = structuredClone(
    options.rows ?? [
      { id: 'child', company: 'company-a', parent: 'parent' },
      { id: 'parent', company: 'company-a', parent: null }
    ]
  );
  const gatewayCapability = Symbol('test-only gateway capability');
  const audit = (diagnostic: string, outcome: Outcome): Outcome => {
    restrictedAudit.push(diagnostic);
    return outcome;
  };
  const unavailable = (diagnostic: string) => audit(diagnostic, { outcome: 'unavailable' });
  const error = (diagnostic: string) => audit(diagnostic, { outcome: 'error' });
  function envelope(request: Request, outcome: Outcome): Wire {
    return {
      status: outcome.outcome === 'unavailable' ? 404 : outcome.outcome === 'error' ? 503 : 200,
      body: {
        contract_id: request.contract_id,
        contract_version: request.contract_version,
        operation: request.operation,
        correlation_id: request.correlation_id,
        ...outcome
      }
    };
  }
  function readCoreOutcome(request: Request, capability: symbol): Outcome {
    if (capability !== gatewayCapability) return error('invalid_gateway_capability');
    options.observeCoreCall?.();
    trace.push('Gateway->syntheticCoreAPI');
    if (options.coreReadDown) return error('source_unavailable');
    if (!readable.has(request.subject.asset_id)) return unavailable('child_denied');
    if (!Array.isArray(rows)) return error('source_invalid');
    // This synthetic source's trusted company partition precedes field/cardinality
    // diagnostics. Foreign/missing ownership is never parsed as accessible data.
    const scoped = rows.filter(
      (row: unknown): row is Record<string, unknown> =>
        typeof row === 'object' &&
        row !== null &&
        'company' in row &&
        row.company === trustedCompany
    );
    const matches = scoped.filter((row) => row.id === request.subject.asset_id);
    if (!matches.length) return unavailable('child_not_found');
    if (matches.length !== 1) return error('source_ambiguous');
    const parsed = rowSchema.safeParse(matches[0]);
    if (!parsed.success) return error('source_invalid');
    const child = parsed.data;
    if (child.parent === null) {
      if (!options.discloseUnknown) return unavailable('unknown_disclosure_denied');
      return options.nullMeansUnknown
        ? audit('authorized_unknown', { outcome: 'unknown' })
        : error('null_unmapped');
    }
    if (!readable.has(child.parent)) return unavailable('parent_denied');
    const parents = scoped.filter((row) => row.id === child.parent);
    if (!parents.length) return unavailable('parent_not_found');
    if (parents.length !== 1 || child.parent === child.id) return error('parent_invalid');
    if (!rowSchema.safeParse(parents[0]).success) return error('parent_invalid');
    return audit('authorized_known', { outcome: 'known', parent_id: child.parent });
  }
  function internalReply(request: Request, outcome: Outcome) {
    return { subject_id: request.subject.asset_id, wire: envelope(request, outcome) };
  }
  function syntheticCoreApi(request: Request, capability: symbol): unknown {
    // The producer binds its result before crossing the Core->Gateway boundary.
    const reply = internalReply(request, readCoreOutcome(request, capability));
    return options.corruptCoreReply ? options.corruptCoreReply(structuredClone(reply)) : reply;
  }
  function gatewayTool(request: Request): unknown {
    trace.push('gateway-only adapter->Gateway');
    if (options.gatewayDownAt === 'tool')
      return internalReply(request, error('gateway_tool_unavailable'));
    const result = syntheticCoreApi(
      request,
      options.invalidGatewayAuthority ? Symbol('invalid') : gatewayCapability
    );
    trace.push('syntheticCoreAPI->Gateway');
    trace.push('Gateway->Platform');
    return result;
  }
  function toolRuntime(request: Request): unknown {
    trace.push('Platform->ToolRuntime');
    if (
      options.featureEnabled === false ||
      options.profileEnabled === false ||
      options.registered === false
    )
      return internalReply(request, error('dispatch_disabled'));
    trace.push('ToolRuntime->gateway-only adapter');
    return gatewayTool(request);
  }
  function platform(request: Request): Wire {
    trace.push('Gateway->Platform orchestration');
    if (options.platformDown) return envelope(request, error('platform_unavailable'));
    let wire: Wire;
    try {
      // Verify the producer's binding; never manufacture a subject around its wire.
      const candidate = toolRuntime(request);
      const reply = replySchema.parse(structuredSnapshot(candidate, syntheticLimits));
      const body = reply.wire.body;
      const expectedStatus =
        body.outcome === 'unavailable' ? 404 : body.outcome === 'error' ? 503 : 200;
      if (
        reply.subject_id !== expected.subject_id ||
        body.correlation_id !== expected.correlation_id ||
        reply.wire.status !== expectedStatus
      )
        throw new Error('binding');
      wire = reply.wire;
    } catch {
      return envelope(request, error('response_invalid'));
    }
    modelContext.push(structuredClone(wire));
    return wire;
  }
  return {
    session,
    request(input: unknown, authenticatedSession: unknown): Wire {
      trace.push('Core-facing request->Gateway');
      let snapshot: unknown;
      try {
        snapshot =
          input instanceof Uint8Array
            ? rawJsonSnapshot(input, syntheticLimits)
            : structuredSnapshot(input, syntheticLimits);
      } catch {
        snapshot = undefined;
      }
      const parsed = requestSchema.safeParse(snapshot);
      // Invalid requests have no trusted correlation; do not echo attacker input.
      const fallback = requestSchema.parse(fixtureRequest());
      fallback.correlation_id = 'invalid-request';
      if (!parsed.success) return envelope(fallback, error('request_invalid'));
      const request = parsed.data;
      if (options.gatewayDownAt === 'ingress')
        return envelope(request, error('gateway_ingress_unavailable'));
      if (authenticatedSession !== session) return envelope(request, unavailable('session_denied'));
      if (
        request.correlation_id !== expected.correlation_id ||
        request.subject.asset_id !== expected.subject_id
      )
        return envelope(fallback, error('request_binding_invalid'));
      const result = platform(request);
      trace.push('Platform->Gateway final');
      if (options.gatewayDownAt === 'final')
        return envelope(request, error('gateway_final_unavailable'));
      trace.push('Gateway->Core-facing response');
      return result;
    },
    // Independent stubs have no AI dependencies. This does NOT prove real Core isolation.
    coreOperation(operation: 'startup' | 'login' | 'business' | 'background') {
      return { operation, available: true };
    },
    inspectTrace: () => [...trace],
    inspectRestrictedAudit: () => [...restrictedAudit],
    inspectModelContext: () => structuredClone(modelContext),
    inspectSource: () => structuredClone(rows)
  };
}
