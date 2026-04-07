import { resolve } from 'node:path';
import { cowCloneDir, getAllFiles } from './cow.js';
import { loadIgnorePatterns } from './ignore.js';
import { addSnapshot, getSnapshotDir, autoClean } from './store.js';
import type { Snapshot } from './types.js';

/** Create a CoW snapshot of the project directory */
export function createSnapshot(
  projectPath: string,
  trigger: Snapshot['trigger'] = 'manual',
  label?: string,
  maxSnapshots = 20
): Snapshot {
  const absPath = resolve(projectPath);
  const id = `snap-${Date.now()}`;
  const snapshotPath = getSnapshotDir(absPath, id);
  const ignorePatterns = loadIgnorePatterns(absPath);

  const fileCount = cowCloneDir(absPath, snapshotPath, ignorePatterns);

  const snapshot: Snapshot = {
    id,
    projectPath: absPath,
    snapshotPath,
    timestamp: Date.now(),
    trigger,
    fileCount,
    label,
  };

  addSnapshot(snapshot);
  autoClean(absPath, maxSnapshots);

  return snapshot;
}
