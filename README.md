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
| `initialize(namespace, profile?)` | Idempotently create v2.1 boot/personality memories. `profile` defaults to `assistant`; accepted values are `assistant` and `blank`. Active existing memories are skipped, never overwritten. |
| `boot_instructions(namespace, target?)` | Generate copy-paste startup instructions for a client/global/project rule so future sessions call `initialize` and `read(system://boot)` before answering. Targets: `generic`, `project`, `claude-code`, `codex`, `cursor`, `windsurf`. |
| `create(namespace, uri, content, disclosure, priority?, tags?, source?)` | Create a new memory. Refuses overwrite if `uri` already exists; use `update` to modify. |
| `update(namespace, uri, fields)` | Update an existing active memory by exact URI without changing `createdAt`. `fields` can include `content`, `disclosure`, `priority`, `tags`, or `source`. |
| `read(namespace, uri)` | Read one active memory by exact URI. Special reads: `system://boot` and `system://diagnostic/identity`. |
| `search(namespace, query)` | Main entry when URI is unknown. Searches `uri`, `content`, `disclosure`, `tags`, and `source`. |
| `list(namespace, prefix?)` | Browse active memories, optionally filtered by URI prefix. |
| `delete(namespace, uri)` | Soft-delete one active memory by exact URI by setting `deletedAt`. |
| `list_namespaces()` | List all namespaces only; it does not return memories. |

## Boot Flow

At the start of a new session, clients should initialize the namespace once if it may be empty, then read the boot context before answering:

```text
initialize(namespace, "assistant")  # or initialize(namespace, "blank")
read(namespace, "system://boot")
```

`initialize` is safe to call repeatedly. It reports `created` and `skipped_active_existing` URIs and never overwrites an active memory.

Profiles:

| Profile | Behavior |
|---------|----------|
| `assistant` | Creates default identity, verification, no-fake-execution, conflict-resolution, user-relationship, boundary, reality, and coding-workflow memories. |
| `blank` | Creates only minimal structural placeholders such as `identity://default/self` and boundaries; it does not assume user-specific preferences. |

Special reads:

| URI | Behavior |
|-----|----------|
| `system://boot` | Returns active `identity://default/*` memories plus all active `priority=0` memories, de-duplicated by URI and sorted by URI. Includes a short routing guide. |
| `system://diagnostic/identity` | Reports whether core identity URIs are present, missing, active count, priority-0 count, and warnings for missing boundaries, verification, or no-fake-execution memories. |

Recommended memory flow:

```text
New session -> initialize(namespace, profile?) -> read(namespace, "system://boot")
Unknown URI -> search(namespace, query) -> read/update/delete(namespace, exactUri)
Browse URI prefix -> list(namespace, prefix)
Create new memory -> create(namespace, uri, ...)
Modify existing memory -> update(namespace, uri, fields)
```

Examples:

```text
initialize("admin")
initialize("admin", "blank")
read("admin", "system://boot")
read("admin", "system://diagnostic/identity")
boot_instructions("admin", "generic")
boot_instructions("admin", "codex")
```

To make memory load automatically, run `boot_instructions(namespace, target?)` once and copy the returned rule into the client global instructions or project rule file. Without that client-side rule, the MCP server is available but the model may not call it until asked.

## Data

Stored in `~/.xmszm-memory/` as one JSON file per namespace.

```bash
# View all your memories
cat ~/.xmszm-memory/admin.json
```

## License

MIT

Built from the design philosophy of [Nocturne Memory](https://github.com/Dataojitori/nocturne_memory) by NeuronActivation.
