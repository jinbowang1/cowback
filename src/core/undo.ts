import { existsSync, rmSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { cowRestoreDir, getAllFiles } from './cow.js';
import { loadIgnorePatterns } from './ignore.js';
import { getNthSnapshot } from './store.js';
import type { Snapshot, UndoPreview } from './types.js';

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
export function previewUndo(projectPath: string, n = 1): { snapshot: Snapshot; preview: UndoPreview } | null {
  const snapshot = getNthSnapshot(projectPath, n);
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
      const currentPath = join(projectPath, f);
      const snapPath = join(snapshot.snapshotPath, f);
      if (filesEqual(currentPath, snapPath)) {
        unchanged.push(f);
      } else {
        modified.push(f);
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
export function executeUndo(projectPath: string, n = 1, removeNewFiles = true): Snapshot | null {
  const snapshot = getNthSnapshot(projectPath, n);
  if (!snapshot || !existsSync(snapshot.snapshotPath)) return null;

  const ignorePatterns = loadIgnorePatterns(projectPath);

  // If removeNewFiles, delete files that didn't exist in the snapshot
  if (removeNewFiles) {
    const currentFileList = getAllFiles(projectPath, projectPath, ignorePatterns);
    const snapshotFileSet = new Set(getAllFiles(snapshot.snapshotPath, snapshot.snapshotPath));

    for (const f of currentFileList) {
      if (!snapshotFileSet.has(f)) {
        const fullPath = join(projectPath, f);
        rmSync(fullPath, { force: true });
      }
    }
  }

  // Restore all files from snapshot
  cowRestoreDir(snapshot.snapshotPath, projectPath);

  return snapshot;
}
