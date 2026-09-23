import type { z } from 'zod';
import { auditEventSchema } from '../../contracts/src/index.js';
import type { TrustedRequestContext } from '../../security/src/index.js';

export type AuditEvent = Readonly<z.infer<typeof auditEventSchema>>;

export interface AuditEventSink {
  emit(event: AuditEvent): Promise<void>;
}

export class UnconfiguredAuditEventSink implements AuditEventSink {
  emit(event: AuditEvent): Promise<void> {
    return Promise.reject(
      new Error(`Audit event sink is not configured for event type: ${event.event_type}`)
    );
  }
}

export function createSecurityAuditEvent(
  context: TrustedRequestContext,
  service: string,
  environment: string,
  eventType: string,
  timestamp: Date = new Date()
): AuditEvent {
  return Object.freeze(
    auditEventSchema.parse({
      schema_version: '1.0',
      event_type: eventType,
      timestamp: timestamp.toISOString(),
      request_id: context.request_id,
      correlation_id: context.correlation_id,
      tenant_id: context.tenant_id,
      user_id: context.user_id,
      service,
      environment
    })
  );
}
