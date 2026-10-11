#!/usr/bin/env node
import readline from 'node:readline';
import { ProcLensEngine, renderProgressBar, formatBytes, truncate } from './core.js';

const ANSI = {
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m',
  DIM: '\x1b[2m',
  CYAN: '\x1b[36m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  RED: '\x1b[31m',
  BLUE: '\x1b[34m',
  GRAY: '\x1b[90m',
  CLEAR: '\x1b[2J\x1b[3J\x1b[H',
  HIDE_CURSOR: '\x1b[?25l',
  SHOW_CURSOR: '\x1b[?25h'
};

const args = process.argv.slice(2);
let limit = 12;
let refreshRate = 1000;
let sortBy = 'cpu';
let filterPattern = '';
let jsonOnce = false;
let onceMode = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    console.log(`
${ANSI.BOLD}${ANSI.CYAN}proc-lens${ANSI.RESET} - Kernel Telemetry & Linux Process Profiler

Usage: proc-lens [options]

Options:
  -n, --top <num>         Number of top processes to show (default: 12)
  -i, --interval <ms>     Refresh interval in milliseconds (default: 1000)
  -s, --sort <cpu|mem>    Sort processes by cpu or mem (default: cpu)
  -f, --filter <text>     Filter processes matching PID or command name
  --once                  Print single snapshot and exit
  --json                  Output telemetry snapshot as structured JSON
  -h, --help              Show this manual

Keybinds (interactive mode):
  [q / Ctrl+C]  Quit
  [s]           Toggle Sort between CPU and MEM
  [+] / [-]     Increase / decrease refresh speed
`);
    process.exit(0);
  } else if (arg === '--top' || arg === '-n') {
    limit = parseInt(args[++i], 10) || 12;
  } else if (arg === '--interval' || arg === '-i') {
    refreshRate = Math.max(100, parseInt(args[++i], 10) || 1000);
  } else if (arg === '--sort' || arg === '-s') {
    sortBy = args[++i] === 'mem' ? 'mem' : 'cpu';
  } else if (arg === '--filter' || arg === '-f') {
    filterPattern = args[++i] || '';
  } else if (arg === '--json') {
    jsonOnce = true;
  } else if (arg === '--once') {
    onceMode = true;
  }
}

const engine = new ProcLensEngine();

// Prime CPU delta calculation
engine.collect(limit, sortBy);

function renderFrame() {
  const data = engine.collect(limit * 2, sortBy);

  if (jsonOnce) {
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
  }

  let filtered = data.processes;
  if (filterPattern) {
    const term = filterPattern.toLowerCase();
    filtered = filtered.filter((p) =>
      p.pid.toString().includes(term) ||
      p.comm.toLowerCase().includes(term) ||
      p.fullCmd.toLowerCase().includes(term)
    );
  }
  filtered = filtered.slice(0, limit);

  const time = new Date().toTimeString().split(' ')[0];
  const termCols = Math.min(process.stdout.columns || 88, 100);
  const innerWidth = termCols - 2;

  const cpuBar = renderProgressBar(data.cpuPercent, 18);
  const memBar = renderProgressBar(data.memory.percentUsed, 18);
  const swpBar = renderProgressBar(data.memory.swapPercent, 18);

  const headerTitle = `proc-lens v1.0.0`;
  const headerKernel = `${data.platform} ${truncate(data.release, 20)}`;
  const topBar = `┌─ [${ANSI.BOLD}${ANSI.CYAN}${headerTitle}${ANSI.RESET}] ─ ${ANSI.DIM}${headerKernel}${ANSI.RESET} ── ${time} ─`;
  const paddedTop = topBar + '─'.repeat(Math.max(0, innerWidth - (headerTitle.length + headerKernel.length + time.length + 14))) + '┐';

  const lines = [];
  lines.push(paddedTop);
  lines.push(`│ CPU ${ANSI.GREEN}${cpuBar}${ANSI.RESET} ${String(data.cpuPercent.toFixed(1)).padStart(5)}%  Load: [${data.loadAvg.join(', ')}] Cores: ${data.cores}`.padEnd(innerWidth + 9) + '│');
  lines.push(`│ MEM ${ANSI.BLUE}${memBar}${ANSI.RESET} ${String(data.memory.percentUsed.toFixed(1)).padStart(5)}%  Used: ${formatBytes(data.memory.usedBytes)} / ${formatBytes(data.memory.totalBytes)}`.padEnd(innerWidth + 9) + '│');
  lines.push(`│ SWP ${ANSI.YELLOW}${swpBar}${ANSI.RESET} ${String(data.memory.swapPercent.toFixed(1)).padStart(5)}%  Used: ${formatBytes(data.memory.swapUsedBytes)} / ${formatBytes(data.memory.swapTotalBytes)}`.padEnd(innerWidth + 9) + '│');
  lines.push(`├${'─'.repeat(innerWidth)}┤`);

  const tableHdr = `│ ${ANSI.BOLD}${'PID'.padEnd(7)} ${'PPID'.padEnd(7)} ${'STATE'.padEnd(6)} ${'CPU%'.padEnd(7)} ${'MEM%'.padEnd(7)} ${'RSS'.padEnd(10)} ${'THR'.padEnd(5)} ${'COMMAND'}${ANSI.RESET}`;
  lines.push(tableHdr.padEnd(innerWidth + 8) + '│');

  for (const p of filtered) {
    const ppidStr = String(p.ppid).padEnd(7);
    const pidStr = String(p.pid).padEnd(7);
    const stateStr = String(p.state).padEnd(6);
    const cpuStr = `${p.cpuPercent.toFixed(1)}%`.padEnd(7);
    const memStr = `${p.memPercent.toFixed(1)}%`.padEnd(7);
    const rssStr = `${p.rssMb.toFixed(1)}MB`.padEnd(10);
    const thrStr = String(p.threads).padEnd(5);
    const cmdSpace = Math.max(10, innerWidth - 52);
    const cmdStr = truncate(p.fullCmd, cmdSpace);

    const row = `│ ${pidStr} ${ppidStr} ${stateStr} ${cpuStr} ${memStr} ${rssStr} ${thrStr} ${cmdStr}`;
    lines.push(row.padEnd(innerWidth + 1) + '│');
  }

  for (let fill = filtered.length; fill < limit; fill++) {
    lines.push(`│${' '.repeat(innerWidth)}│`);
  }

  lines.push(`└${'─'.repeat(innerWidth)}┘`);
  lines.push(`  ${ANSI.DIM}[q] Quit  [s] Sort: ${sortBy.toUpperCase()}  [+/-] Rate: ${refreshRate}ms  [f] Filter: ${filterPattern || 'none'}${ANSI.RESET}`);

  if (onceMode) {
    console.log(lines.join('\n'));
    process.exit(0);
  }

  process.stdout.write(ANSI.CLEAR + lines.join('\n') + '\n');
}

if (jsonOnce || onceMode) {
  setTimeout(renderFrame, 80);
} else {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdout.write(ANSI.HIDE_CURSOR);

  let intervalId = setInterval(renderFrame, refreshRate);
  renderFrame();

  process.stdin.on('keypress', (_, key) => {
    if (!key) return;
    if ((key.ctrl && key.name === 'c') || key.name === 'q') {
      process.stdout.write(ANSI.SHOW_CURSOR);
      process.exit(0);
    }
    if (key.name === 's') {
      sortBy = sortBy === 'cpu' ? 'mem' : 'cpu';
      renderFrame();
    }
    if (key.sequence === '+' || key.sequence === '=') {
      refreshRate = Math.max(200, refreshRate - 200);
      clearInterval(intervalId);
      intervalId = setInterval(renderFrame, refreshRate);
      renderFrame();
    }
    if (key.sequence === '-' || key.sequence === '_') {
      refreshRate = Math.min(5000, refreshRate + 200);
      clearInterval(intervalId);
      intervalId = setInterval(renderFrame, refreshRate);
      renderFrame();
    }
  });

  process.on('SIGINT', () => {
    process.stdout.write(ANSI.SHOW_CURSOR);
    process.exit(0);
  });

  process.on('exit', () => {
    process.stdout.write(ANSI.SHOW_CURSOR);
  });
}
