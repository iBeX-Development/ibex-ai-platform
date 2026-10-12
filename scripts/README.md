# Scripts

Repository automation belongs here when it cannot be expressed as a package script. Phase 0 quality gates are currently exposed through `pnpm validate`.

## Phase 10 static scanners

Run `node scripts/phase10-scan.mjs <gate>` or the corresponding `pnpm scan:*` command. These are conservative static text checks, not execution evidence, deployed-control verification, or a full security analysis.

### Discovery, formats and scope

Discovery runs from the Git repository root, even when invoked in a subdirectory. It includes tracked files (including tracked files matched by ignore rules) and untracked non-ignored files. Paths are deduplicated and sorted. Git-ignored untracked paths are not discovered or individually enumerated. Existing `docs/baseline/` exclusions remain explicit; these approved documents are not scanned. No other directory exclusion has been added.

The inventory at base `e79f1d96a16a83081fbca9991d4021d1483508da` contained TypeScript, Markdown, JSON, YAML, JavaScript modules, `.env.example`, ignore configuration and the extensionless `deployment/Dockerfile`. The original format list missed that Dockerfile and ignore configuration. Source variants and executable/configuration formats also needed coverage before future additions could be silently omitted.

Supported formats now include:

- JavaScript/TypeScript: `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`.
- Shell, PowerShell, Windows command and Python: `.sh`, `.bash`, `.zsh`, `.ps1`, `.psm1`, `.psd1`, `.cmd`, `.bat`, `.py`.
- Configuration/text: `.json`, `.yml`, `.yaml`, `.md`, `.env`, `.example`, `.sql`, `.toml`, `.ini`, `.conf`, `.config`, `.xml`, `.properties`, `.tf`, `.tfvars`, `.hcl`, `.dockerfile`, `.txt`.
- Named files, case insensitive: `Dockerfile`, `Dockerfile.*`, `.env`, `.env.*`, `.gitignore`, `.dockerignore`, `.prettierignore`, `.npmrc`, `.yarnrc`.

| Gate                 | Selected scope                                                    | Policy                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `secret`             | All supported discovered text outside the approved baseline       | Existing private-key, AWS, GitHub and provider-key patterns; matched values are never printed.                                            |
| `direct-core-db`     | `apps/`, `agents/`, `packages/`, `infrastructure/`, `deployment/` | Existing prohibited database packages, connection URI and direct Core SQL patterns.                                                       |
| `provider-coupling`  | `agents/`, `packages/pilot-agents/`, `packages/runtime/`          | Existing prohibited provider SDKs and provider construction patterns. Model Gateway and other non-neutral roots remain outside this gate. |
| `evaluation-leakage` | Same runtime/deployment roots as `direct-core-db`                 | Existing evaluation-tree references and golden identifiers.                                                                               |
| `phase11-scope`      | Same runtime/deployment roots as `direct-core-db`                 | Existing Shadow, Controlled Pilot and later-phase production capability patterns.                                                         |

`deployment/` is included in the runtime/configuration gates so the actual deployment Dockerfile is checked; provider-neutral roots are unchanged. Root-level Dockerfiles and CI/scripts/tests are still outside runtime-only gates, but supported files there remain subject to the repository-wide secret gate. Unsupported formats are individually reported, not claimed as inspected.

### Coverage and failure reporting

Each gate emits a `[phase10:<gate>] COVERAGE` JSON record with its scope, discovery/exclusion policy, supported formats, exact `selected` and successfully `inspected` paths, excluded discovered paths with reasons, and read/discovery errors. The final PASS counts are gate-specific. A readable file with a rule violation is still inspected; a missing/unreadable/non-regular file or invalid UTF-8 is not. Findings contain path, line and rule, without matched secret content.

- Exit `0`: selected files were inspected and no rule matched. Zero selected files is reported as zero; it is not a claim of repository-wide coverage.
- Exit `1`: policy violation(s).
- Exit `2`: invalid CLI gate, Git discovery failure, or incomplete inspection. Errors cannot produce PASS; successfully inspected independent files and any findings are retained in the report.

Database/provider dependency rules recognize existing ESM `from` imports/re-exports, side-effect imports, CommonJS `require(...)`, and literal dynamic `import(...)`, including ordinary whitespace/newlines. The prohibited package lists remain unchanged.

### Regression tests and limits

`pnpm exec vitest run tests/unit/phase10-scanner.test.ts` invokes the original scanner CLI in temporary Git repositories outside the checkout. It checks prohibited packages/import forms, benign controls, format and Dockerfile selection, accurate exclusions/counts, staged-file deduplication, and fail-closed discovery/read/encoding behavior. Synthetic secret patterns are assembled only in temporary fixtures, never stored as complete values in repository source. Fixtures are removed after each test.

These regex rules do not resolve computed module names, aliases, package subpaths, dependency manifests or transitive dependencies, parse all language syntax, or interpret Docker/shell execution. Comments and string literals can conservatively match. Arbitrary extensionless scripts, unsupported/binary formats, Git-ignored untracked files and the approved baseline are not covered. Dependency audit remains a separate gate. Container image/runtime pinning remains unresolved F12 work; scanner PASS grants no OE/R&D, deployment, Shadow or governance authorization.
