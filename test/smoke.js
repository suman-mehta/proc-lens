import assert from 'node:assert/strict';
import { ProcLensEngine, renderProgressBar, formatBytes, truncate } from '../src/core.js';

console.log('Running ProcLens smoke test suite...');

// 1. Instantiation and system stats
const engine = new ProcLensEngine();
const initialCpu = engine.readSystemCpu();
assert.ok(typeof initialCpu.total === 'number' && initialCpu.total >= 0, 'CPU total should be numeric');
assert.ok(typeof initialCpu.active === 'number' && initialCpu.active >= 0, 'CPU active should be numeric');

// 2. Memory stats
const mem = engine.readSystemMem();
assert.ok(mem.total > 0, 'Total memory should be positive');
assert.ok(mem.used >= 0, 'Used memory should be non-negative');
assert.ok(mem.available >= 0, 'Available memory should be non-negative');

// 3. /proc/[pid]/stat line parser
const mockStat = '14209 (node worker) S 1200 14209 1200 0 -1 4194304 314 0 0 0 125 45 0 0 20 0 16 0 1203912 209715200 51200 18446744073709551615';
const parsed = ProcLensEngine.parseProcessStat(mockStat);
assert.equal(parsed.pid, 14209);
assert.equal(parsed.comm, 'node worker');
assert.equal(parsed.state, 'S');
assert.equal(parsed.ppid, 1200);
assert.equal(parsed.cpuTicks, 170); // 125 + 45
assert.equal(parsed.numThreads, 16);
assert.equal(parsed.rssBytes, 51200 * 4 * 1024);

// 4. Test formatters
const bar = renderProgressBar(50, 10);
assert.equal(bar, '[|||||.....]');

assert.equal(formatBytes(1073741824), '1.00 GB');
assert.equal(formatBytes(1048576), '1.00 MB');
assert.equal(truncate('hello-world-string', 8), 'hello-w…');

// 5. Complete collection snapshot
const telemetry = engine.collect(5, 'cpu');
assert.ok(telemetry.cores > 0, 'Core count must be detected');
assert.ok(Array.isArray(telemetry.processes), 'Processes list must be an array');
assert.ok(telemetry.processes.length <= 5, 'Processes list should respect limit');
assert.ok(typeof telemetry.cpuPercent === 'number', 'cpuPercent must be numeric');

console.log('✓ Smoke tests passed successfully.');
