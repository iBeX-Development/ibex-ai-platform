import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const scanner = resolve(import.meta.dirname, '../../scripts/phase10-scan.mjs');
const roots: string[] = [];
const environment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
);

function repository(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'ibex-scanner-'));
  roots.push(root);
  const init = spawnSync('git', ['init', '--quiet', root], { env: environment });
  expect(init.status).toBe(0);
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return root;
}

function run(root: string, gate: string) {
  const result = spawnSync(process.execPath, [scanner, gate], {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    timeout: 10_000
  });
  expect(result.error).toBeUndefined();
  return { status: result.status, output: result.stdout + result.stderr, stdout: result.stdout };
}

function coverage(stdout: string) {
  const line = stdout.split('\n').find((entry) => entry.includes('] COVERAGE '));
  expect(line).toBeDefined();
  const payload = line?.split('] COVERAGE ')[1];
  if (!payload) throw new Error('Missing coverage report');
  return JSON.parse(payload) as {
    selected: string[];
    inspected: string[];
    excluded: { path: string; reason: string }[];
    errors: { path: string; reason: string }[];
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Phase 10 scanner CLI', () => {
  const databasePackages = [
    'pg',
    'mysql',
    'mysql2',
    'mssql',
    'mongodb',
    '@prisma/client',
    'typeorm',
    'sequelize',
    'knex'
  ];
  const providerPackages = ['openai', '@anthropic-ai/sdk', '@google/generative-ai', 'cohere-ai'];
  const forms = [
    (name: string) => `import client from '${name}';`,
    (name: string) => `const client = require ( '${name}' );`,
    (name: string) => `const client = import (\n '${name}'\n);`,
    (name: string) => `import '${name}';`,
    (name: string) => `export { client } from '${name}';`
  ];

  it.each(databasePackages)(
    'rejects every existing database package through all literal import forms: %s',
    (name) => {
      for (const form of forms) {
        const result = run(repository({ 'apps/api/client.ts': form(name) }), 'direct-core-db');
        expect(result.status, result.output).toBe(1);
        expect(result.output).toContain('database client dependency');
        expect(result.output).toContain('apps/api/client.ts:');
      }
    }
  );

  it.each(providerPackages)(
    'rejects every existing provider package in neutral runtime: %s',
    (name) => {
      for (const form of forms) {
        const result = run(
          repository({ 'packages/runtime/client.ts': form(name) }),
          'provider-coupling'
        );
        expect(result.status, result.output).toBe(1);
        expect(result.output).toContain('provider SDK dependency outside Model Gateway');
      }
    }
  );

  it('reports actual runtime scope and exclusions without counting eligible docs as inspected', () => {
    const result = run(
      repository({
        'apps/api/safe.ts': 'export const safe = true;',
        'docs/guide.md': 'documentation',
        'docs/baseline/approved.md': 'baseline',
        'assets/image.png': 'unsupported format',
        '.gitignore': 'ignored.txt\n',
        'ignored.txt': 'ignored'
      }),
      'direct-core-db'
    );
    expect(result.status, result.output).toBe(0);
    const report = coverage(result.stdout);
    expect(report.selected).toEqual(['apps/api/safe.ts']);
    expect(report.inspected).toEqual(report.selected);
    expect(report.excluded).toEqual(
      expect.arrayContaining([
        { path: 'docs/guide.md', reason: 'outside gate roots' },
        {
          path: 'docs/baseline/approved.md',
          reason: 'approved baseline excluded by existing policy'
        },
        { path: 'assets/image.png', reason: 'unsupported format' }
      ])
    );
    expect(result.output).not.toContain('ignored.txt"');
    expect(result.output).toContain('1 selected, 1 inspected');
  });

  it('preserves provider-neutral roots and permits the Model Gateway boundary', () => {
    const result = run(
      repository({
        'packages/model-gateway/client.ts': "const client = require('openai');",
        'apps/api/client.ts': "import('openai');",
        'packages/runtime/safe.ts': "import safe from 'safe-sdk';"
      }),
      'provider-coupling'
    );
    expect(result.status, result.output).toBe(0);
    const report = coverage(result.stdout);
    expect(report.inspected).toEqual(['packages/runtime/safe.ts']);
    expect(report.excluded).toContainEqual({
      path: 'packages/model-gateway/client.ts',
      reason: 'outside gate roots'
    });
  });

  it.each([
    'tsx',
    'jsx',
    'mts',
    'cts',
    'ps1',
    'psm1',
    'psd1',
    'sh',
    'bash',
    'zsh',
    'cmd',
    'bat',
    'py',
    'sql',
    'toml',
    'ini',
    'conf',
    'xml',
    'tf',
    'hcl'
  ])('inspects executable/configuration format .%s', (extension) => {
    const result = run(
      repository({ [`infrastructure/probe.${extension}`]: 'postgres://synthetic' }),
      'direct-core-db'
    );
    expect(result.status, result.output).toBe(1);
    expect(coverage(result.stdout).inspected).toEqual([`infrastructure/probe.${extension}`]);
  });

  it.each(['Dockerfile', 'Dockerfile.test', 'probe.dockerfile', 'compose.yaml', '.env.example'])(
    'scans %s for synthetic secret patterns without storing secrets in this repository',
    (filename) => {
      const synthetic = ['AK', 'IA', 'Z'.repeat(16)].join('');
      const result = run(repository({ [filename]: synthetic }), 'secret');
      expect(result.status, result.output).toBe(1);
      expect(result.output).toContain('AWS access key pattern');
      expect(result.output).not.toContain(synthetic);
    }
  );

  it.each(['direct-core-db', 'evaluation-leakage', 'phase11-scope'])(
    'includes runtime Dockerfile in %s while preserving root boundaries',
    (gate) => {
      const violation =
        gate === 'direct-core-db'
          ? 'postgres://synthetic'
          : gate === 'evaluation-leakage'
            ? ['tests', 'evaluation'].join('/')
            : 'shadow_mode';
      const result = run(
        repository({
          'infrastructure/Dockerfile': violation,
          'deployment/Dockerfile': violation,
          Dockerfile: violation
        }),
        gate
      );
      expect(result.status, result.output).toBe(1);
      expect(coverage(result.stdout).selected).toEqual([
        'deployment/Dockerfile',
        'infrastructure/Dockerfile'
      ]);
      expect(coverage(result.stdout).excluded).toContainEqual({
        path: 'Dockerfile',
        reason: 'outside gate roots'
      });
    }
  );

  it.each(['secret', 'direct-core-db', 'provider-coupling', 'evaluation-leakage', 'phase11-scope'])(
    'passes benign fixtures under %s',
    (gate) => {
      const result = run(
        repository({
          'packages/runtime/benign.ts': "import safe from 'safe-sdk';\nconst value = 'ordinary';",
          Dockerfile: 'FROM scratch'
        }),
        gate
      );
      expect(result.status, result.output).toBe(0);
      expect(result.output).toContain('] PASS');
    }
  );

  it('deduplicates staged files that also match discovery', () => {
    const root = repository({ 'apps/api/safe.ts': 'export {};' });
    expect(spawnSync('git', ['add', '.'], { cwd: root, env: environment }).status).toBe(0);
    const result = run(root, 'secret');
    expect(result.status, result.output).toBe(0);
    expect(coverage(result.stdout).inspected).toEqual(['apps/api/safe.ts']);
  });

  it('fails closed when a discovered tracked file cannot be read', () => {
    const root = repository({ 'apps/api/missing.ts': 'export {};' });
    expect(spawnSync('git', ['add', '.'], { cwd: root, env: environment }).status).toBe(0);
    rmSync(join(root, 'apps/api/missing.ts'));
    const result = run(root, 'secret');
    expect(result.status).toBe(2);
    expect(result.output).not.toContain('] PASS');
    expect(coverage(result.stdout).inspected).toEqual([]);
    expect(coverage(result.stdout).errors).toContainEqual({
      path: 'apps/api/missing.ts',
      reason: 'ENOENT'
    });
  });

  it('fails closed for invalid UTF-8 rather than silently replacing unreadable bytes', () => {
    const root = repository({ 'apps/api/invalid.ts': '' });
    writeFileSync(join(root, 'apps/api/invalid.ts'), Buffer.from([0xff]));
    const result = run(root, 'secret');
    expect(result.status).toBe(2);
    expect(result.output).not.toContain('] PASS');
    expect(coverage(result.stdout).inspected).toEqual([]);
  });

  it('does not PASS when Git discovery fails', () => {
    const root = repository({});
    rmSync(join(root, '.git'), { recursive: true });
    const result = run(root, 'secret');
    expect(result.status).toBe(2);
    expect(result.output).not.toContain('] PASS');
    expect(result.output).toContain('discovery failed');
  });
});
