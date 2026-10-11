import fs from 'node:fs';
import os from 'node:os';

const CLK_TCK = 100;
const PAGE_SIZE_KB = 4;

/**
 * Pure state container tracking previous CPU measurements for delta calculation.
 */
export class ProcLensEngine {
  constructor() {
    this.prevCpuTotals = null;
    this.prevProcessCpu = new Map();
    this.isLinux = os.platform() === 'linux' && fs.existsSync('/proc/stat');
  }

  /**
   * Parse /proc/stat into CPU user/system/idle counters.
   * Fallback to os.cpus() for non-Linux or simulated environments.
   */
  readSystemCpu() {
    if (this.isLinux) {
      try {
        const stat = fs.readFileSync('/proc/stat', 'utf8');
        const firstLine = stat.split('\n')[0];
        const parts = firstLine.trim().split(/\s+/).slice(1).map(Number);
        const [user, nice, system, idle, iowait, irq, softirq, steal] = parts;
        const total = user + nice + system + idle + (iowait || 0) + (irq || 0) + (softirq || 0) + (steal || 0);
        const active = total - idle - (iowait || 0);
        return { total, active, idle };
      } catch {
        // fallback if unreadable
      }
    }

    const cpus = os.cpus();
    let total = 0;
    let idle = 0;
    for (const c of cpus) {
      for (const val of Object.values(c.times)) {
        total += val;
      }
      idle += c.times.idle;
    }
    return { total, active: total - idle, idle };
  }

  /**
   * Read memory information from /proc/meminfo.
   */
  readSystemMem() {
    if (this.isLinux) {
      try {
        const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
        const lines = meminfo.split('\n');
        const data = {};
        for (const line of lines) {
          const parts = line.split(':');
          if (parts.length === 2) {
            data[parts[0].trim()] = parseInt(parts[1].trim().split(' ')[0], 10);
          }
        }
        const total = (data.MemTotal || 1) * 1024;
        const free = (data.MemFree || 0) * 1024;
        const available = (data.MemAvailable !== undefined ? data.MemAvailable : free) * 1024;
        const used = total - available;
        const swapTotal = (data.SwapTotal || 0) * 1024;
        const swapFree = (data.SwapFree || 0) * 1024;
        const swapUsed = swapTotal - swapFree;
        return { total, used, available, swapTotal, swapUsed };
      } catch {
        // fallback
      }
    }

    const total = os.totalmem();
    const free = os.freemem();
    return { total, used: total - free, available: free, swapTotal: 0, swapUsed: 0 };
  }

  /**
   * Parse /proc/[pid]/stat line honoring commands containing parentheses and spaces.
   */
  static parseProcessStat(statStr) {
    const openParen = statStr.indexOf('(');
    const closeParen = statStr.lastIndexOf(')');
    if (openParen === -1 || closeParen === -1) return null;

    const pid = parseInt(statStr.substring(0, openParen).trim(), 10);
    const comm = statStr.substring(openParen + 1, closeParen);
    const rest = statStr.substring(closeParen + 2).trim().split(' ');

    const state = rest[0];
    const ppid = parseInt(rest[1], 10);
    const utime = parseInt(rest[11], 10);
    const stime = parseInt(rest[12], 10);
    const numThreads = parseInt(rest[17], 10);
    const rssPages = parseInt(rest[21], 10);

    return {
      pid,
      comm,
      state,
      ppid,
      cpuTicks: utime + stime,
      numThreads,
      rssBytes: rssPages * PAGE_SIZE_KB * 1024
    };
  }

  /**
   * Read command line arguments for process.
   */
  static readCmdline(pid) {
    try {
      const raw = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      const cmd = raw.split('\0').filter(Boolean).join(' ');
      return cmd || null;
    } catch {
      return null;
    }
  }

  /**
   * Snapshot active running processes.
   */
  getProcessSnapshot(limit = 10, sortBy = 'cpu') {
    const currentCpu = this.readSystemCpu();
    let deltaTotalCpu = 1;
    if (this.prevCpuTotals) {
      deltaTotalCpu = Math.max(1, currentCpu.total - this.prevCpuTotals.total);
    }

    const processes = [];
    const systemMem = this.readSystemMem();

    if (this.isLinux) {
      let entries = [];
      try {
        entries = fs.readdirSync('/proc');
      } catch {
        entries = [];
      }

      for (let i = 0; i < entries.length; i++) {
        const name = entries[i];
        if (name.charCodeAt(0) < 48 || name.charCodeAt(0) > 57) continue;
        const pid = parseInt(name, 10);

        try {
          const statStr = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
          const parsed = ProcLensEngine.parseProcessStat(statStr);
          if (!parsed) continue;

          const prevTicks = this.prevProcessCpu.get(pid) || parsed.cpuTicks;
          const tickDelta = Math.max(0, parsed.cpuTicks - prevTicks);
          this.prevProcessCpu.set(pid, parsed.cpuTicks);

          const cpuPercent = this.prevCpuTotals
            ? ((tickDelta / deltaTotalCpu) * 100 * os.cpus().length)
            : 0.0;

          const memPercent = (parsed.rssBytes / systemMem.total) * 100;
          const cmd = ProcLensEngine.readCmdline(pid) || parsed.comm;

          processes.push({
            pid: parsed.pid,
            ppid: parsed.ppid,
            comm: parsed.comm,
            fullCmd: cmd,
            state: parsed.state,
            threads: parsed.numThreads,
            cpuPercent: parseFloat(Math.min(100 * os.cpus().length, cpuPercent).toFixed(1)),
            memPercent: parseFloat(memPercent.toFixed(1)),
            rssMb: parseFloat((parsed.rssBytes / (1024 * 1024)).toFixed(2))
          });
        } catch {
          // Process terminated during scan
          this.prevProcessCpu.delete(pid);
        }
      }
    } else {
      // Synthetic environment fallback for portable testing
      const samplePids = [process.pid, 1, 42, 100, 312];
      for (const p of samplePids) {
        processes.push({
          pid: p,
          ppid: 1,
          comm: p === process.pid ? 'node' : `proc-${p}`,
          fullCmd: p === process.pid ? process.title || 'node' : `proc-${p} daemon`,
          state: 'S',
          threads: 4,
          cpuPercent: parseFloat((Math.random() * 5).toFixed(1)),
          memPercent: parseFloat(((process.memoryUsage().rss / systemMem.total) * 100).toFixed(1)),
          rssMb: parseFloat((process.memoryUsage().rss / (1024 * 1024)).toFixed(2))
        });
      }
    }

    // Clean stale keys in hashmap
    if (this.prevProcessCpu.size > 2000) {
      const activePids = new Set(processes.map((p) => p.pid));
      for (const pid of this.prevProcessCpu.keys()) {
        if (!activePids.has(pid)) this.prevProcessCpu.delete(pid);
      }
    }

    this.prevCpuTotals = currentCpu;

    processes.sort((a, b) => {
      if (sortBy === 'mem') return b.rssMb - a.rssMb;
      return b.cpuPercent - a.cpuPercent;
    });

    return processes.slice(0, limit);
  }

  /**
   * Collect complete telemetry snapshot.
   */
  collect(topLimit = 10, sortBy = 'cpu') {
    const cpu = this.readSystemCpu();
    let cpuPercent = 0;
    if (this.prevCpuTotals) {
      const totalDelta = Math.max(1, cpu.total - this.prevCpuTotals.total);
      const activeDelta = Math.max(0, cpu.active - this.prevCpuTotals.active);
      cpuPercent = Math.min(100, parseFloat(((activeDelta / totalDelta) * 100).toFixed(1)));
    }

    const mem = this.readSystemMem();
    const memPercent = Math.min(100, parseFloat(((mem.used / mem.total) * 100).toFixed(1)));
    const swapPercent = mem.swapTotal > 0 ? parseFloat(((mem.swapUsed / mem.swapTotal) * 100).toFixed(1)) : 0;
    const loadAvg = os.loadavg().map((l) => parseFloat(l.toFixed(2)));
    const procList = this.getProcessSnapshot(topLimit, sortBy);

    return {
      timestamp: new Date().toISOString(),
      platform: os.platform(),
      release: os.release(),
      uptimeSec: Math.floor(os.uptime()),
      cores: os.cpus().length,
      cpuPercent,
      loadAvg,
      memory: {
        totalBytes: mem.total,
        usedBytes: mem.used,
        availableBytes: mem.available,
        percentUsed: memPercent,
        swapTotalBytes: mem.swapTotal,
        swapUsedBytes: mem.swapUsed,
        swapPercent
      },
      processes: procList
    };
  }
}

/**
 * Formatting Utilities.
 */
export function renderProgressBar(percentage, width = 25) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const filledCount = Math.round((clamped / 100) * width);
  const emptyCount = width - filledCount;
  return `[${'|'.repeat(filledCount)}${'.'.repeat(emptyCount)}]`;
}

export function formatBytes(bytes) {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

export function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? `${str.slice(0, maxLen - 1)}…` : str;
}
