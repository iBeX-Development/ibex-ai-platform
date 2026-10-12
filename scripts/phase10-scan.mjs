import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';

const gate = process.argv[2];
const supported = new Set([
  'secret',
  'direct-core-db',
  'provider-coupling',
  'evaluation-leakage',
  'phase11-scope'
]);
if (!gate || !supported.has(gate)) {
  console.error(`Usage: node scripts/phase10-scan.mjs <${[...supported].join('|')}>`);
  process.exit(2);
}

const runtimeRoots = ['apps/', 'agents/', 'packages/', 'infrastructure/', 'deployment/'];
const providerNeutralRoots = ['agents/', 'packages/pilot-agents/', 'packages/runtime/'];
const roots =
  gate === 'secret' ? [] : gate === 'provider-coupling' ? providerNeutralRoots : runtimeRoots;
const report = {
  gate,
  scope: gate === 'secret' ? 'repository source/configuration text' : roots,
  discovery: 'Git tracked and untracked non-ignored files; deduplicated, repository-relative',
  exclusions: [
    'docs/baseline/ (existing approved-baseline policy)',
    'unsupported formats',
    ...(gate === 'secret' ? [] : ['paths outside gate roots']),
    'Git-ignored untracked paths are not discovered or individually enumerated'
  ],
  selected: [],
  inspected: [],
  excluded: [],
  errors: []
};
let repositoryRoot;
let tracked;
try {
  repositoryRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  tracked = [
    ...new Set(
      execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      })
        .split('\0')
        .filter(Boolean)
    )
  ].sort();
} catch {
  report.errors.push({ path: '.', reason: 'Git discovery failed' });
  console.log(`[phase10:${gate}] COVERAGE ${JSON.stringify(report)}`);
  console.error(`[phase10:${gate}] ERROR: discovery failed; no PASS`);
  process.exit(2);
}
const textExtensions = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.yml',
  '.yaml',
  '.md',
  '.env',
  '.example',
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
  '.psm1',
  '.psd1',
  '.cmd',
  '.bat',
  '.py',
  '.sql',
  '.toml',
  '.ini',
  '.conf',
  '.config',
  '.xml',
  '.properties',
  '.tf',
  '.tfvars',
  '.hcl',
  '.dockerfile',
  '.txt'
]);
function supportedFormat(path) {
  const name = basename(path).toLowerCase();
  return (
    textExtensions.has(extname(name)) ||
    /^dockerfile(?:\..+)?$/.test(name) ||
    /^\.env(?:\..+)?$/.test(name) ||
    ['.gitignore', '.dockerignore', '.prettierignore', '.npmrc', '.yarnrc'].includes(name)
  );
}
report.formats = [...textExtensions].sort();
report.namedFormats = [
  'Dockerfile[.*]',
  '.env[.*]',
  '.gitignore',
  '.dockerignore',
  '.prettierignore',
  '.npmrc',
  '.yarnrc'
];
for (const path of tracked) {
  const reason = path.startsWith('docs/baseline/')
    ? 'approved baseline excluded by existing policy'
    : !supportedFormat(path)
      ? 'unsupported format'
      : roots.length && !roots.some((root) => path.startsWith(root))
        ? 'outside gate roots'
        : undefined;
  if (reason) report.excluded.push({ path, reason });
  else report.selected.push(path);
}
const findings = [];

// Static literal syntax only: ESM imports/re-exports, CommonJS require and import().
// This intentionally remains a conservative text scan, not a JavaScript resolver.
function dependencyPattern(packages) {
  return new RegExp(
    `(?:\\bfrom\\s*|\\bimport\\s*|\\b(?:require|import)\\s*\\(\\s*)['"](?:${packages})['"]`,
    'gi'
  );
}

function scan(paths, rules) {
  for (const path of paths) {
    let content;
    try {
      const absolute = resolve(repositoryRoot, path);
      if (!lstatSync(absolute).isFile())
        throw Object.assign(new Error(), { code: 'NOT_REGULAR_FILE' });
      content = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(absolute));
    } catch (error) {
      report.errors.push({ path, reason: error.code ?? 'READ_ERROR' });
      continue;
    }
    for (const rule of rules) {
      const matches = content.matchAll(
        new RegExp(
          rule.pattern.source,
          rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`
        )
      );
      for (const match of matches) {
        const line = content.slice(0, match.index).split('\n').length;
        findings.push(`${path}:${line}: ${rule.message}`);
      }
    }
    report.inspected.push(path);
  }
}

if (gate === 'secret') {
  scan(report.selected, [
    {
      pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
      message: 'private key material'
    },
    { pattern: /\bAKIA[0-9A-Z]{16}\b/g, message: 'AWS access key pattern' },
    { pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, message: 'GitHub token pattern' },
    { pattern: /\bsk-[A-Za-z0-9_-]{24,}\b/g, message: 'provider API key pattern' }
  ]);
}

if (gate === 'direct-core-db') {
  scan(report.selected, [
    {
      pattern: dependencyPattern('pg|mysql2?|mssql|mongodb|@prisma/client|typeorm|sequelize|knex'),
      message: 'database client dependency'
    },
    {
      pattern: /\b(?:postgres|mysql|mongodb|sqlserver):\/\//gi,
      message: 'database connection URI'
    },
    {
      pattern: /\b(?:SELECT|INSERT|UPDATE|DELETE)\s+.+\s+(?:FROM|INTO|SET)\s+core_/gi,
      message: 'direct Core SQL access'
    }
  ]);
}

if (gate === 'provider-coupling') {
  scan(report.selected, [
    {
      pattern: dependencyPattern('openai|@anthropic-ai/sdk|@google/generative-ai|cohere-ai'),
      message: 'provider SDK dependency outside Model Gateway'
    },
    {
      pattern: /\b(?:OpenAI|Anthropic|Gemini|Cohere)\s*\(/g,
      message: 'provider-specific runtime construction'
    }
  ]);
}

if (gate === 'evaluation-leakage') {
  scan(report.selected, [
    { pattern: /tests[\\/]evaluation/gi, message: 'runtime import of evaluation tree' },
    {
      pattern:
        /\b(?:GEN|MNT|AST|WH)-(?:SCOPE|ROUTE|TENANT|PERM|RAG|TOOL|PARAM|CITE|ABSTAIN|INJECT|ACTION)-001\b/g,
      message: 'golden case identifier in runtime source'
    }
  ]);
}

if (gate === 'phase11-scope') {
  scan(report.selected, [
    { pattern: /\bshadow[_ -]?mode\b/gi, message: 'Shadow Mode capability' },
    { pattern: /\bcontrolled[_ -]?pilot\b/gi, message: 'Controlled Pilot capability' },
    {
      pattern: /\bproduction[_ -]?(?:readiness|promotion)\b/gi,
      message: 'later-phase production capability'
    }
  ]);
}

console.log(`[phase10:${gate}] COVERAGE ${JSON.stringify(report)}`);
if (report.errors.length > 0) {
  console.error(
    `[phase10:${gate}] ERROR (${report.selected.length} selected, ${report.inspected.length} inspected)`
  );
  for (const error of report.errors) console.error(`${error.path}: ${error.reason}`);
  for (const finding of findings) console.error(finding);
  process.exit(2);
}
if (findings.length > 0) {
  console.error(`[phase10:${gate}] FAIL`);
  for (const finding of findings) console.error(finding);
  process.exit(1);
}
console.log(
  `[phase10:${gate}] PASS (${report.selected.length} selected, ${report.inspected.length} inspected, ${report.excluded.length} excluded discovered files)`
);
