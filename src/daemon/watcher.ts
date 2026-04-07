import { watch, existsSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createSnapshot } from '../core/snapshot.js';
import { loadIgnorePatterns, shouldIgnore } from '../core/ignore.js';

const PID_FILE = join(homedir(), '.cowback', 'daemon.pid');
const LOG_FILE = join(homedir(), '.cowback', 'daemon.log');
const LOCK_FILE = join(homedir(), '.cowback', 'undo.lock');

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    const { appendFileSync } = require('node:fs');
    appendFileSync(LOG_FILE, line);
  } catch {}
  process.stdout.write(line);
}

/** Start watching a directory for changes and auto-snapshot */
export function startWatcher(projectPath: string, quietPeriodMs = 30_000, maxSnapshots = 20) {
  const ignorePatterns = loadIgnorePatterns(projectPath);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let changeCount = 0;

  // Write PID file
  writeFileSync(PID_FILE, JSON.stringify({ pid: process.pid, projectPath, startedAt: Date.now() }));

  log(`Watching: ${projectPath}`);
  log(`Quiet period: ${quietPeriodMs / 1000}s`);
  log(`Max snapshots: ${maxSnapshots}`);

  // Initial snapshot
  const initial = createSnapshot(projectPath, 'auto', 'initial', maxSnapshots);
  log(`Initial snapshot: ${initial.id} (${initial.fileCount} files)`);

  const watcher = watch(projectPath, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    const fullPath = join(projectPath, filename);
    if (shouldIgnore(fullPath, projectPath, ignorePatterns)) return;

    // Skip changes caused by undo operations
    if (existsSync(LOCK_FILE)) return;

    changeCount++;

    // Reset quiet timer on every change
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (changeCount === 0) return;
      if (existsSync(LOCK_FILE)) { changeCount = 0; return; }
      log(`${changeCount} file changes detected, creating snapshot...`);
      try {
        const snap = createSnapshot(projectPath, 'auto', `auto: ${changeCount} changes`, maxSnapshots);
        log(`Snapshot created: ${snap.id} (${snap.fileCount} files)`);
      } catch (err: any) {
        log(`Snapshot failed: ${err.message}`);
      }
      changeCount = 0;
    }, quietPeriodMs);
  });

  // Graceful shutdown
  const cleanup = () => {
    log('Stopping watcher...');
    watcher.close();
    if (timer) clearTimeout(timer);
    try { unlinkSync(PID_FILE); } catch {}
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  log('Cowback is ON. Your project is protected.');
}

/** Check if daemon is running */
export function getDaemonStatus(): { running: boolean; pid?: number; projectPath?: string } {
  if (!existsSync(PID_FILE)) return { running: false };
  try {
    const data = JSON.parse(readFileSync(PID_FILE, 'utf-8'));
    // Check if process is actually running
    process.kill(data.pid, 0);
    return { running: true, pid: data.pid, projectPath: data.projectPath };
  } catch {
    // Stale PID file
    try { unlinkSync(PID_FILE); } catch {}
    return { running: false };
  }
}

/** Stop daemon */
export function stopDaemon(): boolean {
  const status = getDaemonStatus();
  if (!status.running || !status.pid) return false;
  try {
    process.kill(status.pid, 'SIGTERM');
    try { unlinkSync(PID_FILE); } catch {}
    return true;
  } catch {
    return false;
  }
}
