'use strict';
// Synthetic only. Host admission supplies GO after verifying the live cgroup.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const net = require('node:net');
const dgram = require('node:dgram');
const { spawn } = require('node:child_process');

let diagnosticStage = 'ENTRY';
function reportFailure(error) {
  const errno = Number.isInteger(error?.errno) && Math.abs(error.errno) <= 4095 ? error.errno : 0;
  const kind = error?.code === 'ERR_ASSERTION' ? 'ASSERT' : errno ? 'OS' : 'OTHER';
  process.stderr.write('CANARY_FAIL ' + diagnosticStage + ' ' + errno + ' ' + kind + '\n');
  process.exitCode = 22;
  setImmediate(() => process.exit(22));
}

if (process.argv[2] === 'descendant') {
  setInterval(() => {}, 1000);
} else {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    input += chunk;
    if (input.length > 16) process.exit(21);
    if (input === 'GO\n') {
      process.stdin.removeAllListeners('data');
      run().catch(reportFailure);
    }
  });
  setTimeout(() => process.exit(23), 60000).unref();
}

function deniedSocket(kind) {
  return new Promise((resolve, reject) => {
    let socket;
    const timer = setTimeout(() => { socket?.destroy?.(); reject(new Error('timeout')); }, 1500);
    const fail = error => {
      clearTimeout(timer);
      socket?.destroy?.();
      if (error.code === 'EPERM' || error.code === 'EACCES') resolve();
      else reject(new Error('unexpected denial category'));
    };
    try {
      if (kind === 'udp') {
        socket = dgram.createSocket('udp4');
        socket.once('error', error => { try { socket.close(); } catch {} fail(error); });
        socket.bind(0, '127.0.0.1', () => { socket.close(); clearTimeout(timer); reject(new Error('allowed')); });
      } else {
        socket = net.createConnection(kind === 'unix'
          ? { path: '/scratch/nonexistent.sock' }
          : { host: kind === 'ipv6' ? '::1' : '127.0.0.1', port: 9 });
        socket.once('error', fail);
        socket.once('connect', () => { socket.destroy(); clearTimeout(timer); reject(new Error('allowed')); });
      }
    } catch (error) { fail(error); }
  });
}

async function run() {
  diagnosticStage = 'IDENTITY';
  assert.equal(process.getuid(), 1000);
  assert.equal(process.version, 'v22.23.3');
  assert.equal(fs.readFileSync('/proc/self/status', 'utf8').match(/^NoNewPrivs:\s*(\d+)/m)[1], '1');
  assert.equal(fs.readFileSync('/proc/self/status', 'utf8').match(/^Seccomp:\s*(\d+)/m)[1], '2');
  assert.equal(fs.readFileSync('/proc/self/status', 'utf8').match(/^CapEff:\s*(\w+)/m)[1], '0000000000000000');
  assert.deepEqual(Object.keys(process.env).sort(), ['HOME', 'LANG', 'PATH', 'TMPDIR', 'TZ'].sort());
  // Exact destination policy; reject duplicate/unknown mounts, including read-only extras.
  diagnosticStage = 'MOUNTS';
  const policy = JSON.parse(fs.readFileSync('/pilot/mount-policy.json', 'utf8'));
  const seen = new Set();
  for (const line of fs.readFileSync('/proc/self/mountinfo', 'utf8').trim().split('\n')) {
    const [left, right] = line.split(' - '), fields = left.split(' ');
    const [type, source, superFlags] = right.split(' '), destination = fields[4];
    const rule = policy.entries[destination];
    assert.ok(rule && !seen.has(destination), 'unplanned mount'); seen.add(destination);
    const flags = fields[5].split(',');
    assert.ok(rule.types.includes(type));
    if (rule.source) assert.ok(rule.source.includes(source));
    assert.equal(flags.includes('rw'), rule.writable);
    for (const flag of rule.required) assert.ok(flags.includes(flag));
    for (const flag of rule.forbidden || []) assert.ok(!flags.includes(flag));
    if (rule.directory) {
      const stat = fs.lstatSync(destination);
      assert.ok(stat.isDirectory());
      assert.equal(stat.uid, rule.directory.uid); assert.equal(stat.gid, rule.directory.gid);
      assert.equal(stat.mode & 0o7777, rule.directory.mode);
    }
    for (const flag of flags) assert.ok(['rw','ro','nosuid','nodev','noexec','relatime','noatime','strictatime'].includes(flag));
    for (const flag of rule.superRequired || []) assert.ok(superFlags.split(',').includes(flag));
    if (rule.bytes) {
      const stat = fs.statfsSync(destination);
      assert.equal(stat.bsize * stat.blocks, rule.bytes);
      if (rule.inodes) assert.equal(stat.files, rule.inodes);
      assert.ok(Number.isSafeInteger(stat.files) && stat.files > 0);
    }
    if (rule.deviceAlias) {
      const stat = fs.statSync(destination), nullStat = fs.statSync('/dev/null');
      assert.ok(stat.isCharacterDevice()); assert.equal(stat.rdev, nullStat.rdev);
    }
  }
  for (const destination of policy.requiredDestinations) assert.ok(seen.has(destination));
  // Runtime-managed device identity and permissions; no host device is added.
  diagnosticStage = 'DEVICES';
  const nullStat = fs.lstatSync('/dev/null');
  assert.ok(nullStat.isCharacterDevice());
  assert.equal(nullStat.uid, 0); assert.equal(nullStat.gid, 0);
  assert.equal(nullStat.mode & 0o7777, 0o666); assert.equal(nullStat.rdev, 259); // Linux makedev(1,3)
  const nullFd = fs.openSync('/dev/null', 'r+'); fs.closeSync(nullFd);
  assert.equal(fs.realpathSync('/dev/ptmx'), '/dev/pts/ptmx');
  const ptmx = fs.statSync('/dev/pts/ptmx');
  assert.ok(ptmx.isCharacterDevice()); assert.equal(ptmx.mode & 0o7777, 0o666);
  diagnosticStage = 'READONLY';
  assert.throws(() => fs.writeFileSync('/pilot/forbidden', 'x'), e => ['EROFS', 'EACCES'].includes(e.code));
  assert.throws(() => fs.writeFileSync('/etc/hosts', 'x'), e => ['EROFS', 'EACCES'].includes(e.code));
  diagnosticStage = 'SCRATCH';
  fs.writeFileSync('/scratch/control', 'synthetic');
  assert.equal(fs.readFileSync('/scratch/control', 'utf8'), 'synthetic');
  fs.unlinkSync('/scratch/control');
  // No external destination; seccomp must reject before socket creation, even loopback.
  diagnosticStage = 'NETWORK';
  for (const kind of ['ipv4', 'ipv6', 'unix', 'udp']) await deniedSocket(kind);
  diagnosticStage = 'DESCENDANT';
  const child = spawn(process.execPath, [__filename, 'descendant'], { stdio: 'ignore', env: process.env });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
  process.stdout.write('SYNTHETIC_OK\n');
  // Leave an owned descendant; host must observe and remove it before acceptance.
  setInterval(() => {}, 1000);
}
