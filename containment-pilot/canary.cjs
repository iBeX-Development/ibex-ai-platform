'use strict';
// Direct fixed-protocol fd I/O. The external host watchdog bounds blocking calls;
// JS timers do not interrupt readSync/writeSync or native bootstrap failures.
let fs, assert, net, dgram, spawn;
let diagnosticStage = 'ENTRY';
let reportingFailure = false;
function writeFixed(fd, text) {
  const bytes = Buffer.from(text, 'ascii');
  if ((fd !== 1 && fd !== 2) || bytes.length > 128) throw new Error('protocol');
  let offset = 0, transient = 0;
  for (let calls = 0; calls < 32 && offset < bytes.length; calls++) {
    let count;
    try { count = fs.writeSync(fd, bytes, offset, bytes.length - offset, null); }
    catch (error) {
      if ((error.code === 'EINTR' || error.code === 'EAGAIN') && ++transient <= 8) continue;
      throw error;
    }
    if (!Number.isInteger(count) || count <= 0 || count > bytes.length - offset) throw new Error('write_progress');
    offset += count;
  }
  if (offset !== bytes.length) throw new Error('write_budget');
}
function reportFailure(error) {
  if (reportingFailure) process.exit(22);
  reportingFailure = true;
  try {
    const value = error && error.errno;
    const errno = Number.isInteger(value) && Math.abs(value) <= 4095 ? value : 0;
    const kind = error && error.code === 'ERR_ASSERTION' ? 'ASSERT' : errno ? 'OS' : 'OTHER';
    if (fs) writeFixed(2, 'CANARY_FAIL ' + diagnosticStage + ' ' + errno + ' ' + kind + '\n');
  } catch (_) { /* Diagnostic failure is nonzero, never a raw stack or success. */ }
  process.exit(22);
}
function readGo() {
  const bytes = Buffer.alloc(4); let offset = 0, transient = 0;
  for (let calls = 0; calls < 32; calls++) {
    let count;
    try { count = fs.readSync(0, bytes, offset, 4 - offset, null); }
    catch (error) {
      if ((error.code === 'EINTR' || error.code === 'EAGAIN') && ++transient <= 8) continue;
      throw error;
    }
    if (!Number.isInteger(count) || count < 0 || count > 4 - offset) throw new Error('read_count');
    if (count === 0) {
      if (offset === 3 && bytes[0] === 71 && bytes[1] === 79 && bytes[2] === 10) return;
      throw new Error('go_eof');
    }
    offset += count;
    if (offset > 3 || bytes[0] !== 71 || (offset > 1 && bytes[1] !== 79) || (offset > 2 && bytes[2] !== 10)) throw new Error('go_bytes');
  }
  throw new Error('read_budget');
}
// Install controlled failure handling before other module setup. Native loader or
// fs-module failure may still lack a diagnostic; never infer success from silence.
try {
  fs = require('node:fs');
  process.on('uncaughtException', reportFailure);
  process.on('unhandledRejection', reportFailure);
  assert = require('node:assert/strict'); net = require('node:net');
  dgram = require('node:dgram'); ({ spawn } = require('node:child_process'));
  if (process.argv[2] === 'descendant') {
    diagnosticStage = 'DESCENDANT';
    setInterval(() => {}, 1000);
  } else {
    readGo();
    run().catch(reportFailure);
  }
} catch (error) { reportFailure(error); }

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
  const child = spawn(process.execPath, [__filename, 'descendant'], { stdio: ['ignore', 1, 2], env: process.env });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
  writeFixed(1, 'SYNTHETIC_OK\n');
  // Leave an owned descendant; host must observe and remove it before acceptance.
  setInterval(() => {}, 1000);
}
