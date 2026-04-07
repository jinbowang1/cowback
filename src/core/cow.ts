import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  existsSync,
  rmSync,
  constants,
} from 'node:fs';
import { join, relative } from 'node:path';
import { shouldIgnore } from './ignore.js';

/**
 * Copy-on-Write engine.
 *
 * Uses fs.copyFileSync with COPYFILE_FICLONE flag.
 * On APFS (macOS) this triggers clonefile() — near-instant, zero disk cost.
 * On BTRFS/XFS (Linux) this triggers FICLONE ioctl — same effect.
 * Falls back to regular copy on unsupported filesystems.
 */

/** Recursively clone a directory tree using CoW */
export function cowCloneDir(
  src: string,
  dst: string,
  ignorePatterns: string[],
  basePath: string = src
): number {
  mkdirSync(dst, { recursive: true });
  let fileCount = 0;

  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);

    if (shouldIgnore(srcPath, basePath, ignorePatterns)) continue;

    if (entry.isDirectory()) {
      mkdirSync(dstPath, { recursive: true }); // preserve empty dirs
      fileCount += cowCloneDir(srcPath, dstPath, ignorePatterns, basePath);
    } else if (entry.isFile()) {
      copyFileSync(srcPath, dstPath, constants.COPYFILE_FICLONE);
      fileCount++;
    } else if (entry.isSymbolicLink()) {
      // Copy symlinks as regular files
      copyFileSync(srcPath, dstPath, constants.COPYFILE_FICLONE);
      fileCount++;
    }
  }

  return fileCount;
}

/** Restore files from a snapshot back to the project */
export function cowRestoreDir(snapshotDir: string, projectDir: string): void {
  // First, remove everything in project (that's not ignored)
  // Then copy everything from snapshot back
  const entries = readdirSync(snapshotDir, { withFileTypes: true });
  for (const entry of entries) {
    const snapPath = join(snapshotDir, entry.name);
    const projPath = join(projectDir, entry.name);

    if (entry.isDirectory()) {
      mkdirSync(projPath, { recursive: true });
      cowRestoreDir(snapPath, projPath);
    } else {
      mkdirSync(projectDir, { recursive: true });
      copyFileSync(snapPath, projPath, constants.COPYFILE_FICLONE);
    }
  }
}

/** Get all files and empty directories recursively (relative paths) */
export function getAllFiles(dir: string, basePath: string = dir, ignorePatterns: string[] = []): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (shouldIgnore(fullPath, basePath, ignorePatterns)) continue;

    if (entry.isDirectory()) {
      const children = getAllFiles(fullPath, basePath, ignorePatterns);
      if (children.length === 0) {
        // Empty directory — track it with trailing /
        files.push(relative(basePath, fullPath) + '/');
      } else {
        files.push(...children);
      }
    } else {
      files.push(relative(basePath, fullPath));
    }
  }
  return files;
}

/** Check if CoW (FICLONE/clonefile) is supported */
export function checkCowSupport(testDir: string): boolean {
  const testSrc = join(testDir, '.cowback-test-src');
  const testDst = join(testDir, '.cowback-test-dst');
  try {
    const { writeFileSync, unlinkSync } = require('node:fs');
    writeFileSync(testSrc, 'test');
    copyFileSync(testSrc, testDst, constants.COPYFILE_FICLONE);
    unlinkSync(testSrc);
    unlinkSync(testDst);
    return true;
  } catch {
    try {
      rmSync(testSrc, { force: true });
      rmSync(testDst, { force: true });
    } catch {}
    return false;
  }
}
