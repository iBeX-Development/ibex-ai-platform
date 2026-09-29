// R&D ONLY / NOT AUTHORIZED FOR EXECUTION. This gate is not governance authorization.
import { readFile } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { sha256, sameString } from './protocol.mjs';

export function argumentsByName(argv) {
  const result = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--') || argv[i + 1] === undefined || result.has(argv[i]))
      throw new Error('STOP — Execution Authorization Inputs Invalid');
    result.set(argv[i], argv[i + 1]);
  }
  return result;
}
export async function executionGate(argv) {
  const a = argumentsByName(argv);
  const required = ['--mode', '--run-id', '--run-token', '--generation-id', '--case',
    '--config', '--manifest', '--manifest-sha256', '--execution-authorization', '--execution-authorization-sha256'];
  if (required.some((key) => !a.get(key)) || a.get('--mode') !== 'authorized-worker-host-rd')
    throw new Error('STOP — Execution Authorization Inputs Invalid');
  const manifestPath = resolve(a.get('--manifest'));
  const configPath = resolve(a.get('--config'));
  const authPath = resolve(a.get('--execution-authorization'));
  const manifestBytes = await readFile(manifestPath);
  if (!sameString(sha256(manifestBytes), a.get('--manifest-sha256')))
    throw new Error('STOP — Execution Authorization Inputs Invalid: manifest identity');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const base = dirname(manifestPath);
  for (const item of manifest.files) {
    const file = resolve(base, item.path);
    const rel = relative(base, file);
    if (rel.startsWith('..') || isAbsolute(rel) || !sameString(sha256(await readFile(file)), item.sha256))
      throw new Error('STOP — reviewed/runnable bytes mismatch');
  }
  const configBytes = await readFile(configPath);
  if (!sameString(sha256(configBytes), manifest.files.find((x) => resolve(base, x.path) === configPath)?.sha256))
    throw new Error('STOP — approved configuration identity mismatch');
  const config = JSON.parse(configBytes.toString('utf8'));
  const authBytes = await readFile(authPath);
  if (!sameString(sha256(authBytes), a.get('--execution-authorization-sha256')))
    throw new Error('STOP — Execution Authorization Inputs Invalid: decision bytes');
  const auth = JSON.parse(authBytes.toString('utf8'));
  if (auth.status !== 'Authorized for One Worker-Host R&D Execution' ||
      auth.manifestSha256 !== a.get('--manifest-sha256') ||
      auth.runId !== a.get('--run-id') || auth.generationId !== a.get('--generation-id') ||
      auth.runTokenSha256 !== sha256(a.get('--run-token')) ||
      !auth.cases?.includes(a.get('--case')))
    throw new Error('STOP — Execution Authorization Inputs Invalid: scope');
  if (config.readiness.startsWith('STOP') || config.safeDisposalCapability !== 'PROVEN_FOR_REVIEWED_SOURCE' ||
      config.completeMembershipCapability !== 'PROVEN_FOR_REVIEWED_SOURCE')
    throw new Error('STOP — Safe Hang-Path Disposal / Membership Unproven');
  if (process.platform !== config.environment.platform || process.arch !== config.environment.architecture ||
      process.execPath !== config.environment.nodeExecutable ||
      config.environment.powershellExecutable.includes('MUST VERIFY'))
    throw new Error('STOP — execution environment not verified');
  if (!config.cases.includes(a.get('--case'))) throw new Error('STOP — unreviewed WH case');
  return { a, config, auth, manifestPath, configPath, authPath };
}
