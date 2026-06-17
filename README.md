# memory

Personal MCP memory server. Multi-user, file-backed, cross-platform.

Each user gets an isolated namespace. Memories persist across sessions within the namespace.

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
| `save(namespace, key, content, disclosure?)` | Save a memory |
| `read(namespace, key)` | Read a memory |
| `search(namespace, query)` | Search memories by keyword |
| `delete(namespace, key)` | Delete a memory |
| `list_namespaces()` | List all users |

## Data

Stored in `~/.xmszm/memory/` as one JSON file per namespace.

```bash
# View all your memories
cat ~/.xmszm/memory/admin.json
```

## License

MIT

Built from the design philosophy of [Nocturne Memory](https://github.com/Dataojitori/nocturne_memory) by NeuronActivation.
