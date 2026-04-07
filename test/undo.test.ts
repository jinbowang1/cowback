import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createSnapshot } from '../src/core/snapshot.js';
import { previewDiff, previewUndo, executeUndo } from '../src/core/undo.js';
import { getHead } from '../src/core/store.js';

import { realpathSync } from 'node:fs';
const TEST_DIR = realpathSync('/tmp') + '/cowback-test-undo';

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
  const { homedir } = require('node:os');
  const dbPath = join(homedir(), '.cowback', 'snapshots.json');
  if (existsSync(dbPath)) writeFileSync(dbPath, '[]');
  const headPath = join(homedir(), '.cowback', 'head.json');
  if (existsSync(headPath)) writeFileSync(headPath, '{}');
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('previewDiff', () => {
  it('returns null when no snapshots exist', () => {
    expect(previewDiff(TEST_DIR)).toBeNull();
  });

  it('shows changes since HEAD snapshot', () => {
    writeFileSync(join(TEST_DIR, 'a.txt'), 'original');
    createSnapshot(TEST_DIR, 'manual', 'snap1', 999);

    // Modify file — diff should detect it
    writeFileSync(join(TEST_DIR, 'a.txt'), 'changed');
    const result = previewDiff(TEST_DIR);
    expect(result).not.toBeNull();
    expect(result!.preview.modified).toContain('a.txt');
  });

  it('works with only one snapshot', () => {
    writeFileSync(join(TEST_DIR, 'a.txt'), 'hello');
    createSnapshot(TEST_DIR, 'manual', 'only one', 999);

    writeFileSync(join(TEST_DIR, 'b.txt'), 'new');
    const result = previewDiff(TEST_DIR);
    expect(result).not.toBeNull();
    expect(result!.preview.added).toContain('b.txt');
    expect(result!.preview.unchanged).toContain('a.txt');
  });

  it('shows no changes when nothing changed', () => {
    writeFileSync(join(TEST_DIR, 'a.txt'), 'same');
    createSnapshot(TEST_DIR, 'manual', 'snap1', 999);

    const result = previewDiff(TEST_DIR);
    expect(result).not.toBeNull();
    expect(result!.preview.modified).toHaveLength(0);
    expect(result!.preview.deleted).toHaveLength(0);
    expect(result!.preview.added).toHaveLength(0);
  });
});

describe('previewUndo', () => {
  it('returns null when no snapshots exist', () => {
    expect(previewUndo(TEST_DIR)).toBeNull();
  });

  it('works with one snapshot (undo to it)', () => {
    writeFileSync(join(TEST_DIR, 'a.txt'), 'original');
    createSnapshot(TEST_DIR, 'manual', 'only one', 999);

    writeFileSync(join(TEST_DIR, 'a.txt'), 'changed');
    const result = previewUndo(TEST_DIR);
    expect(result).not.toBeNull();
    expect(result!.preview.modified).toContain('a.txt');
  });

  it('shows files to restore and remove', () => {
    writeFileSync(join(TEST_DIR, 'a.txt'), 'original');
    writeFileSync(join(TEST_DIR, 'b.txt'), 'keep');
    createSnapshot(TEST_DIR, 'manual', 'snap1', 999);

    // Make changes (no new snapshot — undo should go back to snap1)
    rmSync(join(TEST_DIR, 'a.txt'));
    writeFileSync(join(TEST_DIR, 'c.txt'), 'new junk');

    const result = previewUndo(TEST_DIR);
    expect(result).not.toBeNull();
    expect(result!.preview.deleted).toContain('a.txt');
    expect(result!.preview.unchanged).toContain('b.txt');
    expect(result!.preview.added).toContain('c.txt');
  });
});

describe('executeUndo', () => {
  it('single snapshot: undo restores to it', () => {
    writeFileSync(join(TEST_DIR, 'a.txt'), 'original');
    createSnapshot(TEST_DIR, 'manual', 'snap1', 999);

    writeFileSync(join(TEST_DIR, 'a.txt'), 'broken');
    executeUndo(TEST_DIR);
    expect(readFileSync(join(TEST_DIR, 'a.txt'), 'utf-8')).toBe('original');
  });

  it('consecutive undos go further back', () => {
    writeFileSync(join(TEST_DIR, 'a.txt'), 'v1');
    createSnapshot(TEST_DIR, 'manual', 'snap1', 999);

    writeFileSync(join(TEST_DIR, 'a.txt'), 'v2');
    createSnapshot(TEST_DIR, 'manual', 'snap2', 999);

    writeFileSync(join(TEST_DIR, 'a.txt'), 'v3');
    createSnapshot(TEST_DIR, 'manual', 'snap3', 999);

    writeFileSync(join(TEST_DIR, 'a.txt'), 'v4-broken');

    // First undo → snap3 (v3)
    executeUndo(TEST_DIR);
    expect(readFileSync(join(TEST_DIR, 'a.txt'), 'utf-8')).toBe('v3');

    // Second undo → snap2 (v2)
    executeUndo(TEST_DIR);
    expect(readFileSync(join(TEST_DIR, 'a.txt'), 'utf-8')).toBe('v2');

    // Third undo → snap1 (v1)
    executeUndo(TEST_DIR);
    expect(readFileSync(join(TEST_DIR, 'a.txt'), 'utf-8')).toBe('v1');
  });

  it('returns null when already at oldest snapshot', () => {
    writeFileSync(join(TEST_DIR, 'a.txt'), 'v1');
    createSnapshot(TEST_DIR, 'manual', 'snap1', 999);

    executeUndo(TEST_DIR); // → snap1
    expect(executeUndo(TEST_DIR)).toBeNull(); // can't go further
  });

  it('new snapshot resets HEAD to latest', () => {
    writeFileSync(join(TEST_DIR, 'a.txt'), 'v1');
    createSnapshot(TEST_DIR, 'manual', 'snap1', 999);

    writeFileSync(join(TEST_DIR, 'a.txt'), 'v2');
    createSnapshot(TEST_DIR, 'manual', 'snap2', 999);

    // Undo to snap1
    executeUndo(TEST_DIR);
    expect(getHead(TEST_DIR)).not.toBeNull();

    // New snapshot → HEAD resets
    writeFileSync(join(TEST_DIR, 'a.txt'), 'v3');
    createSnapshot(TEST_DIR, 'manual', 'snap3', 999);
    expect(getHead(TEST_DIR)).toBeNull(); // null = at latest
  });

  it('removes files created after snapshot', () => {
    writeFileSync(join(TEST_DIR, 'original.txt'), 'keep');
    createSnapshot(TEST_DIR, 'manual', 'snap1', 999);

    writeFileSync(join(TEST_DIR, 'junk.txt'), 'agent created this');

    executeUndo(TEST_DIR, true);
    expect(existsSync(join(TEST_DIR, 'original.txt'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'junk.txt'))).toBe(false);
  });

  it('keeps new files when removeNewFiles=false', () => {
    writeFileSync(join(TEST_DIR, 'original.txt'), 'keep');
    createSnapshot(TEST_DIR, 'manual', 'snap1', 999);

    writeFileSync(join(TEST_DIR, 'new.txt'), 'keep this too');

    executeUndo(TEST_DIR, false);
    expect(existsSync(join(TEST_DIR, 'new.txt'))).toBe(true);
  });

  it('returns null when no snapshots exist', () => {
    expect(executeUndo(TEST_DIR)).toBeNull();
  });

  it('full e2e: snapshot → destroy → undo', () => {
    mkdirSync(join(TEST_DIR, 'src'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'src', 'index.ts'), 'export const main = () => {}');
    writeFileSync(join(TEST_DIR, 'src', 'utils.ts'), 'export const helper = () => {}');
    writeFileSync(join(TEST_DIR, 'package.json'), '{"name": "myapp"}');
    createSnapshot(TEST_DIR, 'manual', 'before agent', 999);

    // Agent destroys everything
    rmSync(join(TEST_DIR, 'src'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'package.json'), 'BROKEN');
    writeFileSync(join(TEST_DIR, 'garbage.tmp'), 'agent junk');

    // Undo — goes back to "before agent" snapshot
    executeUndo(TEST_DIR);

    // Verify full recovery
    expect(readFileSync(join(TEST_DIR, 'src', 'index.ts'), 'utf-8')).toBe('export const main = () => {}');
    expect(readFileSync(join(TEST_DIR, 'src', 'utils.ts'), 'utf-8')).toBe('export const helper = () => {}');
    expect(readFileSync(join(TEST_DIR, 'package.json'), 'utf-8')).toBe('{"name": "myapp"}');
    expect(existsSync(join(TEST_DIR, 'garbage.tmp'))).toBe(false);
  });
});
