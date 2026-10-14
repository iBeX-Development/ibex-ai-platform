import { describe, expect, it } from 'vitest';
import { compareArtifactBinding, type ArtifactIdentity } from './support/artifact-binding.js';

// Synthetic claims only, not real measured artifacts, receipts or authority fixtures.
const fixture = (): ArtifactIdentity => ({
  repository: 'example/synthetic',
  candidate_head: 'a'.repeat(40),
  candidate_base: 'b'.repeat(40),
  evaluated_commit: 'c'.repeat(40),
  ordered_parents: ['b'.repeat(40), 'a'.repeat(40)],
  source_tree: 'd'.repeat(40),
  inputs: [
    { path: 'src/main.ts', mode: '100644', git_blob: 'e'.repeat(40), sha256: '1'.repeat(64) },
    { path: 'scripts/check.sh', mode: '100755', git_blob: 'f'.repeat(40), sha256: '2'.repeat(64) }
  ]
});
function input(value: ArtifactIdentity) {
  const row = value.inputs[0];
  if (!row) throw new Error('Missing synthetic input');
  return row;
}
const mismatch = (expected: unknown, observed: unknown, diagnostic: string) => {
  const result = compareArtifactBinding(expected, observed);
  expect(result.binding_status).toBe('MISMATCH');
  expect(result.authority_status).toBe('not-established');
  expect(result.diagnostics).toContain(diagnostic);
};

describe('detached artifact identity comparison without authority', () => {
  it('matches identical claims without authenticating candidate-selected expectations', () => {
    const candidate = fixture();
    expect(compareArtifactBinding(candidate, candidate)).toEqual({
      binding_status: 'MATCH',
      authority_status: 'not-established',
      diagnostics: []
    });
    expect(compareArtifactBinding(structuredClone(candidate), fixture())).toEqual(
      compareArtifactBinding(candidate, candidate)
    );
  });
  it('compares finite input sets independently of their array order without mutation', () => {
    const expected = fixture();
    const observed = fixture();
    observed.inputs.reverse();
    const before = JSON.stringify([expected, observed]);
    expect(compareArtifactBinding(expected, observed).binding_status).toBe('MATCH');
    expect(JSON.stringify([expected, observed])).toBe(before);
  });
  it.each([
    [undefined, undefined],
    [null, null],
    [undefined, fixture()],
    [fixture(), null]
  ])('returns UNVERIFIED for absent inputs %#', (expected, observed) => {
    expect(compareArtifactBinding(expected, observed)).toMatchObject({
      binding_status: 'UNVERIFIED',
      authority_status: 'not-established'
    });
  });
  it.each([
    'repository',
    'candidate_head',
    'candidate_base',
    'evaluated_commit',
    'source_tree'
  ] as const)('rejects a different %s', (field) => {
    const observed = fixture();
    observed[field] = field === 'repository' ? 'example/other' : '9'.repeat(40);
    mismatch(fixture(), observed, `${field.toUpperCase()}_MISMATCH`);
  });
  it('does not conflate a head and a merge with identical trees', () => {
    // Reported PR39 commit/tree labels with synthetic input identities: no real receipt.
    const head = fixture();
    head.candidate_head = '8e87f9fa57b600c8e66730feb132f12a867d3bf1';
    head.candidate_base = '529951f9818c301aae67d94e980deafe7495391f';
    head.evaluated_commit = head.candidate_head;
    head.ordered_parents = [head.candidate_base];
    head.source_tree = 'dfa47fd422c31bd4b2f89425cf05657f44698749';
    const merge = structuredClone(head);
    merge.evaluated_commit = '9b05942c2fe3ddebea16d0d35d82111385fa8b91';
    merge.ordered_parents = [head.candidate_base, head.candidate_head];
    expect(head.source_tree).toBe(merge.source_tree);
    mismatch(head, merge, 'EVALUATED_COMMIT_MISMATCH');
    mismatch(head, merge, 'ORDERED_PARENTS_MISMATCH');
  });
  it.each(['reverse', 'missing', 'extra', 'different'])(
    'rejects %s parents even when commit/tree claims match',
    (change) => {
      const observed = fixture();
      if (change === 'reverse') observed.ordered_parents.reverse();
      if (change === 'missing') observed.ordered_parents.pop();
      if (change === 'extra') observed.ordered_parents.push('9'.repeat(40));
      if (change === 'different') observed.ordered_parents[0] = '8'.repeat(40);
      mismatch(fixture(), observed, 'ORDERED_PARENTS_MISMATCH');
    }
  );
  it.each(['mode', 'git_blob', 'sha256'] as const)('rejects changed input %s', (field) => {
    const observed = fixture();
    const row = input(observed);
    if (field === 'mode') row.mode = '100755';
    else row[field] = '9'.repeat(field === 'sha256' ? 64 : 40);
    mismatch(fixture(), observed, `INPUT_${field.toUpperCase()}_MISMATCH`);
  });
  it('rejects missing, extra and replaced input paths, including case changes', () => {
    const observed = fixture();
    observed.inputs.pop();
    mismatch(fixture(), observed, 'MISSING_INPUT');
    observed.inputs.push({ ...input(observed), path: 'extra.ts' });
    mismatch(fixture(), observed, 'EXTRA_INPUTS');
    input(observed).path = 'Src/main.ts';
    mismatch(fixture(), observed, 'MISSING_INPUT');
  });
  it.each([undefined, null])(
    'malformed present data takes precedence over absence %#',
    (absent) => {
      mismatch(absent, {}, 'OBSERVED_MALFORMED');
      mismatch({}, absent, 'EXPECTED_MALFORMED');
    }
  );
  it.each([{}, [], 'text', 1, true, { repository: 'example/synthetic' }])(
    'rejects malformed identity %# without throwing',
    (value) => {
      mismatch(value, fixture(), 'EXPECTED_MALFORMED');
      mismatch(fixture(), value, 'OBSERVED_MALFORMED');
    }
  );
  it.each(['candidate_head', 'candidate_base', 'evaluated_commit', 'source_tree'] as const)(
    'rejects malformed %s',
    (field) => {
      for (const value of ['', '0'.repeat(40), 'A'.repeat(40), 'a'.repeat(39), 'z'.repeat(40)]) {
        const bad = fixture();
        bad[field] = value;
        mismatch(bad, fixture(), 'EXPECTED_MALFORMED');
      }
    }
  );
  it.each(['https://example/repo', '../repo', 'owner/repo/extra', 'owner repo/name', ''])(
    'rejects malformed repository %s',
    (repository) => {
      const bad = fixture();
      bad.repository = repository;
      mismatch(fixture(), bad, 'OBSERVED_MALFORMED');
    }
  );
  it.each([
    '',
    '/a',
    'a/',
    'a//b',
    './a',
    'a/../b',
    'a\\b',
    'a%2fb',
    'a:b',
    'a b',
    'a\nb',
    'a.',
    '.git/config',
    'A/.GIT/config',
    'NUL.txt',
    'com1',
    'café.ts'
  ])('rejects ambiguous or unsupported path %#', (path) => {
    const bad = fixture();
    input(bad).path = path;
    mismatch(fixture(), bad, 'OBSERVED_MALFORMED');
  });
  it.each(['src/main.ts', 'SRC/MAIN.ts', 'src', 'src/main.ts/child'])(
    'rejects duplicate or file/directory path collision %s',
    (path) => {
      const bad = fixture();
      bad.inputs.push({ ...input(bad), path });
      mismatch(bad, fixture(), 'EXPECTED_MALFORMED');
    }
  );
  it.each(['120000', '160000', '040000', '644', 100644])(
    'rejects unsupported file mode %s',
    (mode) => {
      const bad = fixture();
      Object.assign(input(bad), { mode });
      mismatch(fixture(), bad, 'OBSERVED_MALFORMED');
    }
  );
  it.each(['git_blob', 'sha256'] as const)('rejects malformed input %s', (field) => {
    for (const value of ['', 'xyz', '0'.repeat(field === 'sha256' ? 64 : 40)]) {
      const bad = fixture();
      input(bad)[field] = value;
      mismatch(fixture(), bad, 'OBSERVED_MALFORMED');
    }
  });
  it('rejects empty inputs and duplicate, self or malformed parents', () => {
    const bad = fixture();
    bad.inputs = [];
    mismatch(fixture(), bad, 'OBSERVED_MALFORMED');
    for (const parents of [['a'.repeat(40), 'a'.repeat(40)], ['c'.repeat(40)], ['invalid']]) {
      const value = fixture();
      value.ordered_parents = parents;
      mismatch(value, fixture(), 'EXPECTED_MALFORMED');
    }
  });
  it.each(['trusted', 'approved', 'authority_status', 'release_allowed', 'unexpected'])(
    'rejects unknown field/trust flag %s at both object levels',
    (key) => {
      const bad = fixture();
      Object.assign(bad, { [key]: true });
      mismatch(bad, fixture(), 'EXPECTED_MALFORMED');
      const nested = fixture();
      Object.assign(input(nested), { [key]: true });
      mismatch(fixture(), nested, 'OBSERVED_MALFORMED');
    }
  );
  it('does not throw on hostile runtime accessors or proxies', () => {
    const accessor = Object.defineProperty({}, 'repository', {
      get() {
        throw new Error('Malformed');
      }
    });
    const proxy = new Proxy(
      {},
      {
        get() {
          throw new Error('Malformed');
        }
      }
    );
    mismatch(accessor, fixture(), 'EXPECTED_MALFORMED');
    mismatch(fixture(), proxy, 'OBSERVED_MALFORMED');
  });
});
