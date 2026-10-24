import { SpanStatusCode, type Span } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pilotAgentProfiles } from '../../agents/index.js';
import type { AuditRecord } from '../../packages/audit/src/index.js';
import { featureControls } from '../../packages/configuration/src/index.js';
import { PlatformError } from '../../packages/errors/src/index.js';
import { tracer } from '../../packages/observability/src/index.js';
import { PilotAgentRuntime } from '../../packages/pilot-agents/src/index.js';
import { enabledTestFeatureControls } from '../../packages/testing/src/index.js';
import {
  pilotContext,
  pilotRequest,
  pilotValidationTime,
  syntheticProfile
} from '../testing/pilot-agent-fixtures.js';

const cases = [
  {
    flag: 'rag',
    agent: 'general_ibex',
    intent: 'GENERAL_KNOWLEDGE',
    rag: ['ibex-handbook'],
    tools: []
  },
  {
    flag: 'tools',
    agent: 'warehouse',
    intent: 'INVENTORY_QUERY',
    rag: [],
    tools: ['inventory.stock']
  },
  {
    flag: 'actionTools',
    agent: 'warehouse',
    intent: 'ISSUE_DRAFT_ACTION',
    rag: [],
    tools: ['inventory.prepare_issue']
  }
] as const;

describe.each(cases)('disabled $flag denial reporting', (item) => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    const count = vi.getTimerCount();
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
    expect(count).toBe(0);
  });

  it.each(['resolve', 'throw', 'reject', 'hang', 'late resolve', 'late reject'] as const)(
    'preserves denial with sink %s and completes once',
    async (mode) => {
      const profile = pilotAgentProfiles.find((p) => p.agent_id === item.agent);
      if (!profile) throw new Error('Missing test profile');
      const selected = syntheticProfile(profile);
      const attempted: AuditRecord[] = [];
      let resolve!: () => void;
      let reject!: (error: unknown) => void;
      const pending = new Promise<void>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      const emit = vi.fn((event: AuditRecord) => {
        attempted.push(event);
        if (mode === 'throw') throw new Error('private audit failure');
        if (mode === 'reject') return Promise.reject(new Error('private audit failure'));
        return mode === 'resolve' ? Promise.resolve() : pending;
      });
      const grounding = {
        resolve: vi.fn(() =>
          Promise.resolve({ answer: 'private answer', rag: [], tool_responses: [] })
        )
      };
      const span = {
        setAttribute: vi.fn(),
        setAttributes: vi.fn(),
        recordException: vi.fn(),
        setStatus: vi.fn(),
        addEvent: vi.fn(),
        end: vi.fn()
      };
      vi.spyOn(tracer, 'startActiveSpan').mockImplementation((...args) => {
        const callback = args.at(-1) as (active: Span) => unknown;
        return callback(span as unknown as Span);
      });
      const prompt = {
        prompt_id: 'test-policy',
        prompt_version: '1.0',
        content_hash: `sha256:${'1'.repeat(64)}`
      };
      const runtime = new PilotAgentRuntime(
        selected,
        grounding,
        { emit },
        {
          featureControls: featureControls({ ...enabledTestFeatureControls, [item.flag]: false }),
          service: 'pilot-agent-test',
          environment: 'test',
          allowDeterministicTestAdapters: true,
          promptHierarchy: {
            master_policy: prompt,
            orchestrator_prompt: prompt,
            domain_prompt: prompt
          }
        }
      );
      let completions = 0;
      const finished = runtime
        .execute(
          pilotRequest(selected, {
            context: pilotContext({ permissions: [...item.tools] }),
            intent: item.intent,
            requested_rag_scopes: [...item.rag],
            requested_tool_capabilities: [...item.tools]
          }),
          pilotValidationTime
        )
        .catch((error: unknown) => {
          completions += 1;
          return error;
        });
      await vi.advanceTimersByTimeAsync(0);
      expect(attempted).toHaveLength(1);
      expect(attempted[0]).toMatchObject({
        event_type: 'orchestrator.routing.outcome',
        outcome: 'rejected',
        stage: 'authorization',
        error_code: 'PERMISSION_DENIED',
        context_status: 'trusted',
        tenant_id: 'tenant-a',
        user_id: 'user-1',
        request_id: 'request-p8-1',
        correlation_id: 'correlation-p8-1',
        trace_id: 'trace-p8-1',
        selected_agent: item.agent,
        agent_version: selected.versions.agent,
        intent: item.intent,
        sources_used: [],
        tools_used: [],
        evidence_status: 'insufficient',
        response_status: 'rejected'
      });
      expect(grounding.resolve).not.toHaveBeenCalled();
      const delayed = mode === 'hang' || mode.startsWith('late');
      if (delayed) {
        await vi.advanceTimersByTimeAsync(999);
        expect(completions).toBe(0);
        expect(span.end).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
      }
      const error = await finished;
      expect(error).toBeInstanceOf(PlatformError);
      expect(error).toMatchObject({
        code: 'PERMISSION_DENIED',
        publicMessage: 'Access denied',
        statusCode: 403
      });
      expect(span.addEvent).toHaveBeenCalledTimes(mode === 'resolve' ? 0 : 1);
      if (mode !== 'resolve')
        expect(span.addEvent).toHaveBeenCalledWith('pilot-agent.audit.emission_failed');
      // Attempts are not durable-delivery evidence; late sinks cannot resume execution.
      if (mode === 'late resolve') resolve();
      if (mode === 'late reject') reject(new Error('private late audit failure'));
      await vi.advanceTimersByTimeAsync(0);
      expect(await finished).toBe(error);
      expect(completions).toBe(1);
      expect(emit).toHaveBeenCalledTimes(1);
      expect(grounding.resolve).not.toHaveBeenCalled();
      expect(span.end).toHaveBeenCalledTimes(1);
      expect(span.setStatus).toHaveBeenCalledExactlyOnceWith({ code: SpanStatusCode.ERROR });
      expect(
        JSON.stringify({ attempted, error, exceptions: span.recordException.mock.calls })
      ).not.toContain('private');
    }
  );
});
