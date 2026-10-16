import { trustedRequestContextSchema } from '../../packages/security/src/index.js';
import { ToolAdapterError } from '../../packages/tool-runtime/src/index.js';
import { offlineAssetSchema, type OfflineAssetRead } from './core-asset-offline-prototype.js';

export interface SyntheticCoreUser {
  readonly tenant_id: string;
  readonly user_id: string;
  readonly enabled: boolean;
  readonly permissions: readonly string[];
  readonly entitlements: readonly string[];
  readonly resources: readonly string[];
  readonly fields: readonly string[];
}
export interface SyntheticCoreSession {
  readonly session_id: string;
  readonly tenant_id: string;
  readonly user_id: string;
  readonly active: boolean;
}
export interface SyntheticCoreAsset {
  readonly tenant_id: string;
  readonly asset_id: string;
  readonly private_note: string;
}
export type SyntheticCoreResult =
  | Readonly<{ kind: 'success'; body: string }>
  | Readonly<{ kind: 'denied'; message: string }>
  | Readonly<{ kind: 'unavailable' }>;
export type SyntheticResponseFault =
  'none' | 'malformed' | 'oversized' | 'mismatched' | 'extra-field';

function active(signal: AbortSignal): void {
  if (signal.aborted) throw new ToolAdapterError('timeout');
}
const key = (tenant: string, identifier: string) => JSON.stringify([tenant, identifier]);
const denied = (): SyntheticCoreResult =>
  Object.freeze({
    kind: 'denied',
    message: 'Requested resource is unavailable within the current authorized scope'
  });

/** In-memory logical GET handler. No HTTP listener, authentication or persistent grants. */
export class SyntheticAssetCore {
  private readonly users = new Map<string, SyntheticCoreUser>();
  private readonly sessions = new Map<string, SyntheticCoreSession>();
  private readonly assets = new Map<string, SyntheticCoreAsset>();
  private available = true;
  private fault: SyntheticResponseFault = 'none';
  private readonly reads: { tenant_id: string; user_id: string; asset_id: string }[] = [];

  constructor(
    seed: Readonly<{
      users: readonly SyntheticCoreUser[];
      sessions: readonly SyntheticCoreSession[];
      assets: readonly SyntheticCoreAsset[];
    }>
  ) {
    for (const user of seed.users) this.replaceUser(user);
    for (const session of seed.sessions)
      this.sessions.set(session.session_id, Object.freeze({ ...session }));
    for (const asset of seed.assets)
      this.assets.set(key(asset.tenant_id, asset.asset_id), Object.freeze({ ...asset }));
  }

  replaceUser(user: SyntheticCoreUser): void {
    this.users.set(
      key(user.tenant_id, user.user_id),
      Object.freeze({
        ...user,
        permissions: Object.freeze([...user.permissions]),
        entitlements: Object.freeze([...user.entitlements]),
        resources: Object.freeze([...user.resources]),
        fields: Object.freeze([...user.fields])
      })
    );
  }
  revokeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) this.sessions.set(sessionId, Object.freeze({ ...session, active: false }));
  }
  setAvailable(available: boolean): void {
    this.available = available;
  }
  setResponseFault(fault: SyntheticResponseFault): void {
    this.fault = fault;
  }
  completedReads(): readonly Readonly<{ tenant_id: string; user_id: string; asset_id: string }>[] {
    return Object.freeze(this.reads.map((read) => Object.freeze({ ...read })));
  }

  async handle(
    request: Readonly<{ method: string; assetId: unknown; context: unknown; signal: AbortSignal }>
  ): Promise<SyntheticCoreResult> {
    active(request.signal);
    // Yield before the final check: tests can revoke state while a request is in flight.
    await Promise.resolve();
    active(request.signal);
    if (!this.available) return Object.freeze({ kind: 'unavailable' });
    const context = trustedRequestContextSchema.safeParse(request.context);
    const input = offlineAssetSchema.safeParse({ asset_id: request.assetId });
    if (request.method !== 'GET' || !context.success || !input.success) return denied();
    const caller = context.data;
    const session = this.sessions.get(caller.session_id);
    if (
      !session?.active ||
      session.tenant_id !== caller.tenant_id ||
      session.user_id !== caller.user_id
    )
      return denied();
    const user = this.users.get(key(session.tenant_id, session.user_id));
    const assetId = input.data.asset_id;
    const asset = this.assets.get(key(session.tenant_id, assetId));
    // These are synthetic server-side policy identifiers, never production mappings.
    if (
      !user?.enabled ||
      !user.permissions.includes('fixture:core:asset:read') ||
      !user.entitlements.includes('fixture:core:asset-tools') ||
      !user.resources.includes(assetId) ||
      !user.fields.includes('asset_id') ||
      !asset
    )
      return denied();
    active(request.signal);
    this.reads.push({
      tenant_id: session.tenant_id,
      user_id: session.user_id,
      asset_id: asset.asset_id
    });
    let body = JSON.stringify({ asset_id: asset.asset_id });
    if (this.fault === 'malformed') body = 'not-json';
    if (this.fault === 'oversized') body = body.padEnd(16 * 1024 + 1);
    if (this.fault === 'mismatched') body = JSON.stringify({ asset_id: 'synthetic-mismatched-id' });
    if (this.fault === 'extra-field')
      body = JSON.stringify({ asset_id: asset.asset_id, private_note: asset.private_note });
    return Object.freeze({ kind: 'success', body });
  }
}

/** Test-only translation of logical results; does not define real Core HTTP status mapping. */
export function syntheticCoreRead(core: SyntheticAssetCore): OfflineAssetRead {
  return async ({ context, input, signal }) => {
    const result = await core.handle({ method: 'GET', assetId: input.asset_id, context, signal });
    if (result.kind === 'denied') throw new ToolAdapterError('permanent');
    if (result.kind === 'unavailable') throw new ToolAdapterError('unavailable');
    return result.body;
  };
}
