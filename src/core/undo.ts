import { existsSync, rmSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { cowRestoreDir, getAllFiles } from './cow.js';
import { loadIgnorePatterns } from './ignore.js';
import { moveHeadBack, getHead, getSnapshots } from './store.js';
import type { Snapshot, UndoPreview } from './types.js';

/** Get the snapshot that undo would restore to (one step back from HEAD) */
function getUndoTarget(projectPath: string): Snapshot | undefined {
  const list = getSnapshots(projectPath);
  if (list.length === 0) return undefined;

  const headId = getHead(projectPath);
  let currentIndex = list.length - 1;
  if (headId) {
    const idx = list.findIndex((s) => s.id === headId);
    if (idx >= 0) currentIndex = idx;
  }

  const targetIndex = currentIndex - 1;
  if (targetIndex < 0) return undefined;
  return list[targetIndex];
}

/** Fast file comparison: first check size, then hash content */
function filesEqual(pathA: string, pathB: string): boolean {
  try {
    const statA = statSync(pathA);
    const statB = statSync(pathB);
    // Different size = definitely different
    if (statA.size !== statB.size) return false;
    // Same size = compare hash
    const hashA = createHash('md5').update(readFileSync(pathA)).digest('hex');
    const hashB = createHash('md5').update(readFileSync(pathB)).digest('hex');
    return hashA === hashB;
  } catch {
    return false;
  }
}

/** Preview what undo will do, without actually doing it */
export function previewUndo(projectPath: string): { snapshot: Snapshot; preview: UndoPreview } | null {
  const snapshot = getUndoTarget(projectPath);
  if (!snapshot) return null;

  const ignorePatterns = loadIgnorePatterns(projectPath);
  const currentFiles = new Set(getAllFiles(projectPath, projectPath, ignorePatterns));
  const snapshotFiles = new Set(getAllFiles(snapshot.snapshotPath, snapshot.snapshotPath));

  const modified: string[] = [];  // content changed
  const deleted: string[] = [];   // file deleted after snapshot
  const added: string[] = [];     // new file created after snapshot
  const unchanged: string[] = [];

  // Files in snapshot
  for (const f of snapshotFiles) {
    if (currentFiles.has(f)) {
      if (f.endsWith('/')) {
        // Empty directory — exists in both, unchanged
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

  // Files only in current: created after snapshot
  for (const f of currentFiles) {
    if (!snapshotFiles.has(f)) {
      added.push(f);
    }
  }

  return { snapshot, preview: { modified, deleted, added, unchanged } };
}

/** Execute undo: restore project to snapshot state */
export function executeUndo(projectPath: string, removeNewFiles = true): Snapshot | null {
  const snapshot = moveHeadBack(projectPath);
  if (!snapshot || !existsSync(snapshot.snapshotPath)) return null;

  const ignorePatterns = loadIgnorePatterns(projectPath);

  // If removeNewFiles, delete files that didn't exist in the snapshot
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

  // Restore all files from snapshot
  cowRestoreDir(snapshot.snapshotPath, projectPath);

  return snapshot;
}
