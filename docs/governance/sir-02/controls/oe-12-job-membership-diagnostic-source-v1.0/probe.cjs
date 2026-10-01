'use strict';

const fs = require('node:fs');

const [token, readyPath, releasePath] = process.argv.slice(2);
if (
  typeof token !== 'string' ||
  !/^SIR02-OE12-JOB-MEMBERSHIP-DIAGNOSTIC-\d{8}T\d{9}Z$/.test(token) ||
  !readyPath ||
  !releasePath
) {
  process.exit(31);
}

// This probe never spawns a descendant and never calls a network API.
fs.writeFileSync(
  readyPath,
  JSON.stringify({ pid: process.pid, token, role: 'synthetic-node-parent', startedUtc: new Date().toISOString() }),
  { encoding: 'utf8', flag: 'wx' },
);

const poll = setInterval(() => {
  if (fs.existsSync(releasePath)) {
    clearInterval(poll);
    clearTimeout(naturalExit);
    process.exit(0);
  }
}, 50);

// Independent finite exit if the launcher cannot deliver its cooperative signal.
const naturalExit = setTimeout(() => {
  clearInterval(poll);
  process.exit(0);
}, 10000);
