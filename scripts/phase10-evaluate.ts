import { runPhase10Command } from '../tests/evaluation/support/phase10-assessment.js';

// Release remains fail-closed. Arguments cannot select engineering or an authority.
process.exitCode = await runPhase10Command('release', process.argv.includes('--write-evidence'));
