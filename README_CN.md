# 🐄 Cowback

**AI Agent 缺失的 Ctrl+Z。**

Cowback 利用操作系统原生的 Copy-on-Write 技术，在每次 AI Agent 操作前**瞬间创建零成本快照**。放心让 Agent 大胆操作，随时一键回滚。

> 你的 AI Agent 刚刚把源代码全删了，怎么办？
> 用 Cowback：`cowback undo`。搞定。

## 为什么需要 Cowback

AI 编码 Agent（Claude Code、Cursor、OpenClaw、Codex 等）可以修改文件、执行破坏性 bash 命令、搞坏你的项目。现有的撤销工具通过**完整拷贝文件**来备份项目 — 又慢又浪费空间。

Cowback 使用 APFS 和 Time Machine 背后的同一技术：**Copy-on-Write 文件克隆。** 不复制数据，只创建轻量级引用，几乎不占空间 — 直到文件被修改时才写入新数据。

### Cowback vs 传统文件拷贝

所有其他 Agent 保护工具都通过拷贝整个项目来创建备份：

| | 🐄 Cowback (CoW) | 文件拷贝（其他工具） |
|---|---|---|
| **100 个文件** | 13ms | 51ms |
| **1,000 个文件** | 122ms | 426ms |
| **5,000 个文件** | 487ms | 1,970ms |
| **磁盘开销** | **~0%** | **100%**（完整复制） |
| **速度** | **快 3-4 倍** | 基准 |

### 能恢复什么

| 场景 | Cowback | 会话日志工具 | Git 方案 |
|---|---|---|---|
| Agent 把文件改坏了 | ✅ | ✅ | ✅ |
| Agent 执行了 `rm -rf src/` | ✅ | ❌ | ❌ |
| Agent 执行了破坏性 bash 命令 | ✅ | ❌ | ❌ |
| 大文件被修改 | ✅ | ❌ | ❌ |
| 不需要 git 仓库 | ✅ | ✅ | ❌ |

## 快速开始

```bash
npm install -g cowback
```

### 傻瓜模式（推荐）

两个命令，搞定一切：

```bash
# 开启保护
cowback on

# ... 随便用任何 AI Agent ...

# 出事了？撤销。
cowback undo
```

`cowback on` 监控你的项目目录。当文件变化后静默 30 秒，自动创建 CoW 快照。全程无感知。

```bash
cowback undo        # 回到上一个快照
cowback undo 2      # 回到 2 步前
cowback undo 3      # 回到 3 步前
cowback off         # 停止保护
cowback status      # 查看保护状态
```

### 专家模式

完全手动控制：

```bash
cowback snapshot "重构前"     # 手动创建快照
cowback list                  # 查看所有快照
cowback diff                  # 查看最近快照以来的变化
cowback clean                 # 清理所有快照
cowback exec claude           # 包裹 Agent 执行，自动快照
```

## Agent 集成

### Claude Code（一条命令配置）

```bash
cowback init claude
```

自动添加 `PreToolUse` 钩子。在每次 Write、Edit、Bash 操作前，Cowback 自动创建快照。零手动操作。

### OpenClaw / Cursor / 任意 Agent

```bash
# 方案一：后台保护（兼容所有 Agent）
cowback on

# 方案二：包裹执行
cowback exec "你的Agent命令"
```

## 工作原理

```
Agent 开始编辑文件
    ↓
Cowback 检测到文件变化 (fs.watch)
    ↓
30 秒静默 → 自动 CoW 快照
    ↓
快照是轻量级克隆（磁盘开销约 0）
    ↓
Agent 搞坏了
    ↓
cowback undo → 瞬间恢复
```

底层调用 `copyFileSync(src, dst, COPYFILE_FICLONE)`：
- **macOS**: `clonefile()` 系统调用 → APFS Copy-on-Write
- **Linux**: `FICLONE` ioctl → BTRFS/XFS reflink
- **兜底**: 普通文件拷贝（不支持 CoW 的文件系统）

零外部依赖。零数据库。零容器。

## 平台支持

| 平台 | CoW 后端 | 要求 |
|---|---|---|
| macOS 10.12+ | APFS `clonefile()` | 无（APFS 是默认文件系统） |
| Linux (BTRFS) | `FICLONE` ioctl | BTRFS 文件系统 |
| Linux (XFS) | `FICLONE` ioctl | XFS 启用 reflink |
| 其他 | 兜底（文件拷贝） | 无 |

## 许可证

Apache 2.0

---

<p align="center">
  <b>别担心，随时回滚。</b><br>
  <code>npm install -g cowback</code>
</p>
