import { mkdirSync, writeFileSync, rmSync, copyFileSync, existsSync, constants } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { cowCloneDir } from './core/cow.js';

const TEST_DIR = '/tmp/cowback-benchmark';
const PROJECT = join(TEST_DIR, 'project');
const SNAP_COW = join(TEST_DIR, 'snap-cow');
const SNAP_COPY = join(TEST_DIR, 'snap-copy');
const SNAP_GIT = join(TEST_DIR, 'snap-git');

function setup(fileCount: number, fileSizeKB: number) {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(join(PROJECT, 'src'), { recursive: true });

  const content = Buffer.alloc(fileSizeKB * 1024, 'x');
  for (let i = 0; i < fileCount; i++) {
    const subdir = `src/dir${Math.floor(i / 100)}`;
    mkdirSync(join(PROJECT, subdir), { recursive: true });
    writeFileSync(join(PROJECT, subdir, `file${i}.ts`), content);
  }
}

function cleanup() {
  rmSync(TEST_DIR, { recursive: true, force: true });
}

function time(label: string, fn: () => void): number {
  const start = performance.now();
  fn();
  const elapsed = performance.now() - start;
  return elapsed;
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function getDirSize(dir: string): string {
  try {
    const out = execSync(`du -sh "${dir}" 2>/dev/null`, { encoding: 'utf-8' });
    return out.split('\t')[0].trim();
  } catch {
    return '?';
  }
}

function runBenchmark(fileCount: number, fileSizeKB: number) {
  console.log(`\n--- ${fileCount} files x ${fileSizeKB}KB each ---`);
  setup(fileCount, fileSizeKB);

  const projectSize = getDirSize(PROJECT);
  console.log(`Project size: ${projectSize}`);

  // Method 1: CoW clone (our method)
  const cowTime = time('CoW clone', () => {
    cowCloneDir(PROJECT, SNAP_COW, ['.git', 'node_modules']);
  });

  // Method 2: Regular file copy
  const copyTime = time('File copy', () => {
    execSync(`cp -r "${PROJECT}" "${SNAP_COPY}"`, { stdio: 'pipe' });
  });

  // Method 3: Git stash
  let gitTime: number;
  try {
    execSync(`cd "${PROJECT}" && git init && git add -A && git commit -m "init" 2>/dev/null`, {
      stdio: 'pipe',
    });
    gitTime = time('Git stash', () => {
      execSync(`cd "${PROJECT}" && git stash`, { stdio: 'pipe' });
    });
  } catch {
    gitTime = -1;
  }

  // Results
  const cowSize = getDirSize(SNAP_COW);
  const copySize = getDirSize(SNAP_COPY);

  console.log('');
  console.log('Method          Time          Disk Usage');
  console.log('─'.repeat(50));
  console.log(`cowback (CoW)   ${formatMs(cowTime).padEnd(14)}${cowSize}`);
  console.log(`File copy       ${formatMs(copyTime).padEnd(14)}${copySize}`);
  if (gitTime >= 0) {
    console.log(`Git stash       ${formatMs(gitTime).padEnd(14)}(in .git)`);
  }
  console.log('');
  console.log(`CoW is ${(copyTime / cowTime).toFixed(1)}x faster than file copy`);

  cleanup();
}

console.log('🐄 Cowback Benchmark');
console.log('====================');

runBenchmark(100, 10);
runBenchmark(1000, 10);
runBenchmark(5000, 10);
