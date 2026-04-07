import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { cowRestoreDir, getAllFiles } from './cow.js';
import { loadIgnorePatterns } from './ignore.js';
import { getSnapshots, getNthSnapshot } from './store.js';
import type { Snapshot, UndoPreview } from './types.js';

/** Preview what undo will do, without actually doing it */
export function previewUndo(projectPath: string, n = 1): { snapshot: Snapshot; preview: UndoPreview } | null {
  const snapshot = getNthSnapshot(projectPath, n);
  if (!snapshot) return null;

  const ignorePatterns = loadIgnorePatterns(projectPath);
  const currentFiles = new Set(getAllFiles(projectPath, projectPath, ignorePatterns));
  const snapshotFiles = new Set(getAllFiles(snapshot.snapshotPath, snapshot.snapshotPath));

  const restored: string[] = [];
  const removed: string[] = [];
  const unchanged: string[] = [];

  // Files in snapshot: restore them
  for (const f of snapshotFiles) {
    if (currentFiles.has(f)) {
      // File exists in both — check if it changed (simple: assume changed)
      restored.push(f);
    } else {
      // File was deleted after snapshot — restore it
      restored.push(f);
    }
  }

  // Files only in current: they were created after snapshot — remove them
  for (const f of currentFiles) {
    if (!snapshotFiles.has(f)) {
      removed.push(f);
    }
  }

  return { snapshot, preview: { restored, removed, unchanged } };
}

/** Execute undo: restore project to snapshot state */
export function executeUndo(projectPath: string, n = 1, removeNewFiles = true): Snapshot | null {
  const snapshot = getNthSnapshot(projectPath, n);
  if (!snapshot || !existsSync(snapshot.snapshotPath)) return null;

  const ignorePatterns = loadIgnorePatterns(projectPath);

  // If removeNewFiles, delete files that didn't exist in the snapshot
  if (removeNewFiles) {
    const currentFiles = getAllFiles(projectPath, projectPath, ignorePatterns);
    const snapshotFiles = new Set(getAllFiles(snapshot.snapshotPath, snapshot.snapshotPath));

    for (const f of currentFiles) {
      if (!snapshotFiles.has(f)) {
        const fullPath = join(projectPath, f);
        rmSync(fullPath, { force: true });
      }
    }
  }

  // Restore all files from snapshot
  cowRestoreDir(snapshot.snapshotPath, projectPath);

  return snapshot;
}
