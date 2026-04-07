import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

/** Generate Claude Code hook configuration */
export function initClaudeCode(projectPath: string) {
  const settingsDir = join(homedir(), '.claude');
  const settingsFile = join(settingsDir, 'settings.json');

  const hookCommand = `cowback snapshot --trigger hook --path "${resolve(projectPath)}"`;

  let settings: any = {};
  if (existsSync(settingsFile)) {
    settings = JSON.parse(readFileSync(settingsFile, 'utf-8'));
  }

  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];

  // Check if already configured
  const existing = settings.hooks.PreToolUse.find(
    (h: any) => h.command && h.command.includes('cowback')
  );

  if (existing) {
    console.log('[cowback] Claude Code hook already configured.');
    return;
  }

  settings.hooks.PreToolUse.push({
    matcher: 'Write|Edit|Bash',
    command: hookCommand,
  });

  mkdirSync(settingsDir, { recursive: true });
  writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  console.log('[cowback] Claude Code hook configured!');
  console.log(`  Hook: PreToolUse → ${hookCommand}`);
  console.log('  Cowback will auto-snapshot before Write, Edit, and Bash operations.');
}

/** Print instructions for other agents */
export function initGeneric(agent: string) {
  console.log(`[cowback] Setup instructions for ${agent}:`);
  console.log('');
  switch (agent) {
    case 'openclaw':
      console.log('  Add to your OpenClaw config:');
      console.log('  {');
      console.log('    "hooks": {');
      console.log('      "pre_tool": "cowback snapshot --trigger hook"');
      console.log('    }');
      console.log('  }');
      break;
    case 'cursor':
      console.log('  Add to VS Code tasks.json or use the Cursor extension (coming soon).');
      console.log('  For now, run `cowback on` in a terminal alongside Cursor.');
      break;
    default:
      console.log('  Option 1: Run `cowback on` in a terminal (auto-snapshots on file changes)');
      console.log('  Option 2: Run `cowback exec <your-agent-command>` to wrap execution');
      console.log('  Option 3: Add `cowback snapshot` to your agent\'s pre-operation hook');
  }
}
