# memory

Personal MCP memory server. Multi-user, file-backed, cross-platform.

Each user gets an isolated namespace. Memories persist across sessions within the namespace.

## Install

```bash
npm install -g @xmszm/memory
```

## Usage

### stdio mode (for MCP clients like Hermes)

```bash
xmszm-memory
```

### SSE mode (HTTP server, for remote access)

```bash
xmszm-memory sse
xmszm-memory sse 3000
```

### Hermes Configuration

```json
{
  "mcpServers": {
    "@xmszm/memory": {
      "command": "xmszm-memory",
      "args": []
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

## License

MIT

Built from the design philosophy of [Nocturne Memory](https://github.com/Dataojitori/nocturne_memory) by NeuronActivation.
