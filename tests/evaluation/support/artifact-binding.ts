import { z } from 'zod';

const gitObject = z
  .string()
  .regex(/^[a-f0-9]{40}$/)
  .refine((s) => !/^0+$/.test(s));
const sha256 = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .refine((s) => !/^0+$/.test(s));
// A conservative portable path vocabulary: no normalization or alias resolution.
const path = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) =>
    value
      .split('/')
      .every(
        (part) =>
          /^[A-Za-z0-9._-]+$/.test(part) &&
          part !== '.' &&
          part !== '..' &&
          !part.endsWith('.') &&
          part.toLowerCase() !== '.git' &&
          !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)
      )
  );
const identitySchema = z
  .object({
    repository: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/)
      .max(256),
    candidate_head: gitObject,
    candidate_base: gitObject,
    evaluated_commit: gitObject,
    ordered_parents: z.array(gitObject).max(64),
    source_tree: gitObject,
    inputs: z
      .array(
        z
          .object({
            path,
            mode: z.enum(['100644', '100755']),
            git_blob: gitObject,
            sha256
          })
          .strict()
      )
      .min(1)
      .max(10_000)
  })
  .strict()
  .superRefine((value, context) => {
    const paths = value.inputs.map((input) => input.path.toLowerCase());
    if (new Set(paths).size !== paths.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Duplicate or case-ambiguous paths'
      });
    }
    const ordered = [...paths].sort();
    if (ordered.some((p, i) => ordered.slice(i + 1).some((other) => other.startsWith(p + '/')))) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'File/directory path collision' });
    }
    if (
      new Set(value.ordered_parents).size !== value.ordered_parents.length ||
      value.ordered_parents.includes(value.evaluated_commit)
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate or self parent' });
    }
  });
export type ArtifactIdentity = z.infer<typeof identitySchema>;

export interface ArtifactBindingAssessment {
  readonly binding_status: 'MATCH' | 'MISMATCH' | 'UNVERIFIED';
  readonly authority_status: 'not-established';
  readonly diagnostics: readonly string[];
}

// Pure comparison of separately supplied claims, not measurement or authentication.
// The caller must obtain expected/observed identities independently. Even identical
// candidate-selected expectations establish no authority, admission or release permission.
// No bytes are read or hashed here: matching digest claims do not prove their provenance,
// their consistency with Git objects, or completeness beyond the supplied finite set.
export function compareArtifactBinding(
  expected?: unknown,
  observed?: unknown
): ArtifactBindingAssessment {
  const diagnostics: string[] = [];
  const finish = (
    binding_status: ArtifactBindingAssessment['binding_status']
  ): ArtifactBindingAssessment => ({
    binding_status,
    authority_status: 'not-established',
    diagnostics
  });
  const read = (input: unknown, side: string): ArtifactIdentity | undefined => {
    if (input === undefined || input === null) {
      diagnostics.push(`${side}_ABSENT`);
      return undefined;
    }
    try {
      const parsed = identitySchema.safeParse(input);
      if (parsed.success) return parsed.data;
    } catch {
      // Malformed runtime values (including throwing accessors/proxies) fail closed.
    }
    diagnostics.push(`${side}_MALFORMED`);
    return undefined;
  };
  const wanted = read(expected, 'EXPECTED');
  const actual = read(observed, 'OBSERVED');
  if (diagnostics.some((d) => d.endsWith('_MALFORMED'))) return finish('MISMATCH');
  if (!wanted || !actual) return finish('UNVERIFIED');
  for (const field of [
    'repository',
    'candidate_head',
    'candidate_base',
    'evaluated_commit',
    'source_tree'
  ] as const) {
    if (wanted[field] !== actual[field]) diagnostics.push(`${field.toUpperCase()}_MISMATCH`);
  }
  if (
    wanted.ordered_parents.length !== actual.ordered_parents.length ||
    wanted.ordered_parents.some((parent, i) => parent !== actual.ordered_parents[i])
  ) {
    diagnostics.push('ORDERED_PARENTS_MISMATCH');
  }
  const actualInputs = new Map(actual.inputs.map((input) => [input.path, input]));
  const expectedPaths = new Set(wanted.inputs.map((input) => input.path));
  if (actual.inputs.some((input) => !expectedPaths.has(input.path)))
    diagnostics.push('EXTRA_INPUTS');
  for (const input of wanted.inputs) {
    const found = actualInputs.get(input.path);
    if (!found) {
      diagnostics.push('MISSING_INPUT');
      continue;
    }
    for (const field of ['mode', 'git_blob', 'sha256'] as const) {
      if (input[field] !== found[field]) diagnostics.push(`INPUT_${field.toUpperCase()}_MISMATCH`);
    }
  }
  return finish(diagnostics.length ? 'MISMATCH' : 'MATCH');
}
