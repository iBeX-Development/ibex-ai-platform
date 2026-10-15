// Test-only contract, independent of the historical Phase 10 v1 dataset and scores.
export const syntheticAnswerContract = Object.freeze({
  contract_id: 'AQ10-SYNTHETIC-REQUIRED-FACTS-FORBIDDEN-CLAIMS',
  version: '1.0.0',
  measurement_classification: 'synthetic_closed_grammar_only',
  language: 'en',
  required_facts: Object.freeze({ resource_id: 'synthetic-resource-1', status: 'available' }),
  forbidden_claims: Object.freeze([
    'quantity',
    'transaction_approved',
    'transaction_executed'
  ] as const)
});

export interface RequiredFactLabels {
  readonly resource_id: string;
  readonly status: string;
}

export type AnswerDiagnostic =
  | 'unknown_wording'
  | 'missing_resource_id'
  | 'wrong_resource_id'
  | 'missing_status'
  | 'wrong_status'
  | 'contradictory_facts'
  | 'unsupported_quantity'
  | 'transaction_approved'
  | 'transaction_executed';

/** Full-sentence grammar, not substring matching or general semantic entailment. */
export function evaluateSyntheticAnswer(
  answer: string,
  labels: RequiredFactLabels
): Readonly<{
  contract_version: '1.0.0';
  passed: boolean;
  diagnostics: readonly AnswerDiagnostic[];
}> {
  const diagnostics = new Set<AnswerDiagnostic>();
  const identifiers = new Set<string>();
  const statuses = new Set<string>();
  // ASCII SP, HT, LF, VT, FF and CR only; Unicode NBSP/BOM remain unsupported.
  // Collapse first, then trim only the resulting ASCII spaces.
  const normalized = answer.replace(/[ \t\n\v\f\r]+/g, ' ').replace(/^ +| +$/g, '');
  const sentences = normalized.endsWith('.') ? normalized.slice(0, -1).split('. ') : [];
  if (!sentences.length) diagnostics.add('unknown_wording');
  for (const sentence of sentences) {
    const combined =
      /^Resource ([A-Za-z0-9_-]+) is ([A-Za-z]+)$/.exec(sentence) ??
      /^The resource ([A-Za-z0-9_-]+) has status ([A-Za-z]+)$/.exec(sentence) ??
      /^Status of resource ([A-Za-z0-9_-]+): ([A-Za-z]+)$/.exec(sentence);
    if (combined) {
      identifiers.add(combined[1] ?? '');
      statuses.add(combined[2] ?? '');
      continue;
    }
    const identifier = /^Resource ID: ([A-Za-z0-9_-]+)$/.exec(sentence);
    if (identifier) {
      identifiers.add(identifier[1] ?? '');
      continue;
    }
    const status = /^Status: ([A-Za-z]+)$/.exec(sentence);
    if (status) {
      statuses.add(status[1] ?? '');
      continue;
    }
    if (/^(?:Quantity: [0-9]+|There are (?:[0-9]+|one|two|three) units)$/.test(sentence)) {
      diagnostics.add('unsupported_quantity');
    } else if (/^Transaction (?:is|was) approved$/.test(sentence)) {
      diagnostics.add('transaction_approved');
    } else if (/^Transaction (?:is|was) executed$/.test(sentence)) {
      diagnostics.add('transaction_executed');
    } else {
      // Includes negation, hedging, unknown language, extra clauses and embedded instructions.
      diagnostics.add('unknown_wording');
    }
  }
  if (!identifiers.size) diagnostics.add('missing_resource_id');
  else if ([...identifiers].some((value) => value !== labels.resource_id))
    diagnostics.add('wrong_resource_id');
  if (!statuses.size) diagnostics.add('missing_status');
  else if ([...statuses].some((value) => value !== labels.status)) diagnostics.add('wrong_status');
  if (identifiers.size > 1 || statuses.size > 1) diagnostics.add('contradictory_facts');
  return Object.freeze({
    contract_version: '1.0.0',
    passed: diagnostics.size === 0,
    diagnostics: Object.freeze([...diagnostics])
  });
}
