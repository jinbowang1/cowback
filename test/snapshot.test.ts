import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createSnapshot } from '../src/core/snapshot.js';
import { getSnapshots, getLatestSnapshot, getNthSnapshot, autoClean } from '../src/core/store.js';

import { realpathSync } from 'node:fs';
const TEST_DIR = realpathSync('/tmp') + '/cowback-test-snapshot';

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
  const { homedir } = require('node:os');
  const dbPath = join(homedir(), '.cowback', 'snapshots.json');
  if (existsSync(dbPath)) writeFileSync(dbPath, '[]');
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('createSnapshot', () => {
  it('creates a snapshot with correct metadata', () => {
    writeFileSync(join(TEST_DIR, 'a.txt'), 'hello');
    writeFileSync(join(TEST_DIR, 'b.txt'), 'world');

    const snap = createSnapshot(TEST_DIR, 'manual', 'test snapshot');
    expect(snap.id).toMatch(/^snap-\d+-[a-f0-9]+$/);
    expect(snap.projectPath).toBe(TEST_DIR);
    expect(snap.trigger).toBe('manual');
    expect(snap.label).toBe('test snapshot');
    expect(snap.fileCount).toBe(2);
    expect(existsSync(snap.snapshotPath)).toBe(true);
  });

  it('snapshot files are independent copies', () => {
    writeFileSync(join(TEST_DIR, 'a.txt'), 'original');
    const snap = createSnapshot(TEST_DIR);

    writeFileSync(join(TEST_DIR, 'a.txt'), 'modified');
    expect(readFileSync(join(snap.snapshotPath, 'a.txt'), 'utf-8')).toBe('original');
  });

  it('ignores node_modules by default', () => {
    writeFileSync(join(TEST_DIR, 'keep.txt'), 'keep');
    mkdirSync(join(TEST_DIR, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'node_modules', 'pkg', 'index.js'), 'junk');

    const snap = createSnapshot(TEST_DIR);
    expect(snap.fileCount).toBe(1);
    expect(existsSync(join(snap.snapshotPath, 'node_modules'))).toBe(false);
  });
});

describe('getSnapshots', () => {
  it('returns snapshots sorted by timestamp', () => {
    writeFileSync(join(TEST_DIR, 'a.txt'), 'v1');
    const s1 = createSnapshot(TEST_DIR, 'manual', 'first');

    writeFileSync(join(TEST_DIR, 'a.txt'), 'v2');
    const s2 = createSnapshot(TEST_DIR, 'manual', 'second');

    const snaps = getSnapshots(TEST_DIR);
    expect(snaps.length).toBe(2);
    expect(snaps[0].id).toBe(s1.id);
    expect(snaps[1].id).toBe(s2.id);
  });

  it('returns empty array for unknown project', () => {
    expect(getSnapshots('/tmp/nonexistent-project-xyz')).toEqual([]);
  });
});

describe('getLatestSnapshot / getNthSnapshot', () => {
  it('getLatestSnapshot returns most recent', () => {
    writeFileSync(join(TEST_DIR, 'a.txt'), 'v1');
    createSnapshot(TEST_DIR, 'manual', 'first');
    writeFileSync(join(TEST_DIR, 'a.txt'), 'v2');
    const s2 = createSnapshot(TEST_DIR, 'manual', 'second');

    expect(getLatestSnapshot(TEST_DIR)?.id).toBe(s2.id);
  });

  it('getNthSnapshot returns correct snapshot', () => {
    writeFileSync(join(TEST_DIR, 'a.txt'), 'v1');
    const s1 = createSnapshot(TEST_DIR, 'manual', 'first');
    writeFileSync(join(TEST_DIR, 'a.txt'), 'v2');
    const s2 = createSnapshot(TEST_DIR, 'manual', 'second');

    expect(getNthSnapshot(TEST_DIR, 1)?.id).toBe(s2.id);
    expect(getNthSnapshot(TEST_DIR, 2)?.id).toBe(s1.id);
    expect(getNthSnapshot(TEST_DIR, 3)).toBeUndefined();
  });
});

describe('autoClean', () => {
  it('removes oldest snapshots when over limit', () => {
    writeFileSync(join(TEST_DIR, 'a.txt'), '');

    for (let i = 0; i < 5; i++) {
      createSnapshot(TEST_DIR, 'manual', `snap-${i}`, 999); // high limit to avoid auto-clean during create
    }
    expect(getSnapshots(TEST_DIR).length).toBe(5);

    const removed = autoClean(TEST_DIR, 3);
    expect(removed).toBe(2);
    expect(getSnapshots(TEST_DIR).length).toBe(3);
  });

  it('does nothing when under limit', () => {
    writeFileSync(join(TEST_DIR, 'a.txt'), '');
    createSnapshot(TEST_DIR, 'manual', 'only one', 999);

    const removed = autoClean(TEST_DIR, 20);
    expect(removed).toBe(0);
  });
});
