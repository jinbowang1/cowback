import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import type { Snapshot } from './types.js';

function getStorageDir(): string {
  return join(homedir(), '.cowback');
}

function getDbPath(): string {
  return join(getStorageDir(), 'snapshots.json');
}

/** Get a deterministic hash for a project path (used as storage subdirectory) */
export function projectHash(projectPath: string): string {
  return createHash('md5').update(projectPath).digest('hex').slice(0, 12);
}

export function getSnapshotDir(projectPath: string, snapshotId: string): string {
  const dir = join(getStorageDir(), 'snapshots', projectHash(projectPath), snapshotId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureStore(): void {
  const dir = getStorageDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadAll(): Snapshot[] {
  ensureStore();
  const db = getDbPath();
  if (!existsSync(db)) return [];
  const content = readFileSync(db, 'utf-8').trim();
  if (!content) return [];
  return JSON.parse(content);
}

function saveAll(snapshots: Snapshot[]): void {
  ensureStore();
  writeFileSync(getDbPath(), JSON.stringify(snapshots, null, 2));
}

export function addSnapshot(snap: Snapshot): void {
  const list = loadAll();
  list.push(snap);
  saveAll(list);
}

export function getSnapshots(projectPath: string): Snapshot[] {
  return loadAll()
    .filter((s) => s.projectPath === projectPath)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function getLatestSnapshot(projectPath: string): Snapshot | undefined {
  const list = getSnapshots(projectPath);
  return list[list.length - 1];
}

export function getNthSnapshot(projectPath: string, n: number): Snapshot | undefined {
  const list = getSnapshots(projectPath);
  return list[list.length - n];
}

export function removeSnapshot(id: string): void {
  const list = loadAll();
  const snap = list.find((s) => s.id === id);
  if (snap) {
    // Remove snapshot files
    rmSync(snap.snapshotPath, { recursive: true, force: true });
  }
  saveAll(list.filter((s) => s.id !== id));
}

/** Auto-clean: keep only the latest N snapshots for a project */
export function autoClean(projectPath: string, maxSnapshots: number): number {
  const list = getSnapshots(projectPath);
  if (list.length <= maxSnapshots) return 0;

  const toRemove = list.slice(0, list.length - maxSnapshots);
  for (const snap of toRemove) {
    removeSnapshot(snap.id);
  }
  return toRemove.length;
}
