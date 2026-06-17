# memory

Personal MCP memory server. Multi-user, file-backed, cross-platform.

Each user gets an isolated namespace. Memories persist across sessions within the namespace.

## Quick Start

### 1. Install and Initialize

```bash
# In your AI environment (Claude Code, Cursor, Windsurf, Cline)
# Let the AI call:
mcp__xmszm-memory__init(namespace="your-name", target="auto")

# This will:
# ✅ Auto-detect your AI environment
# ✅ Deploy /init-memory skill
# ✅ Configure auto-loading hook
# ✅ You're ready to go!
```

### 2. Start Using

After restart, every new conversation will automatically load your memories.

Or manually trigger: `/init-memory`

---

## Usage

### Requirements

- Node.js >= 18 (if installed via npm)
- No installation needed if using `npx`

### stdio mode (for MCP clients)

```bash
npx -y @xmszm/memory
```

### SSE mode (HTTP server, background service)

```bash
npx -y @xmszm/memory sse
npx -y @xmszm/memory sse 3000
```

### Hermes Configuration

```json
{
  "mcpServers": {
    "xmszm-memory": {
      "command": "npx",
      "args": ["-y", "@xmszm/memory"]
    }
  }
}
```

### Claude Code Configuration (claude.json)

```json
{
  "mcpServers": {
    "xmszm-memory": {
      "command": "npx",
      "args": ["-y", "@xmszm/memory"]
    }
  }
}
```

### Cursor / Windsurf / Any MCP Client

Most MCP-compatible clients accept the same format:

```json
{
  "mcpServers": {
    "xmszm-memory": {
      "command": "npx",
      "args": ["-y", "@xmszm/memory"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `init(namespace, target?, includeHook?)` | **【首次使用】** 一键部署：自动配置 skill + hook 到 AI 环境 |
| `load_session(namespace)` | **【会话启动】** 一次性加载所有触发记忆的完整内容 |
| `save(namespace, key, content, disclosure?)` | Save a memory |
| `read(namespace, key)` | Read a memory |
| `search(namespace, query)` | Search memories by keyword |
| `delete(namespace, key)` | Delete a memory |
| `get_triggered(namespace)` | 返回所有带触发条件的记忆（只返回 key + disclosure，不返回 content） |
| `list_namespaces()` | List all users |

### Tool Details

#### `init` - One-Time Setup

```typescript
// Auto-detect and deploy to current environment
init({ namespace: "xmszm" })

// Deploy to all detected environments
init({ namespace: "xmszm", target: "all" })

// Deploy without auto-loading hook (manual /init-memory only)
init({ namespace: "xmszm", includeHook: false })

// Supported environments: claude-code, cursor, windsurf, cline
```

## Data

Stored in `~/.xmszm/memory/` as one JSON file per namespace.

```bash
# View all your memories
cat ~/.xmszm/memory/admin.json
```

## License

MIT

Built from the design philosophy of [Nocturne Memory](https://github.com/Dataojitori/nocturne_memory) by NeuronActivation.
