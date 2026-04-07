import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createSnapshot } from '../src/core/snapshot.js';
import { previewUndo, executeUndo } from '../src/core/undo.js';

import { realpathSync } from 'node:fs';
const TEST_DIR = realpathSync('/tmp') + '/cowback-test-undo';

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
  // Clear entire snapshot DB to avoid cross-test interference
  const { homedir } = require('node:os');
  const dbPath = join(homedir(), '.cowback', 'snapshots.json');
  if (existsSync(dbPath)) writeFileSync(dbPath, '[]');
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('previewUndo', () => {
  it('returns null when no snapshots exist', () => {
    expect(previewUndo(TEST_DIR)).toBeNull();
  });

  it('shows files to restore and remove', () => {
    writeFileSync(join(TEST_DIR, 'a.txt'), 'original');
    writeFileSync(join(TEST_DIR, 'b.txt'), 'keep');
    createSnapshot(TEST_DIR, 'manual', 'baseline', 999);

    // Simulate agent: delete a.txt, create c.txt
    rmSync(join(TEST_DIR, 'a.txt'));
    writeFileSync(join(TEST_DIR, 'c.txt'), 'new junk');

    const result = previewUndo(TEST_DIR);
    expect(result).not.toBeNull();
    expect(result!.preview.restored).toContain('a.txt');
    expect(result!.preview.restored).toContain('b.txt');
    expect(result!.preview.removed).toContain('c.txt');
  });
});

describe('executeUndo', () => {
  it('restores deleted files', () => {
    writeFileSync(join(TEST_DIR, 'a.txt'), 'important data');
    createSnapshot(TEST_DIR, 'manual', 'before delete', 999);

    rmSync(join(TEST_DIR, 'a.txt'));
    expect(existsSync(join(TEST_DIR, 'a.txt'))).toBe(false);

    executeUndo(TEST_DIR);
    expect(readFileSync(join(TEST_DIR, 'a.txt'), 'utf-8')).toBe('important data');
  });

  it('restores modified files', () => {
    writeFileSync(join(TEST_DIR, 'config.json'), '{"port": 3000}');
    createSnapshot(TEST_DIR, 'manual', 'before edit', 999);

    writeFileSync(join(TEST_DIR, 'config.json'), 'CORRUPTED');

    executeUndo(TEST_DIR);
    expect(readFileSync(join(TEST_DIR, 'config.json'), 'utf-8')).toBe('{"port": 3000}');
  });

  it('removes files created after snapshot', () => {
    writeFileSync(join(TEST_DIR, 'original.txt'), 'keep');
    createSnapshot(TEST_DIR, 'manual', 'before new files', 999);

    writeFileSync(join(TEST_DIR, 'junk.txt'), 'agent created this');

    executeUndo(TEST_DIR, 1, true);
    expect(existsSync(join(TEST_DIR, 'original.txt'))).toBe(true);
    expect(existsSync(join(TEST_DIR, 'junk.txt'))).toBe(false);
  });

  it('keeps new files when removeNewFiles=false', () => {
    writeFileSync(join(TEST_DIR, 'original.txt'), 'keep');
    createSnapshot(TEST_DIR, 'manual', 'baseline', 999);

    writeFileSync(join(TEST_DIR, 'new.txt'), 'keep this too');

    executeUndo(TEST_DIR, 1, false);
    expect(existsSync(join(TEST_DIR, 'new.txt'))).toBe(true);
  });

  it('handles undo N steps back', () => {
    writeFileSync(join(TEST_DIR, 'a.txt'), 'v1');
    createSnapshot(TEST_DIR, 'manual', 'step 1', 999);

    writeFileSync(join(TEST_DIR, 'a.txt'), 'v2');
    createSnapshot(TEST_DIR, 'manual', 'step 2', 999);

    writeFileSync(join(TEST_DIR, 'a.txt'), 'v3');
    createSnapshot(TEST_DIR, 'manual', 'step 3', 999);

    writeFileSync(join(TEST_DIR, 'a.txt'), 'v4-broken');

    // Undo 1 step → v3
    executeUndo(TEST_DIR, 1);
    expect(readFileSync(join(TEST_DIR, 'a.txt'), 'utf-8')).toBe('v3');
  });

  it('undo 2 steps back restores to correct version', () => {
    writeFileSync(join(TEST_DIR, 'a.txt'), 'v1');
    createSnapshot(TEST_DIR, 'manual', 'step 1', 999);

    writeFileSync(join(TEST_DIR, 'a.txt'), 'v2');
    createSnapshot(TEST_DIR, 'manual', 'step 2', 999);

    writeFileSync(join(TEST_DIR, 'a.txt'), 'v3-broken');

    // step1 snapshot has v1, step2 has v2. getNthSnapshot(2) = step1 → v1
    executeUndo(TEST_DIR, 2);
    expect(readFileSync(join(TEST_DIR, 'a.txt'), 'utf-8')).toBe('v1');
  });

  it('returns null when no snapshots exist', () => {
    expect(executeUndo(TEST_DIR)).toBeNull();
  });

  it('full e2e: snapshot → destroy → undo', () => {
    // Setup project
    mkdirSync(join(TEST_DIR, 'src'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'src', 'index.ts'), 'export const main = () => {}');
    writeFileSync(join(TEST_DIR, 'src', 'utils.ts'), 'export const helper = () => {}');
    writeFileSync(join(TEST_DIR, 'package.json'), '{"name": "myapp"}');

    // Snapshot
    createSnapshot(TEST_DIR, 'manual', 'before agent', 999);

    // Agent destroys everything
    rmSync(join(TEST_DIR, 'src'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'package.json'), 'BROKEN');
    writeFileSync(join(TEST_DIR, 'garbage.tmp'), 'agent junk');

    // Verify destruction
    expect(existsSync(join(TEST_DIR, 'src', 'index.ts'))).toBe(false);
    expect(readFileSync(join(TEST_DIR, 'package.json'), 'utf-8')).toBe('BROKEN');

    // Undo
    executeUndo(TEST_DIR);

    // Verify full recovery
    expect(readFileSync(join(TEST_DIR, 'src', 'index.ts'), 'utf-8')).toBe('export const main = () => {}');
    expect(readFileSync(join(TEST_DIR, 'src', 'utils.ts'), 'utf-8')).toBe('export const helper = () => {}');
    expect(readFileSync(join(TEST_DIR, 'package.json'), 'utf-8')).toBe('{"name": "myapp"}');
    expect(existsSync(join(TEST_DIR, 'garbage.tmp'))).toBe(false);
  });
});
