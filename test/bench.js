import { performance } from 'node:perf_hooks';
import { ProcLensEngine } from '../src/core.js';

console.log('── Running ProcLens Micro-Benchmark ──────────────────────');
const engine = new ProcLensEngine();

// Warm up
for (let i = 0; i < 10; i++) {
  engine.collect(10, 'cpu');
}

const ITERATIONS = 1000;
const start = performance.now();

for (let i = 0; i < ITERATIONS; i++) {
  engine.collect(15, 'cpu');
}

const totalMs = performance.now() - start;
const avgMs = totalMs / ITERATIONS;
const opsPerSec = Math.round((ITERATIONS / totalMs) * 1000);

console.log(`Iterations:        ${ITERATIONS}`);
console.log(`Total duration:    ${totalMs.toFixed(2)} ms`);
console.log(`Average snapshot:  ${avgMs.toFixed(3)} ms`);
console.log(`Throughput:        ${opsPerSec.toLocaleString()} ops/sec`);

const mockStat = '14209 (node worker: thread 1) S 1200 14209 1200 0 -1 4194304 314 0 0 0 125 45 0 0 20 0 16 0 1203912 209715200 51200';
const parseStart = performance.now();
const PARSE_ROUNDS = 100000;
for (let i = 0; i < PARSE_ROUNDS; i++) {
  ProcLensEngine.parseProcessStat(mockStat);
}
const parseDuration = performance.now() - parseStart;
const parseOpsPerSec = Math.round((PARSE_ROUNDS / parseDuration) * 1000);

console.log(`Stat Line Parsing: ${parseOpsPerSec.toLocaleString()} ops/sec (${((parseDuration / PARSE_ROUNDS) * 1000).toFixed(1)} ns/op)`);
console.log('──────────────────────────────────────────────────────────');
