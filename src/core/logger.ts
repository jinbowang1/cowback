import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const LOG_DIR = join(homedir(), '.cowback');
const LOG_FILE = join(LOG_DIR, 'cowback.log');

export function log(action: string, detail: string) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${timestamp}] ${action}: ${detail}\n`;
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_FILE, line);
  } catch {}
}
