import { existsSync, rmSync, readFileSync, statSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

const LOCK_FILE = join(homedir(), '.cowback', 'undo.lock');

function acquireLock() {
  mkdirSync(join(homedir(), '.cowback'), { recursive: true });
  writeFileSync(LOCK_FILE, String(Date.now()));
}

function releaseLock() {
  try { unlinkSync(LOCK_FILE); } catch {}
}
import { cowRestoreDir, getAllFiles } from './cow.js';
import { log } from './logger.js';
import { loadIgnorePatterns } from './ignore.js';
import { moveHeadBack, getHead, getSnapshots, getHeadSnapshot } from './store.js';
import type { Snapshot, UndoPreview } from './types.js';

/** Fast file comparison: first check size, then hash content */
function filesEqual(pathA: string, pathB: string): boolean {
  try {
    const statA = statSync(pathA);
    const statB = statSync(pathB);
    if (statA.size !== statB.size) return false;
    const hashA = createHash('md5').update(readFileSync(pathA)).digest('hex');
    const hashB = createHash('md5').update(readFileSync(pathB)).digest('hex');
    return hashA === hashB;
  } catch {
    return false;
  }
}

/** Compare current files against a snapshot, return categorized changes */
function compareWithSnapshot(projectPath: string, snapshot: Snapshot): UndoPreview {
  const ignorePatterns = loadIgnorePatterns(projectPath);
  const currentFiles = new Set(getAllFiles(projectPath, projectPath, ignorePatterns));
  const snapshotFiles = new Set(getAllFiles(snapshot.snapshotPath, snapshot.snapshotPath));

  const modified: string[] = [];
  const deleted: string[] = [];
  const added: string[] = [];
  const unchanged: string[] = [];

  for (const f of snapshotFiles) {
    if (currentFiles.has(f)) {
      if (f.endsWith('/')) {
        unchanged.push(f);
      } else {
        const currentPath = join(projectPath, f);
        const snapPath = join(snapshot.snapshotPath, f);
        if (filesEqual(currentPath, snapPath)) {
          unchanged.push(f);
        } else {
          modified.push(f);
        }
      }
    } else {
      deleted.push(f);
    }
  }

  for (const f of currentFiles) {
    if (!snapshotFiles.has(f)) {
      added.push(f);
    }
  }

  return { modified, deleted, added, unchanged };
}

/** Show diff: current state vs HEAD snapshot ("what changed since last snapshot") */
export function previewDiff(projectPath: string): { snapshot: Snapshot; preview: UndoPreview } | null {
  const snapshot = getHeadSnapshot(projectPath);
  if (!snapshot) return null;
  const preview = compareWithSnapshot(projectPath, snapshot);
  return { snapshot, preview };
}

/** Preview what undo will do: current state vs the undo target snapshot */
export function previewUndo(projectPath: string): { snapshot: Snapshot; preview: UndoPreview } | null {
  const list = getSnapshots(projectPath);
  if (list.length === 0) return null;

  const headId = getHead(projectPath);
  let targetIndex: number;

  if (headId) {
    // HEAD is set → already undone before, go one more step back
    const idx = list.findIndex((s) => s.id === headId);
    if (idx < 0) return null;
    targetIndex = idx - 1;
  } else {
    // HEAD is null → at current state, undo to latest snapshot
    targetIndex = list.length - 1;
  }

  if (targetIndex < 0) return null;

  const target = list[targetIndex];
  const preview = compareWithSnapshot(projectPath, target);
  return { snapshot: target, preview };
}

/** Execute undo: move HEAD back and restore to that snapshot */
export function executeUndo(projectPath: string, removeNewFiles = true): Snapshot | null {
  const snapshot = moveHeadBack(projectPath);
  if (!snapshot || !existsSync(snapshot.snapshotPath)) return null;

  // Lock: tell daemon to ignore file changes during restore
  acquireLock();
  try {
    const ignorePatterns = loadIgnorePatterns(projectPath);

    if (removeNewFiles) {
      const currentFileList = getAllFiles(projectPath, projectPath, ignorePatterns);
      const snapshotFileSet = new Set(getAllFiles(snapshot.snapshotPath, snapshot.snapshotPath));

      for (const f of currentFileList) {
        if (!snapshotFileSet.has(f)) {
          const fullPath = join(projectPath, f.endsWith('/') ? f.slice(0, -1) : f);
          rmSync(fullPath, { recursive: true, force: true });
        }
      }
    }

    cowRestoreDir(snapshot.snapshotPath, projectPath);
  } finally {
    releaseLock();
  }

  log('undo', `→ ${snapshot.id}${snapshot.label ? ' (' + snapshot.label + ')' : ''}`);
  return snapshot;
}
