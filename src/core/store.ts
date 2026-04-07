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

// ==================== HEAD pointer ====================

function getHeadPath(): string {
  return join(getStorageDir(), 'head.json');
}

function loadHeads(): Record<string, string | null> {
  ensureStore();
  const p = getHeadPath();
  if (!existsSync(p)) return {};
  const content = readFileSync(p, 'utf-8').trim();
  if (!content) return {};
  return JSON.parse(content);
}

function saveHeads(heads: Record<string, string | null>): void {
  ensureStore();
  writeFileSync(getHeadPath(), JSON.stringify(heads, null, 2));
}

/** Get HEAD snapshot ID for a project (null = at latest) */
export function getHead(projectPath: string): string | null {
  return loadHeads()[projectHash(projectPath)] ?? null;
}

/** Set HEAD to a specific snapshot ID (null = reset to latest) */
export function setHead(projectPath: string, snapshotId: string | null): void {
  const heads = loadHeads();
  const key = projectHash(projectPath);
  if (snapshotId === null) {
    delete heads[key];
  } else {
    heads[key] = snapshotId;
  }
  saveHeads(heads);
}

/** Get the snapshot that HEAD points to, or the latest if HEAD is null */
export function getHeadSnapshot(projectPath: string): Snapshot | undefined {
  const headId = getHead(projectPath);
  const list = getSnapshots(projectPath);
  if (headId) {
    return list.find((s) => s.id === headId);
  }
  return list[list.length - 1];
}

/** Move HEAD back by N steps from current HEAD position. Return the target snapshot. */
export function moveHeadBack(projectPath: string, steps = 1): Snapshot | undefined {
  const list = getSnapshots(projectPath);
  if (list.length === 0) return undefined;

  const headId = getHead(projectPath);
  let currentIndex = list.length - 1; // default: at latest
  if (headId) {
    const idx = list.findIndex((s) => s.id === headId);
    if (idx >= 0) currentIndex = idx;
  }

  const targetIndex = currentIndex - steps;
  if (targetIndex < 0) return undefined;

  const target = list[targetIndex];
  setHead(projectPath, target.id);
  return target;
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
