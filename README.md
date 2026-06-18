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

## Memory Model

Memories are URI-only records. There is no `key` field and no key-based API.

```ts
interface Memory {
  uri: string;
  content: string;
  disclosure: string;
  priority: 0 | 1 | 2; // default 2
  tags: string[];      // default []
  source: string;      // default "assistant_inferred"
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;  // set by delete()
}
```

Deleted memories are soft-deleted with `deletedAt` and are excluded from `read`, `search`, and `list` by default.

## Tools

| Tool | Description |
|------|-------------|
| `create(namespace, uri, content, disclosure, priority?, tags?, source?)` | Create a new memory. Refuses overwrite if `uri` already exists; use `update` to modify. |
| `update(namespace, uri, fields)` | Update an existing active memory by exact URI without changing `createdAt`. `fields` can include `content`, `disclosure`, `priority`, `tags`, or `source`. |
| `read(namespace, uri)` | Read one active memory by exact URI. Use only when the URI is already known. |
| `search(namespace, query)` | Main entry when URI is unknown. Searches `uri`, `content`, `disclosure`, `tags`, and `source`. |
| `list(namespace, prefix?)` | Browse active memories, optionally filtered by URI prefix. |
| `delete(namespace, uri)` | Soft-delete one active memory by exact URI by setting `deletedAt`. |
| `list_namespaces()` | List all namespaces only; it does not return memories. |

Recommended flow:

```text
Unknown URI -> search(namespace, query) -> read/update/delete(namespace, exactUri)
Browse URI prefix -> list(namespace, prefix)
Create new memory -> create(namespace, uri, ...)
Modify existing memory -> update(namespace, uri, fields)
```

## Data

Stored in `~/.xmszm-memory/` as one JSON file per namespace.

```bash
# View all your memories
cat ~/.xmszm-memory/admin.json
```

## License

MIT

Built from the design philosophy of [Nocturne Memory](https://github.com/Dataojitori/nocturne_memory) by NeuronActivation.
