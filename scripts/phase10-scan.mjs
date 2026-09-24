import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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

const tracked = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
  encoding: 'utf8'
})
  .split('\0')
  .filter(Boolean);
const textExtensions = new Set([
  '.ts',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.yml',
  '.yaml',
  '.md',
  '.env',
  '.example'
]);
const extension = (path) => {
  const dot = path.lastIndexOf('.');
  return dot < 0 ? '' : path.slice(dot);
};
const readable = tracked.filter(
  (path) => textExtensions.has(extension(path)) && !path.startsWith('docs/baseline/')
);
const runtime = readable.filter((path) =>
  ['apps/', 'agents/', 'packages/', 'infrastructure/'].some((prefix) => path.startsWith(prefix))
);
const findings = [];

function scan(paths, rules) {
  for (const path of paths) {
    const content = readFileSync(path, 'utf8');
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
  }
}

if (gate === 'secret') {
  scan(readable, [
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
  scan(runtime, [
    {
      pattern:
        /from\s+['"](?:pg|mysql2?|mssql|mongodb|@prisma\/client|typeorm|sequelize|knex)['"]/gi,
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
  const providerNeutralRoots = runtime.filter(
    (path) =>
      path.startsWith('agents/') ||
      path.startsWith('packages/pilot-agents/') ||
      path.startsWith('packages/runtime/')
  );
  scan(providerNeutralRoots, [
    {
      pattern: /from\s+['"](?:openai|@anthropic-ai\/sdk|@google\/generative-ai|cohere-ai)['"]/gi,
      message: 'provider SDK dependency outside Model Gateway'
    },
    {
      pattern: /\b(?:OpenAI|Anthropic|Gemini|Cohere)\s*\(/g,
      message: 'provider-specific runtime construction'
    }
  ]);
}

if (gate === 'evaluation-leakage') {
  scan(runtime, [
    { pattern: /tests[\\/]evaluation/gi, message: 'runtime import of evaluation tree' },
    {
      pattern:
        /\b(?:GEN|MNT|AST|WH)-(?:SCOPE|ROUTE|TENANT|PERM|RAG|TOOL|PARAM|CITE|ABSTAIN|INJECT|ACTION)-001\b/g,
      message: 'golden case identifier in runtime source'
    }
  ]);
}

if (gate === 'phase11-scope') {
  scan(runtime, [
    { pattern: /\bshadow[_ -]?mode\b/gi, message: 'Shadow Mode capability' },
    { pattern: /\bcontrolled[_ -]?pilot\b/gi, message: 'Controlled Pilot capability' },
    {
      pattern: /\bproduction[_ -]?(?:readiness|promotion)\b/gi,
      message: 'later-phase production capability'
    }
  ]);
}

if (findings.length > 0) {
  console.error(`[phase10:${gate}] FAIL`);
  for (const finding of findings) console.error(finding);
  process.exit(1);
}
console.log(
  `[phase10:${gate}] PASS (${gate === 'provider-coupling' ? 'provider-neutral boundaries' : `${readable.length} repository text files inspected`})`
);
