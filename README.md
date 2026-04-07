[🇨🇳 中文文档](./README_CN.md)

# 🐄 Cowback

**The missing Ctrl+Z for AI Agents.**

Cowback uses OS-native Copy-on-Write to create **near-instant, zero-cost snapshots** of your project before every AI agent operation. Break things freely. Restore in milliseconds.

> Your AI agent just mass-deleted your source files. Now what?
> With Cowback: `cowback undo`. That's it.

## Why

AI coding agents (Claude Code, Cursor, OpenClaw, Codex, etc.) can modify files, run destructive bash commands, and break your project. Existing undo tools create full file copies to back up your project — **slow and wasteful.**

Cowback uses the same technology behind APFS and Time Machine: **Copy-on-Write file cloning.** Instead of copying data, it creates lightweight references that cost almost nothing — until a file is actually modified.

### Cowback vs. Traditional File Copy

Every other agent protection tool copies your entire project to create backups.

| | 🐄 Cowback (CoW) | File copy (others) |
|---|---|---|
| **100 files** | 13ms | 51ms |
| **1,000 files** | 122ms | 426ms |
| **5,000 files** | 487ms | 1,970ms |
| **Disk cost** | **~0%** | **100%** (full duplicate) |
| **Speed** | **3-4x faster** | baseline |

> Cowback snapshots are **near-instant** because no data is copied — only metadata pointers are created. Disk usage stays near zero until files are actually modified.

### What Cowback can recover

| Scenario | Cowback | Session log tools | Git-based tools |
|---|---|---|---|
| Agent edited files badly | ✅ | ✅ | ✅ |
| Agent ran `rm -rf src/` | ✅ | ❌ | ❌ |
| Agent ran destructive bash command | ✅ | ❌ | ❌ |
| Large binary files modified | ✅ | ❌ | ❌ |
| Works without git repo | ✅ | ✅ | ❌ |
| Selective per-file restore | ✅ | ⚠️ partial | ❌ |

## Quick Start

```bash
npm install -g cowback
```

### Simple Mode (recommended)

Two commands. That's all you need.

```bash
# Start protection
cowback on

# ... use any AI agent freely ...

# Something went wrong? Undo.
cowback undo
```

`cowback on` watches your project directory. When files change, it waits for a quiet period (30s by default), then creates a CoW snapshot automatically. You never need to think about it.

```bash
cowback undo        # Undo to last snapshot
cowback undo 2      # Undo 2 steps back
cowback undo 3      # Undo 3 steps back
cowback off         # Stop protection
cowback status      # Check if protection is running
```

### Expert Mode

Full control over snapshots.

```bash
cowback snapshot "before refactor"    # Manual snapshot
cowback list                          # List all snapshots
cowback diff                          # Show what changed since last snapshot
cowback diff 2                        # Show changes since 2 snapshots ago
cowback clean                         # Remove all snapshots
cowback exec claude                   # Run agent with auto snapshot protection
```

## Agent Integration

### Claude Code (one command setup)

```bash
cowback init claude
```

This adds a `PreToolUse` hook to Claude Code. Before every Write, Edit, or Bash operation, Cowback automatically creates a snapshot. Zero manual work.

### OpenClaw

```bash
cowback init openclaw
```

### Cursor / Any Agent

```bash
# Option 1: Background protection (works with everything)
cowback on

# Option 2: Wrap any agent command
cowback exec "your-agent-command"
```

## How It Works

```
Agent starts editing files
    ↓
Cowback detects file changes (fs.watch)
    ↓
30 seconds of quiet → auto CoW snapshot
    ↓
Snapshot is a lightweight clone (near-zero disk cost)
    ↓
Agent breaks something
    ↓
cowback undo → instant restore
```

### Under the hood

Cowback calls `copyFileSync(src, dst, COPYFILE_FICLONE)` for each file — a single flag that triggers:

- **macOS**: `clonefile()` syscall → APFS Copy-on-Write clone
- **Linux**: `FICLONE` ioctl → BTRFS/XFS reflink clone
- **Fallback**: Regular file copy (on unsupported filesystems)

No external dependencies. No database. No container. Just your OS doing what it already knows how to do.

### Architecture

```
┌──────────────────────────────────────────────┐
│                 cowback CLI                   │
│         on / off / undo / snapshot           │
├──────────────┬───────────────────────────────┤
│   Watcher    │      Undo Engine              │
│  (fs.watch)  │  (preview → confirm → restore)│
├──────────────┴───────────────────────────────┤
│           CoW Clone Engine                   │
│  copyFileSync(..., COPYFILE_FICLONE)         │
├──────────────┬───────────────┬───────────────┤
│    APFS      │  BTRFS/XFS   │   Fallback    │
│  clonefile() │  FICLONE     │   file copy   │
│   (macOS)    │   (Linux)    │    (any)      │
└──────────────┴───────────────┴───────────────┘
```

## Configuration

### `.cowbackignore`

Place a `.cowbackignore` file in your project root (same syntax as `.gitignore`):

```
node_modules/
dist/
build/
__pycache__/
.env
*.log
```

Built-in defaults already ignore `node_modules`, `.git`, `dist`, `build`, and common patterns.

### Storage

Snapshots are stored in `~/.cowback/snapshots/`. Default limit: 20 snapshots per project (oldest auto-cleaned).

## Benchmark

Run your own benchmark:

```bash
cowback benchmark
```

## Platform Support

| Platform | CoW Backend | Requirements |
|---|---|---|
| macOS 10.12+ | APFS `clonefile()` | None (APFS is default) |
| Linux (BTRFS) | `FICLONE` ioctl | BTRFS filesystem |
| Linux (XFS) | `FICLONE` ioctl | XFS with reflink enabled |
| Other | Fallback (file copy) | None |

## FAQ

**Q: How much disk space do snapshots use?**

Near zero — until you modify files. CoW clones share disk blocks with the original. Only changed bytes use additional space.

**Q: Does it slow down my agent?**

No. Snapshots happen in the background after a quiet period. Your agent is never blocked.

**Q: Can I use it without an AI agent?**

Yes. Cowback protects any directory from any changes. Use it for risky refactors, experiments, or any time you want a quick undo.

**Q: What if CoW isn't supported on my filesystem?**

Cowback falls back to regular file copy automatically. It's slower, but everything still works.

## License

Apache 2.0

---

<p align="center">
  <b>Stop worrying. Start undoing.</b><br>
  <code>npm install -g cowback</code>
</p>
