export interface ModelUsageMetric {
  readonly event_type: 'model_gateway.usage';
  readonly timestamp: string;
  readonly request_id: string;
  readonly correlation_id: string;
  readonly trace_id: string;
  readonly tenant_id: string;
  readonly user_id: string;
  readonly agent_id: string;
  readonly provider_id: string;
  readonly model_id: string;
  readonly model_version: string;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly total_tokens: number;
  readonly estimated_cost: number;
  readonly latency_ms: number;
  readonly fallback_used: boolean;
}

export interface ModelMetricsSink {
  emit(metric: ModelUsageMetric): Promise<void>;
}

export class UnconfiguredModelMetricsSink implements ModelMetricsSink {
  emit(): Promise<void> {
    return Promise.reject(new Error('Model metrics sink is not configured'));
  }
}
