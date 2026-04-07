export interface Snapshot {
  id: string;
  /** Absolute path of the watched project directory */
  projectPath: string;
  /** Where the CoW clone is stored */
  snapshotPath: string;
  /** Unix timestamp ms */
  timestamp: number;
  /** How this snapshot was triggered */
  trigger: 'auto' | 'manual' | 'hook';
  /** Number of files in the snapshot */
  fileCount: number;
  /** Optional label */
  label?: string;
}

export interface UndoPreview {
  restored: string[];   // files that will be restored (modified/deleted)
  removed: string[];    // files that will be removed (created after snapshot)
  unchanged: string[];  // files that haven't changed
}

export interface CowbackConfig {
  /** Directory to protect */
  watchPath: string;
  /** Where snapshots are stored */
  storagePath: string;
  /** Max snapshots to keep */
  maxSnapshots: number;
  /** Quiet period (ms) before auto-snapshot */
  quietPeriodMs: number;
  /** Ignore patterns (gitignore syntax) */
  ignorePatterns: string[];
}

export const DEFAULT_CONFIG: CowbackConfig = {
  watchPath: '.',
  storagePath: '~/.cowback/snapshots',
  maxSnapshots: 20,
  quietPeriodMs: 30_000,
  ignorePatterns: [],
};
