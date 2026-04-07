#!/usr/bin/env node

import { resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createSnapshot } from './core/snapshot.js';
import { previewUndo, executeUndo } from './core/undo.js';
import { getSnapshots } from './core/store.js';
import { startWatcher, getDaemonStatus, stopDaemon } from './daemon/watcher.js';
import { initClaudeCode, initGeneric } from './init.js';

const [, , command, ...args] = process.argv;
const projectPath = realpathSync(resolve(args.find((a) => a.startsWith('--path='))?.replace('--path=', '') ?? '.'));
const trigger = (args.find((a) => a.startsWith('--trigger='))?.replace('--trigger=', '') ?? 'manual') as 'manual' | 'hook' | 'auto';

function printLogo() {
  console.log('🐄 cowback — The missing Ctrl+Z for AI Agents');
  console.log('');
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString();
}

function formatAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

async function main() {
  switch (command) {
    // ==================== Fool mode ====================

    case 'on': {
      printLogo();
      const status = getDaemonStatus();
      if (status.running) {
        console.log(`Already running (PID ${status.pid}), watching: ${status.projectPath}`);
        break;
      }
      console.log(`Protecting: ${projectPath}`);
      console.log('Press Ctrl+C to stop.\n');
      startWatcher(projectPath);
      break;
    }

    case 'off': {
      const stopped = stopDaemon();
      if (stopped) {
        console.log('[cowback] Protection stopped.');
      } else {
        console.log('[cowback] Not running.');
      }
      break;
    }

    case 'status': {
      const status = getDaemonStatus();
      if (status.running) {
        console.log(`[cowback] Running (PID ${status.pid})`);
        console.log(`  Watching: ${status.projectPath}`);
      } else {
        console.log('[cowback] Not running. Use `cowback on` to start.');
      }
      const snaps = getSnapshots(projectPath);
      console.log(`  Snapshots: ${snaps.length}`);
      if (snaps.length > 0) {
        const latest = snaps[snaps.length - 1];
        console.log(`  Latest: ${latest.id} (${formatAgo(latest.timestamp)}, ${latest.fileCount} files)`);
      }
      break;
    }

    case 'undo': {
      const n = parseInt(args[0]) || 1;
      const result = previewUndo(projectPath, n);

      if (!result) {
        console.log('[cowback] No snapshots to undo to. Run `cowback on` first.');
        break;
      }

      const { snapshot, preview } = result;

      console.log(`[cowback] Undo to: ${snapshot.id} (${formatAgo(snapshot.timestamp)})`);
      if (snapshot.label) console.log(`  Label: ${snapshot.label}`);
      console.log('');

      if (preview.restored.length > 0) {
        console.log(`  Restore: ${preview.restored.length} files`);
        for (const f of preview.restored.slice(0, 10)) console.log(`    ← ${f}`);
        if (preview.restored.length > 10) console.log(`    ... and ${preview.restored.length - 10} more`);
      }
      if (preview.removed.length > 0) {
        console.log(`  Remove:  ${preview.removed.length} files (created after snapshot)`);
        for (const f of preview.removed.slice(0, 10)) console.log(`    ✕ ${f}`);
        if (preview.removed.length > 10) console.log(`    ... and ${preview.removed.length - 10} more`);
      }

      if (preview.restored.length === 0 && preview.removed.length === 0) {
        console.log('  No changes to undo.');
        break;
      }

      // Ask for confirmation
      console.log('');
      process.stdout.write('  Continue? [Y/n] ');

      const { createInterface } = await import('node:readline');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) => {
        rl.on('line', (line) => { resolve(line.trim()); rl.close(); });
      });

      if (answer && answer.toLowerCase() !== 'y') {
        console.log('  Cancelled.');
        break;
      }

      executeUndo(projectPath, n);
      console.log('[cowback] Done! Project restored.');
      break;
    }

    // ==================== Expert mode ====================

    case 'snapshot': {
      const label = args.filter((a) => !a.startsWith('--')).join(' ') || undefined;
      const snap = createSnapshot(projectPath, trigger, label);
      console.log(`[cowback] Snapshot: ${snap.id} (${snap.fileCount} files)`);
      break;
    }

    case 'list': {
      const snaps = getSnapshots(projectPath);
      if (snaps.length === 0) {
        console.log('[cowback] No snapshots.');
        break;
      }
      console.log('ID                    Time                 Trigger  Files  Label');
      console.log('─'.repeat(78));
      for (const s of snaps) {
        const time = formatTime(s.timestamp).padEnd(21);
        const tr = s.trigger.padEnd(9);
        const fc = String(s.fileCount).padEnd(7);
        console.log(`${s.id.padEnd(22)}${time}${tr}${fc}${s.label ?? ''}`);
      }
      break;
    }

    case 'diff': {
      const n = parseInt(args[0]) || 1;
      const result = previewUndo(projectPath, n);
      if (!result) {
        console.log('[cowback] No snapshots.');
        break;
      }
      const { snapshot, preview } = result;
      console.log(`[cowback] Changes since: ${snapshot.id} (${formatAgo(snapshot.timestamp)})`);
      console.log(`  ${preview.restored.length} modified/deleted, ${preview.removed.length} new, ${preview.unchanged.length} unchanged`);
      console.log('');
      for (const f of preview.restored) console.log(`  M  ${f}`);
      for (const f of preview.removed) console.log(`  +  ${f}`);
      if (preview.restored.length === 0 && preview.removed.length === 0) {
        console.log('  (no changes)');
      }
      break;
    }

    case 'clean': {
      const snaps = getSnapshots(projectPath);
      const { removeSnapshot } = await import('./core/store.js');
      for (const s of snaps) removeSnapshot(s.id);
      console.log(`[cowback] Cleaned ${snaps.length} snapshots.`);
      break;
    }

    // ==================== Integration ====================

    case 'init': {
      const agent = args[0] ?? 'claude';
      printLogo();
      switch (agent) {
        case 'claude':
          initClaudeCode(projectPath);
          break;
        default:
          initGeneric(agent);
      }
      break;
    }

    case 'exec': {
      if (args.length === 0) {
        console.error('Usage: cowback exec <command> [args...]');
        process.exit(1);
      }
      // Snapshot before execution
      const snap = createSnapshot(projectPath, 'manual', `pre-exec: ${args[0]}`);
      console.log(`[cowback] Protected. Snapshot: ${snap.id} (${snap.fileCount} files)`);
      console.log(`[cowback] Run \`cowback undo\` if anything goes wrong.\n`);

      const proc = spawn(args[0], args.slice(1), { stdio: 'inherit', shell: true });
      proc.on('close', (code) => process.exit(code ?? 0));
      break;
    }

    // ==================== Benchmark ====================

    case 'benchmark': {
      await import('./benchmark.js');
      break;
    }

    // ==================== Help ====================

    case 'help':
    case '--help':
    case '-h':
    default: {
      printLogo();
      console.log('Simple mode:');
      console.log('  cowback on              Start protection (auto-snapshots on file changes)');
      console.log('  cowback off             Stop protection');
      console.log('  cowback undo [N]        Undo to last snapshot (or N steps back)');
      console.log('  cowback status          Show protection status');
      console.log('');
      console.log('Expert mode:');
      console.log('  cowback snapshot [label] Create a manual snapshot');
      console.log('  cowback list             List all snapshots');
      console.log('  cowback diff [N]         Show changes since snapshot');
      console.log('  cowback clean            Remove all snapshots');
      console.log('  cowback exec <cmd>       Run command with auto snapshot');
      console.log('');
      console.log('Integration:');
      console.log('  cowback init claude      Setup Claude Code hook');
      console.log('  cowback init openclaw    Setup OpenClaw integration');
      console.log('  cowback init cursor      Setup Cursor integration');
      console.log('');
      console.log('Benchmark:');
      console.log('  cowback benchmark        Compare CoW vs file copy vs git');
      break;
    }
  }
}

main().catch((err) => {
  console.error(`[cowback] Error: ${err.message}`);
  process.exit(1);
});
