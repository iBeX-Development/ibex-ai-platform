import { runPhase10Command } from '../tests/evaluation/support/phase10-assessment.js';

// This command selects only the engineering exit status; release stays visibly BLOCKED.
process.exitCode = await runPhase10Command('engineering');
