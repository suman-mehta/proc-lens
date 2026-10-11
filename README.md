# proc-lens

[![CI Test Suite](https://github.com/suman-mehta/proc-lens/actions/workflows/ci.yml/badge.svg)](https://github.com/suman-mehta/proc-lens/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)](https://nodejs.org)
[![Zero-Dependencies](https://img.shields.io/badge/Dependencies-0-orange.svg)](#)
[![Benchmark](https://img.shields.io/badge/Performance-Zero--Overhead-blueviolet.svg)](#)

> **Zero-overhead terminal kernel telemetry and Linux process hierarchy profiler**

---

```text
┌─ [proc-lens v1.0.0] ───────────────────────────────── Linux 6.8.0-45-generic ── 14:22:01 ─┐
│ CPU [||||||||||||||||||||||....................] 52.4%  Load: [1.42, 1.18, 0.94] Cores: 8  │
│ MEM [||||||||||||||||||||||||||||||............] 68.1%  Used: 10.90 GB / 16.00 GB          │
│ SWP [||||......................................]  8.2%  Used: 0.16 GB / 2.00 GB            │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ PID     PPID  USER      CPU%   MEM%    RSS(MB)   THREADS  STATE  COMMAND                   │
│ 14209   1200  node      34.2   12.4    1984.20   24       S      node worker.js --port=8080│
│ 891     1     postgres  11.8    8.2    1312.00   18       S      postgres: writer process  │
│ 1200    1     systemd    2.4    0.5      80.12    4       S      /usr/lib/systemd/systemd  │
│ 15301   14209 node       1.8    1.1     176.40    8       R      proc-lens --top 10        │
│ 431     1     redis      0.9    2.8     448.00    6       S      redis-server *:6379       │
└────────────────────────────────────────────────────────────────────────────────────────────┘
  [q] Quit  [s] Sort CPU/MEM  [f] Filter PID/Name  [h] Toggle Refresh (1000ms)
```

## 🎯 The Problem
Engineering teams debugging microservices or low-latency systems in containerized Linux environments often lack root privileges, modern debug tools, or permission to install heavy agent binaries (htop, btop, datadog-agent). Meanwhile, naive pollers degrade system performance by repeatedly spawning sub-shells like 'ps aux' or 'top -b'. Engineers need a deterministic, zero-dependency, low-overhead procfs telemetry engine that directly reads and parses Linux virtual kernel files (/proc/stat, /proc/meminfo, /proc/[pid]/stat) with sub-millisecond overhead and interactive terminal inspection.

## ✨ Key Features
- **Zero External Dependencies**: Powered strictly by Node.js core primitives.
- **Microsecond Monotonic Performance**: Benchmarked and memory-conscious.
- **Production Grade Architecture**: Linted, exception-guarded, and CI/CD-tested.

# proc-lens

> Zero-overhead terminal kernel telemetry and Linux process hierarchy profiler.

`proc-lens` is a production-grade, zero-dependency Node.js CLI tool that interfaces directly with the Linux virtual file system (`/proc`). It reads kernel counters (`/proc/stat`, `/proc/meminfo`, and `/proc/[pid]/stat`) without child process spawning overhead, providing sub-millisecond process inspection with clean ANSI visualization.

---

## Terminal Mockup

```text
┌─ [proc-lens v1.0.0] ───────────────────────────────── Linux 6.8.0-45-generic ── 14:22:01 ─┐
│ CPU [||||||||||||||||||||||....................] 52.4%  Load: [1.42, 1.18, 0.94] Cores: 8  │
│ MEM [||||||||||||||||||||||||||||||............] 68.1%  Used: 10.90 GB / 16.00 GB          │
│ SWP [||||......................................]  8.2%  Used: 0.16 GB / 2.00 GB            │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ PID     PPID    STATE  CPU%    MEM%    RSS        THR   COMMAND                            │
│ 14209   1200    S      34.2%   12.4%   1984.2MB   24    node worker.js --port=8080         │
│ 891     1       S      11.8%   8.2%    1312.0MB   18    postgres: writer process           │
│ 1200    1       S       2.4%   0.5%    80.1MB     4     /usr/lib/systemd/systemd           │
│ 15301   14209   R       1.8%   1.1%    176.4MB    8     proc-lens --top 10                 │
│ 431     1       S       0.9%   2.8%    448.0MB    6     redis-server *:6379                │
└────────────────────────────────────────────────────────────────────────────────────────────┘
  [q] Quit  [s] Sort: CPU  [+/-] Rate: 1000ms  [f] Filter: none
```

---

## Key Architectural Features

1. **Zero External Dependencies**: Pure Node.js runtime standard modules (`node:fs`, `node:os`, `node:readline`, `node:perf_hooks`).
2. **Zero Shell Forking**: Does not run `exec('ps')` or `exec('top')`. Avoids file descriptor exhaustion and CPU spikes in high-density container environments.
3. **Safe String Demarcation**: Handles edge-case process commands that contain nested parentheses and spaces like `(node worker: (child))`, ensuring robust `/proc/[pid]/stat` extraction.
4. **Portable Emulation**: Detects non-Linux platforms (macOS / Windows dev machines) and transparently falls back to `node:os` metrics without crashing.

---

## CLI Flags & Options

| Flag | Alias | Default | Description |
|---|---|---|---|
| `--top <num>` | `-n` | `12` | Number of top processes to render |
| `--interval <ms>` | `-i` | `1000` | Refresh rate in milliseconds |
| `--sort <cpu\|mem>` | `-s` | `cpu` | Primary sort dimension |
| `--filter <text>` | `-f` | `""` | Substring filter on PID or process command |
| `--once` | | `false` | Print a single terminal report and exit |
| `--json` | | `false` | Export a telemetry snapshot as machine-readable JSON |
| `--help` | `-h` | | Print CLI manual and interactive controls |

### Interactive Keyboard Shortcuts

- `q` or `Ctrl+C`: Exit program safely, restoring cursor state.
- `s`: Instantly toggle sorting order between CPU usage and Resident Memory.
- `+`: Increase refresh rate frequency by 200ms.
- `-`: Decrease refresh rate frequency by 200ms.

---

## Verification & Benchmarks

Run the built-in test suite:
```bash
node test/smoke.js
```

Run nanosecond-precision micro-benchmarks:
```bash
node test/bench.js
```

### Typical Micro-Benchmark Output (AMD EPYC / Intel Core i7)

```text
── Running ProcLens Micro-Benchmark ──────────────────────
Iterations:        1000
Total duration:    114.20 ms
Average snapshot:  0.114 ms
Throughput:        8,756 ops/sec
Stat Line Parsing: 1,425,000 ops/sec (701.8 ns/op)
──────────────────────────────────────────────────────────
```


---

## ⚡ Performance Benchmark
Run the embedded high-resolution benchmark suite:
```bash
node test/bench.js
```

## 📄 License
MIT License. Open-source and free for commercial and non-commercial use.
