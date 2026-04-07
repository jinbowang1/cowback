import { describe, it, expect } from 'vitest';
import { shouldIgnore } from '../src/core/ignore.js';

describe('shouldIgnore', () => {
  const base = '/project';
  const patterns = ['node_modules', '.git', 'dist', '.env', '*.pyc'];

  it('ignores node_modules', () => {
    expect(shouldIgnore('/project/node_modules/pkg/index.js', base, patterns)).toBe(true);
  });

  it('ignores .git', () => {
    expect(shouldIgnore('/project/.git/config', base, patterns)).toBe(true);
  });

  it('ignores dist', () => {
    expect(shouldIgnore('/project/dist/bundle.js', base, patterns)).toBe(true);
  });

  it('ignores .env', () => {
    expect(shouldIgnore('/project/.env', base, patterns)).toBe(true);
  });

  it('ignores .pyc files', () => {
    expect(shouldIgnore('/project/module.pyc', base, patterns)).toBe(true);
  });

  it('keeps normal source files', () => {
    expect(shouldIgnore('/project/src/index.ts', base, patterns)).toBe(false);
  });

  it('keeps package.json', () => {
    expect(shouldIgnore('/project/package.json', base, patterns)).toBe(false);
  });

  it('keeps nested source files', () => {
    expect(shouldIgnore('/project/src/core/utils.ts', base, patterns)).toBe(false);
  });
});
