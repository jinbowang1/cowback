import { readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const BUILTIN_IGNORE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '__pycache__',
  '.env',
  '.DS_Store',
  '.cowback',
  '.bun',
  '.npm',
  '.cache',
  '.Trash',
  'Library',
];

export function loadIgnorePatterns(projectPath: string): string[] {
  const patterns = [...BUILTIN_IGNORE];

  // Load .cowbackignore
  const ignoreFile = join(projectPath, '.cowbackignore');
  if (existsSync(ignoreFile)) {
    const lines = readFileSync(ignoreFile, 'utf-8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    patterns.push(...lines);
  }

  return [...new Set(patterns)];
}

export function shouldIgnore(filePath: string, projectPath: string, patterns: string[]): boolean {
  const rel = relative(projectPath, filePath);
  const basename = rel.split('/').pop() ?? '';
  return patterns.some((p) => {
    const clean = p.replace(/\/$/, '');
    // Glob pattern (e.g. *.pyc)
    if (clean.startsWith('*')) {
      const ext = clean.slice(1); // ".pyc"
      return basename.endsWith(ext);
    }
    // Match directory prefix or exact file
    return rel === clean || rel.startsWith(clean + '/') || rel.endsWith(clean);
  });
}
