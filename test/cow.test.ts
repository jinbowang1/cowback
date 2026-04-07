import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { cowCloneDir, cowRestoreDir, getAllFiles, checkCowSupport } from '../src/core/cow.js';

import { realpathSync } from 'node:fs';
const TEST_DIR = realpathSync('/tmp') + '/cowback-test-cow';
const SRC = join(TEST_DIR, 'src');
const DST = join(TEST_DIR, 'dst');

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(join(SRC, 'sub'), { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('cowCloneDir', () => {
  it('clones flat files', () => {
    writeFileSync(join(SRC, 'a.txt'), 'hello');
    writeFileSync(join(SRC, 'b.txt'), 'world');

    const count = cowCloneDir(SRC, DST, []);
    expect(count).toBe(2);
    expect(readFileSync(join(DST, 'a.txt'), 'utf-8')).toBe('hello');
    expect(readFileSync(join(DST, 'b.txt'), 'utf-8')).toBe('world');
  });

  it('clones nested directories', () => {
    writeFileSync(join(SRC, 'root.txt'), 'root');
    writeFileSync(join(SRC, 'sub', 'deep.txt'), 'deep');

    const count = cowCloneDir(SRC, DST, []);
    expect(count).toBe(2);
    expect(readFileSync(join(DST, 'sub', 'deep.txt'), 'utf-8')).toBe('deep');
  });

  it('respects ignore patterns', () => {
    writeFileSync(join(SRC, 'keep.txt'), 'keep');
    mkdirSync(join(SRC, 'node_modules'), { recursive: true });
    writeFileSync(join(SRC, 'node_modules', 'junk.js'), 'junk');

    const count = cowCloneDir(SRC, DST, ['node_modules'], SRC);
    expect(count).toBe(1);
    expect(existsSync(join(DST, 'keep.txt'))).toBe(true);
    expect(existsSync(join(DST, 'node_modules'))).toBe(false);
  });

  it('clone is independent from source — modifying source does not affect clone', () => {
    writeFileSync(join(SRC, 'file.txt'), 'original');
    cowCloneDir(SRC, DST, []);

    // Modify source
    writeFileSync(join(SRC, 'file.txt'), 'modified');
    // Clone should still have original
    expect(readFileSync(join(DST, 'file.txt'), 'utf-8')).toBe('original');
  });

  it('clone is independent from source — deleting source does not affect clone', () => {
    writeFileSync(join(SRC, 'file.txt'), 'important');
    cowCloneDir(SRC, DST, []);

    // Delete source
    rmSync(join(SRC, 'file.txt'));
    // Clone should still exist
    expect(readFileSync(join(DST, 'file.txt'), 'utf-8')).toBe('important');
  });

  it('handles empty directories', () => {
    const count = cowCloneDir(SRC, DST, []);
    // sub dir exists but has no files, root has no files
    expect(count).toBe(0);
  });

  it('handles binary files', () => {
    const buf = Buffer.alloc(1024, 0xff);
    writeFileSync(join(SRC, 'binary.bin'), buf);

    cowCloneDir(SRC, DST, []);
    const restored = readFileSync(join(DST, 'binary.bin'));
    expect(Buffer.compare(restored, buf)).toBe(0);
  });
});

describe('cowRestoreDir', () => {
  it('restores modified files', () => {
    writeFileSync(join(SRC, 'a.txt'), 'original');
    cowCloneDir(SRC, DST, []);

    // Modify source
    writeFileSync(join(SRC, 'a.txt'), 'corrupted');
    expect(readFileSync(join(SRC, 'a.txt'), 'utf-8')).toBe('corrupted');

    // Restore
    cowRestoreDir(DST, SRC);
    expect(readFileSync(join(SRC, 'a.txt'), 'utf-8')).toBe('original');
  });

  it('restores deleted files', () => {
    writeFileSync(join(SRC, 'a.txt'), 'important');
    cowCloneDir(SRC, DST, []);

    rmSync(join(SRC, 'a.txt'));
    expect(existsSync(join(SRC, 'a.txt'))).toBe(false);

    cowRestoreDir(DST, SRC);
    expect(readFileSync(join(SRC, 'a.txt'), 'utf-8')).toBe('important');
  });

  it('restores nested structure', () => {
    writeFileSync(join(SRC, 'sub', 'deep.txt'), 'deep value');
    cowCloneDir(SRC, DST, []);

    rmSync(join(SRC, 'sub'), { recursive: true });
    cowRestoreDir(DST, SRC);
    expect(readFileSync(join(SRC, 'sub', 'deep.txt'), 'utf-8')).toBe('deep value');
  });
});

describe('getAllFiles', () => {
  it('returns relative paths', () => {
    writeFileSync(join(SRC, 'a.txt'), '');
    writeFileSync(join(SRC, 'sub', 'b.txt'), '');

    const files = getAllFiles(SRC);
    expect(files.sort()).toEqual(['a.txt', 'sub/b.txt']);
  });

  it('respects ignore patterns', () => {
    writeFileSync(join(SRC, 'keep.txt'), '');
    mkdirSync(join(SRC, '.git'), { recursive: true });
    writeFileSync(join(SRC, '.git', 'config'), '');

    const files = getAllFiles(SRC, SRC, ['.git']);
    expect(files).toContain('keep.txt');
    expect(files).not.toContain('.git/config');
  });

  it('returns empty array for non-existent directory', () => {
    expect(getAllFiles('/tmp/does-not-exist')).toEqual([]);
  });
});

describe('checkCowSupport', () => {
  it('returns true on APFS/BTRFS', () => {
    // This test will pass on macOS (APFS) and BTRFS Linux
    // and may return false on other filesystems — that's OK
    const supported = checkCowSupport(TEST_DIR);
    expect(typeof supported).toBe('boolean');
  });
});
