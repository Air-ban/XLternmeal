import React, { useCallback, useEffect, useRef, useState } from 'react';

interface SystemMonitorProps {
  sessionId: string | null;
  theme: 'dark' | 'light';
}

interface CpuData {
  user: number;
  system: number;
  idle: number;
  iowait: number;
  total: number;
}

interface MemData {
  total: number;
  used: number;
  available: number;
  percent: number;
}

interface DiskData {
  filesystem: string;
  size: string;
  used: string;
  avail: string;
  percent: number;
  mount: string;
}

interface NetData {
  rx: number;
  tx: number;
  rxSpeed: number;
  txSpeed: number;
}

interface LoadData {
  load1: number;
  load5: number;
  load15: number;
}

interface ProcessData {
  pid: string;
  user: string;
  cpu: number;
  mem: number;
  command: string;
}

interface SystemSnapshot {
  timestamp: number;
  cpu: number;
  mem: number;
  net: NetData;
}

const HISTORY_LENGTH = 60;
const UPDATE_INTERVAL = 2000;

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07|\x1b\[?[0-9;]*[a-zA-Z]/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

function parseCpuStat(line: string): CpuData | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 5 || !parts[0].startsWith('cpu')) return null;
  const nums = parts.slice(1).map(Number);
  if (nums.some(n => isNaN(n))) return null;
  const [user, nice, system, idle, iowait = 0, irq = 0, softirq = 0, steal = 0] = nums;
  const total = user + nice + system + idle + iowait + irq + softirq + steal;
  return { user, system, idle, iowait, total };
}

function calcCpuPercent(prev: CpuData, curr: CpuData): number {
  const totalDiff = curr.total - prev.total;
  if (totalDiff <= 0) return 0;
  const idleDiff = curr.idle - prev.idle;
  return Math.min(100, Math.max(0, Math.round(((totalDiff - idleDiff) / totalDiff) * 100)));
}

function parseMemInfo(output: string): MemData | null {
  const lines = output.split('\n');
  let total = 0, available = 0;
  for (const line of lines) {
    const match = line.match(/(\d+)/);
    const val = match ? parseInt(match[0], 10) : 0;
    if (line.includes('MemTotal:')) total = val;
    if (line.includes('MemAvailable:')) available = val;
  }
  if (total === 0) return null;
  total = total / 1024;
  available = available / 1024;
  const used = total - available;
  const percent = total > 0 ? Math.round((used / total) * 100) : 0;
  return { total, used, available, percent };
}

function parseDf(output: string): DiskData[] {
  const lines = output.split('\n').filter(l => l.trim() && !l.toLowerCase().startsWith('filesystem'));
  return lines.map(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) return null;
    const percent = parseInt(parts[4].replace('%', ''), 10);
    if (isNaN(percent)) return null;
    return {
      filesystem: parts[0],
      size: parts[1],
      used: parts[2],
      avail: parts[3],
      percent,
      mount: parts[5],
    };
  }).filter(Boolean) as DiskData[];
}

function parseNetDev(output: string): { rx: number; tx: number } {
  const lines = output.split('\n');
  let rx = 0, tx = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Inter-') || trimmed.startsWith('face')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 10) continue;
    if (/^lo\d*$/i.test(parts[0].replace(':', ''))) continue;
    rx += parseInt(parts[1], 10) || 0;
    tx += parseInt(parts[9], 10) || 0;
  }
  return { rx, tx };
}

function parseLoad(output: string): LoadData | null {
  const match = output.match(/load average[s]?:\s*([\d.]+)\D+([\d.]+)\D+([\d.]+)/i);
  if (match) {
    const l1 = parseFloat(match[1]);
    const l5 = parseFloat(match[2]);
    const l15 = parseFloat(match[3]);
    if (isNaN(l1) || isNaN(l5) || isNaN(l15)) return null;
    return { load1: l1, load5: l5, load15: l15 };
  }
  return null;
}

function parseProcesses(output: string): ProcessData[] {
  const lines = output.split('\n').filter(l => l.trim());
  return lines.slice(1, 6).map(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 11) return null;
    const cpu = parseFloat(parts[2]);
    const mem = parseFloat(parts[3]);
    if (isNaN(cpu) || isNaN(mem)) return null;
    return {
      pid: parts[1],
      user: parts[0],
      cpu,
      mem,
      command: parts.slice(10).join(' '),
    };
  }).filter(Boolean) as ProcessData[];
}

function formatSpeed(kbps: number): string {
  if (kbps < 1) return '<1 KB/s';
  if (kbps < 1000) return `${Math.round(kbps)} KB/s`;
  return `${(kbps / 1024).toFixed(1)} MB/s`;
}

function drawSparkline(canvas: HTMLCanvasElement, data: number[], color: string, fillColor: string, maxValue = 100) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w <= 0 || h <= 0) return;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = 2;
  const chartW = w - pad * 2;
  const chartH = h - pad * 2;

  ctx.beginPath();
  ctx.moveTo(pad, h - pad);
  data.forEach((val, i) => {
    const x = pad + (i / (HISTORY_LENGTH - 1)) * chartW;
    const y = pad + chartH - (Math.min(val, maxValue) / maxValue) * chartH;
    ctx.lineTo(x, y);
  });
  ctx.lineTo(pad + chartW, h - pad);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();

  ctx.beginPath();
  data.forEach((val, i) => {
    const x = pad + (i / (HISTORY_LENGTH - 1)) * chartW;
    const y = pad + chartH - (Math.min(val, maxValue) / maxValue) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function drawRing(canvas: HTMLCanvasElement, percent: number, color: string, bgColor: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const size = canvas.clientWidth;
  if (size <= 0) return;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) - 6;
  const lineW = 5;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = bgColor;
  ctx.lineWidth = lineW;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (percent / 100) * Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineW;
  ctx.lineCap = 'round';
  ctx.stroke();
}

export function SystemMonitor({ sessionId, theme }: SystemMonitorProps): React.ReactElement {
  const [cpuPercent, setCpuPercent] = useState(0);
  const [cpuReady, setCpuReady] = useState(false);
  const [memData, setMemData] = useState<MemData | null>(null);
  const [disks, setDisks] = useState<DiskData[]>([]);
  const [load, setLoad] = useState<LoadData | null>(null);
  const [processes, setProcesses] = useState<ProcessData[]>([]);
  const [history, setHistory] = useState<SystemSnapshot[]>([]);
  const [connected, setConnected] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const cpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const netRxCanvasRef = useRef<HTMLCanvasElement>(null);
  const netTxCanvasRef = useRef<HTMLCanvasElement>(null);
  const memRingRef = useRef<HTMLCanvasElement>(null);
  const prevCpuRef = useRef<CpuData | null>(null);
  const prevNetRef = useRef<{ rx: number; tx: number } | null>(null);
  const historyRef = useRef<SystemSnapshot[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  const isDark = theme === 'dark';

  const fetchMetrics = useCallback(async () => {
    if (!sessionId) return;

    pollCountRef.current += 1;
    const localErrors: string[] = [];

    try {
      const [cpuRes, memRes, diskRes, netRes, loadRes, procRes] = await Promise.all([
        window.electronAPI.ssh.execute(sessionId, '/usr/bin/cat /proc/stat | head -n1'),
        window.electronAPI.ssh.execute(sessionId, '/usr/bin/cat /proc/meminfo | /usr/bin/grep -E "MemTotal|MemAvailable"'),
        window.electronAPI.ssh.execute(sessionId, 'df -h'),
        window.electronAPI.ssh.execute(sessionId, '/usr/bin/cat /proc/net/dev'),
        window.electronAPI.ssh.execute(sessionId, 'uptime'),
        window.electronAPI.ssh.execute(sessionId, 'ps aux --sort=-%cpu | head -n 6'),
      ]);

      let cpuVal = 0;
      if (cpuRes.success && cpuRes.output) {
        const parsed = parseCpuStat(stripAnsi(cpuRes.output));
        if (parsed) {
          if (prevCpuRef.current) {
            cpuVal = calcCpuPercent(prevCpuRef.current, parsed);
            if (!cpuReady) setCpuReady(true);
          }
          prevCpuRef.current = parsed;
        } else {
          localErrors.push(`CPU: cannot parse /proc/stat`);
        }
      } else if (cpuRes.error) {
        localErrors.push(`CPU: ${cpuRes.error}`);
      }

      let memVal: MemData = { total: 0, used: 0, available: 0, percent: 0 };
      if (memRes.success && memRes.output) {
        const parsed = parseMemInfo(stripAnsi(memRes.output));
        if (parsed) {
          memVal = parsed;
          setMemData(memVal);
        } else {
          localErrors.push('Memory: cannot parse /proc/meminfo');
        }
      } else if (memRes.error) {
        localErrors.push(`Memory: ${memRes.error}`);
      }

      if (diskRes.success && diskRes.output) {
        const parsedDisks = parseDf(stripAnsi(diskRes.output));
        setDisks(parsedDisks);
        if (parsedDisks.length === 0) localErrors.push('Disk: cannot parse df output');
      } else if (diskRes.error) {
        localErrors.push(`Disk: ${diskRes.error}`);
      }

      let netVal: NetData = { rx: 0, tx: 0, rxSpeed: 0, txSpeed: 0 };
      if (netRes.success && netRes.output) {
        const parsed = parseNetDev(stripAnsi(netRes.output));
        if (prevNetRef.current) {
          netVal = {
            rx: parsed.rx,
            tx: parsed.tx,
            rxSpeed: Math.max(0, (parsed.rx - prevNetRef.current.rx) / UPDATE_INTERVAL * 1024),
            txSpeed: Math.max(0, (parsed.tx - prevNetRef.current.tx) / UPDATE_INTERVAL * 1024),
          };
        } else {
          netVal = { rx: parsed.rx, tx: parsed.tx, rxSpeed: 0, txSpeed: 0 };
        }
        prevNetRef.current = parsed;
      } else if (netRes.error) {
        localErrors.push(`Net: ${netRes.error}`);
      }

      if (loadRes.success && loadRes.output) {
        const parsedLoad = parseLoad(stripAnsi(loadRes.output));
        if (parsedLoad) {
          setLoad(parsedLoad);
        } else {
          localErrors.push('Load: cannot parse uptime');
        }
      } else if (loadRes.error) {
        localErrors.push(`Load: ${loadRes.error}`);
      }

      if (procRes.success && procRes.output) {
        const parsedProcs = parseProcesses(stripAnsi(procRes.output));
        setProcesses(parsedProcs);
      } else if (procRes.error) {
        localErrors.push(`Processes: ${procRes.error}`);
      }

      const anyData = (cpuRes.success && cpuRes.output ? parseCpuStat(stripAnsi(cpuRes.output)) : null)
        || (memRes.success && memRes.output ? parseMemInfo(stripAnsi(memRes.output)) : null);

      const anySuccess = cpuRes.success || memRes.success || diskRes.success || netRes.success || loadRes.success || procRes.success;
      const allFailed = !anySuccess && pollCountRef.current > 1;

      if (allFailed) {
        setConnected(false);
      } else if (anyData || anySuccess) {
        setConnected(true);
        setErrors([]);
      }

      if (localErrors.length > 0) {
        setErrors(prev => {
          const unique = new Set([...prev, ...localErrors]);
          return Array.from(unique).slice(-12);
        });
      } else if (anyData) {
        setErrors([]);
      }

      setCpuPercent(cpuVal);

      const snapshot: SystemSnapshot = {
        timestamp: Date.now(),
        cpu: cpuVal,
        mem: memVal.percent,
        net: netVal,
      };

      const newHistory = [...historyRef.current, snapshot];
      if (newHistory.length > HISTORY_LENGTH) newHistory.shift();
      historyRef.current = newHistory;
      setHistory([...newHistory]);
    } catch {
      setConnected(false);
      setErrors(prev => {
        const msg = 'Network error fetching metrics';
        return prev.includes(msg) ? prev : [...prev, msg];
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setConnected(false);
      setErrors([]);
      return;
    }

    prevCpuRef.current = null;
    prevNetRef.current = null;
    historyRef.current = [];
    pollCountRef.current = 0;
    setHistory([]);
    setCpuPercent(0);
    setCpuReady(false);
    setMemData(null);
    setDisks([]);
    setLoad(null);
    setProcesses([]);
    setErrors([]);

    fetchMetrics();
    intervalRef.current = setInterval(fetchMetrics, UPDATE_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sessionId, fetchMetrics]);

  useEffect(() => {
    if (cpuCanvasRef.current && history.length > 0) {
      const cpuColor = isDark ? '#58a6ff' : '#0969da';
      const cpuFill = isDark ? 'rgba(88, 166, 255, 0.12)' : 'rgba(9, 105, 218, 0.10)';
      drawSparkline(cpuCanvasRef.current, history.map(h => h.cpu), cpuColor, cpuFill);
    }
  }, [history, isDark]);

  useEffect(() => {
    if (netRxCanvasRef.current && history.length > 0) {
      const rxColor = isDark ? '#39c5cf' : '#1b7c83';
      const rxFill = isDark ? 'rgba(57, 197, 207, 0.10)' : 'rgba(27, 124, 131, 0.08)';
      drawSparkline(netRxCanvasRef.current, history.map(h => h.net.rxSpeed), rxColor, rxFill, 1024);
    }
  }, [history, isDark]);

  useEffect(() => {
    if (netTxCanvasRef.current && history.length > 0) {
      const txColor = isDark ? '#d29922' : '#9a6700';
      const txFill = isDark ? 'rgba(210, 153, 34, 0.10)' : 'rgba(154, 103, 0, 0.08)';
      drawSparkline(netTxCanvasRef.current, history.map(h => h.net.txSpeed), txColor, txFill, 1024);
    }
  }, [history, isDark]);

  useEffect(() => {
    if (memRingRef.current && memData) {
      const memColor = isDark ? '#3fb950' : '#1a7f37';
      const bgColor = isDark ? 'rgba(110, 118, 129, 0.2)' : 'rgba(101, 109, 118, 0.15)';
      drawRing(memRingRef.current, memData.percent, memColor, bgColor);
    }
  }, [memData, isDark]);

  const cpuBarColor = isDark
    ? `linear-gradient(90deg, #58a6ff, #79c0ff)`
    : `linear-gradient(90deg, #0969da, #0550ae)`;

  const showEmpty = !sessionId || (!connected && pollCountRef.current <= 1);
  const showError = !connected && pollCountRef.current > 1 && errors.length > 0;

  return (
    <div className="system-monitor">
      {showEmpty ? (
        <div className="monitor-empty">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="16" stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="4 4" />
            <path d="M20 12v8l5 5" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p>{!sessionId ? 'Select a connection to start monitoring' : 'Gathering system data...'}</p>
        </div>
      ) : showError ? (
        <div className="monitor-error-panel">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <circle cx="18" cy="18" r="14" stroke="var(--danger)" strokeWidth="1.5" />
            <path d="M18 10v8M18 24h0" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <h3>Unable to read system metrics</h3>
          <p className="monitor-error-hint">
            Remote server may be non-Linux or exec channel is disabled.
          </p>
          <div className="monitor-error-list">
            {errors.map((e, i) => <p key={i} className="monitor-error-item">{e}</p>)}
          </div>
          <button className="btn btn-ghost btn-sm monitor-retry-btn" onClick={fetchMetrics}>
            Retry
          </button>
        </div>
      ) : (
        <>
        <div className="monitor-grid">
          <div className="monitor-card monitor-cpu">
            <div className="monitor-card-header">
              <span className="monitor-label">CPU Usage</span>
              <span className="monitor-value">{cpuReady ? `${cpuPercent}%` : '--'}</span>
            </div>
            <div className="monitor-bar-wrap">
              <div className="monitor-bar-bg">
                <div className="monitor-bar-fill" style={{ width: `${cpuReady ? cpuPercent : 0}%`, background: cpuBarColor }} />
              </div>
            </div>
            <canvas ref={cpuCanvasRef} className="monitor-sparkline" />
          </div>

          <div className="monitor-card monitor-mem">
            <div className="monitor-card-header">
              <span className="monitor-label">Memory</span>
              <span className="monitor-value">{memData ? `${memData.percent}%` : '--'}</span>
            </div>
            <div className="monitor-mem-body">
              <canvas ref={memRingRef} className="monitor-ring" />
              <div className="monitor-mem-info">
                <div className="monitor-mem-row">
                  <span className="monitor-mem-dot" style={{ background: isDark ? '#3fb950' : '#1a7f37' }} />
                  <span>Used: {memData ? `${memData.used.toFixed(1)} MB` : '--'}</span>
                </div>
                <div className="monitor-mem-row">
                  <span className="monitor-mem-dot" style={{ background: 'var(--text-muted)' }} />
                  <span>Free: {memData ? `${memData.available.toFixed(1)} MB` : '--'}</span>
                </div>
                <div className="monitor-mem-row">
                  <span className="monitor-mem-dot" style={{ background: 'var(--text-muted)', opacity: 0.5 }} />
                  <span>Total: {memData ? `${memData.total.toFixed(1)} MB` : '--'}</span>
                </div>
              </div>
            </div>
            {!memData && errors.some(e => e.includes('Memory')) && (
              <p className="monitor-inline-error">{errors.find(e => e.includes('Memory'))}</p>
            )}
          </div>

          <div className="monitor-card monitor-net">
            <div className="monitor-card-header">
              <span className="monitor-label">Network I/O</span>
            </div>
            <div className="monitor-net-body">
              <div className="monitor-net-col">
                <div className="monitor-net-label">
                  <span className="monitor-net-dot" style={{ background: isDark ? '#39c5cf' : '#1b7c83' }} />
                  <span>Download</span>
                  <span className="monitor-net-speed">{history.length > 0 ? formatSpeed(history[history.length - 1].net.rxSpeed) : '--'}</span>
                </div>
                <canvas ref={netRxCanvasRef} className="monitor-sparkline monitor-net-sparkline" />
              </div>
              <div className="monitor-net-col">
                <div className="monitor-net-label">
                  <span className="monitor-net-dot" style={{ background: isDark ? '#d29922' : '#9a6700' }} />
                  <span>Upload</span>
                  <span className="monitor-net-speed">{history.length > 0 ? formatSpeed(history[history.length - 1].net.txSpeed) : '--'}</span>
                </div>
                <canvas ref={netTxCanvasRef} className="monitor-sparkline monitor-net-sparkline" />
              </div>
            </div>
          </div>

          <div className="monitor-card monitor-disk">
            <div className="monitor-card-header">
              <span className="monitor-label">Disk Usage</span>
            </div>
            <div className="monitor-disk-list">
              {disks.map((disk, i) => (
                <div key={i} className="monitor-disk-item">
                  <div className="monitor-disk-info">
                    <span className="monitor-disk-mount">{disk.mount}</span>
                    <span className="monitor-disk-usage">{disk.used} / {disk.size} ({disk.percent}%)</span>
                  </div>
                  <div className="monitor-bar-bg">
                    <div
                      className="monitor-bar-fill"
                      style={{
                        width: `${disk.percent}%`,
                        background: disk.percent > 90
                          ? `linear-gradient(90deg, var(--danger), #ff7b72)`
                          : disk.percent > 70
                            ? `linear-gradient(90deg, var(--warning), #e3b341)`
                            : `linear-gradient(90deg, var(--success), #56d364)`,
                      }}
                    />
                  </div>
                </div>
              ))}
              {disks.length === 0 && <p className="monitor-empty-text">No disk data</p>}
            </div>
          </div>

          <div className="monitor-card monitor-load">
            <div className="monitor-card-header">
              <span className="monitor-label">System Load</span>
            </div>
            <div className="monitor-load-grid">
              <div className="monitor-load-item">
                <span className="monitor-load-val">{load ? load.load1.toFixed(2) : '--'}</span>
                <span className="monitor-load-label">1 min</span>
              </div>
              <div className="monitor-load-item">
                <span className="monitor-load-val">{load ? load.load5.toFixed(2) : '--'}</span>
                <span className="monitor-load-label">5 min</span>
              </div>
              <div className="monitor-load-item">
                <span className="monitor-load-val">{load ? load.load15.toFixed(2) : '--'}</span>
                <span className="monitor-load-label">15 min</span>
              </div>
            </div>
          </div>

          <div className="monitor-card monitor-procs">
            <div className="monitor-card-header">
              <span className="monitor-label">Top Processes</span>
            </div>
            <div className="monitor-proc-list">
              <div className="monitor-proc-header">
                <span>PID</span>
                <span>User</span>
                <span>CPU%</span>
                <span>MEM%</span>
                <span>Command</span>
              </div>
              {processes.map((proc, i) => (
                <div key={i} className="monitor-proc-row">
                  <span className="monitor-proc-pid">{proc.pid}</span>
                  <span className="monitor-proc-user">{proc.user}</span>
                  <span className="monitor-proc-cpu">{proc.cpu.toFixed(1)}%</span>
                  <span className="monitor-proc-mem">{proc.mem.toFixed(1)}%</span>
                  <span className="monitor-proc-cmd" title={proc.command}>{proc.command}</span>
                </div>
              ))}
              {processes.length === 0 && <p className="monitor-empty-text">No process data</p>}
            </div>
          </div>
        </div>
        {errors.length > 0 && connected && (
          <div className="monitor-inline-errors">
            {errors.map((e, i) => <p key={i} className="monitor-inline-error-item">{e}</p>)}
          </div>
        )}
        </>
      )}

      <style>{`
        .system-monitor {
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          padding: 16px;
          background: var(--terminal-bg);
        }

        .system-monitor::-webkit-scrollbar { width: 5px; }
        .system-monitor::-webkit-scrollbar-thumb {
          background: var(--border-color);
          border-radius: 3px;
        }

        .monitor-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          height: 100%;
          color: var(--text-muted);
          font-size: 14px;
        }

        .monitor-error-panel {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          height: 100%;
          text-align: center;
          color: var(--text-muted);
        }

        .monitor-error-panel h3 {
          color: var(--danger);
          font-size: 16px;
          font-weight: 600;
        }

        .monitor-error-hint {
          font-size: 13px;
          color: var(--text-muted);
          max-width: 360px;
        }

        .monitor-error-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 10px 16px;
          background: rgba(var(--acrylic-tint-rgb), 0.3);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          font-size: 11px;
          font-family: monospace;
          max-width: 500px;
          width: 100%;
        }

        .monitor-error-item {
          color: var(--text-secondary);
          text-align: left;
          word-break: break-all;
        }

        .monitor-retry-btn {
          margin-top: 4px;
        }

        .monitor-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          max-width: 900px;
          margin: 0 auto;
        }

        .monitor-card {
          background: rgba(var(--acrylic-tint-rgb), 0.38);
          border: 1px solid var(--border-color);
          border-radius: var(--radius);
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .monitor-cpu { grid-column: 1; }
        .monitor-mem { grid-column: 2; }
        .monitor-net { grid-column: 1 / -1; }
        .monitor-disk { grid-column: 1; }
        .monitor-load { grid-column: 2; }
        .monitor-procs { grid-column: 1 / -1; }

        .monitor-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .monitor-label {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        .monitor-value {
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }

        .monitor-bar-wrap { padding: 2px 0; }

        .monitor-bar-bg {
          height: 6px;
          background: rgba(var(--acrylic-tint-rgb), 0.3);
          border-radius: 3px;
          overflow: hidden;
        }

        .monitor-bar-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 400ms ease;
        }

        .monitor-sparkline {
          width: 100%;
          height: 60px;
          border-radius: var(--radius-sm);
          background: rgba(var(--acrylic-tint-rgb), 0.18);
        }

        .monitor-mem-body {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .monitor-ring {
          width: 72px;
          height: 72px;
          flex-shrink: 0;
        }

        .monitor-mem-info {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12px;
          color: var(--text-secondary);
        }

        .monitor-mem-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .monitor-mem-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .monitor-net-body {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .monitor-net-col {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .monitor-net-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-secondary);
        }

        .monitor-net-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .monitor-net-speed {
          margin-left: auto;
          font-weight: 600;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }

        .monitor-net-sparkline { height: 48px; }

        .monitor-disk-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .monitor-disk-item {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .monitor-disk-info {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
        }

        .monitor-disk-mount {
          font-weight: 500;
          color: var(--text-primary);
        }

        .monitor-disk-usage { color: var(--text-muted); }

        .monitor-load-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }

        .monitor-load-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 10px;
          background: rgba(var(--acrylic-tint-rgb), 0.22);
          border-radius: var(--radius-sm);
        }

        .monitor-load-val {
          font-size: 20px;
          font-weight: 700;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }

        .monitor-load-label {
          font-size: 11px;
          color: var(--text-muted);
        }

        .monitor-proc-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .monitor-proc-header {
          display: grid;
          grid-template-columns: 60px 80px 55px 55px 1fr;
          gap: 8px;
          padding: 6px 10px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.3px;
          text-transform: uppercase;
          color: var(--text-muted);
          border-bottom: 1px solid var(--border-color);
        }

        .monitor-proc-row {
          display: grid;
          grid-template-columns: 60px 80px 55px 55px 1fr;
          gap: 8px;
          padding: 5px 10px;
          font-size: 12px;
          color: var(--text-secondary);
          border-radius: 4px;
          transition: background 150ms ease;
        }

        .monitor-proc-row:hover {
          background: rgba(var(--acrylic-tint-rgb), 0.25);
        }

        .monitor-proc-cpu {
          color: var(--accent);
          font-weight: 500;
        }

        .monitor-proc-mem {
          color: var(--success);
          font-weight: 500;
        }

        .monitor-proc-cmd {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--text-primary);
        }

        .monitor-empty-text {
          font-size: 12px;
          color: var(--text-muted);
          text-align: center;
          padding: 8px;
        }

        .monitor-inline-error {
          font-size: 10px;
          color: var(--danger);
          padding: 2px 0;
        }

        .monitor-inline-errors {
          margin-top: 12px;
          padding: 10px 14px;
          background: rgba(var(--acrylic-tint-rgb), 0.3);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          font-size: 11px;
          font-family: monospace;
          max-width: 900px;
          width: 100%;
          margin-left: auto;
          margin-right: auto;
        }

        .monitor-inline-error-item {
          color: var(--danger);
          padding: 2px 0;
          word-break: break-all;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: none;
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-weight: 500;
          font-size: 13px;
          transition: all var(--transition);
        }

        .btn-sm {
          padding: 6px 12px;
          font-size: 12px;
        }

        .btn-ghost {
          background: transparent;
          color: var(--accent);
        }

        .btn-ghost:hover {
          background: var(--accent-subtle);
        }

        @media (max-width: 640px) {
          .monitor-grid { grid-template-columns: 1fr; }
          .monitor-cpu, .monitor-mem, .monitor-net, .monitor-disk, .monitor-load, .monitor-procs {
            grid-column: 1;
          }
        }
      `}</style>
    </div>
  );
}
