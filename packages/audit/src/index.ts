import type { z } from 'zod';
import type { auditEventSchema } from '../../contracts/src/index.js';

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
