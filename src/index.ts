#!/usr/bin/env node
/**
 * xmszm-memory — Personal MCP Memory Server
 *
 * Multi-user memory with isolated namespaces.
 * Each user's memories are stored in a separate JSON file.
 *
 * Usage:
 *   xmszm-memory                    # stdio mode (default, for MCP clients)
 *   xmszm-memory sse                # SSE mode (HTTP server)
 *   xmszm-memory sse 3000           # SSE mode on custom port
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createServer } from "http";

// Storage
const DATA_DIR = join(homedir(), ".xmszm-memory");
const DEFAULT_PRIORITY: MemoryPriority = 2;
const DEFAULT_TAGS: string[] = [];
const DEFAULT_SOURCE = "assistant_inferred";

type MemoryPriority = 0 | 1 | 2;

interface Memory {
  uri: string;
  content: string;
  disclosure: string;
  priority?: MemoryPriority;
  tags?: string[];
  source?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

type LoadedMemory = Memory & {
  priority: MemoryPriority;
  tags: string[];
  source: string;
};

interface UpdateFields {
  content?: string;
  disclosure?: string;
  priority?: MemoryPriority;
  tags?: string[];
  source?: string;
}

function getFile(namespace: string): string {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  return join(DATA_DIR, `${namespace}.json`);
}

function load(namespace: string): LoadedMemory[] {
  const file = getFile(namespace);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8"));
    return Array.isArray(parsed)
      ? parsed.flatMap((record) => {
          const memory = normalizeStoredMemory(record);
          return memory ? [memory] : [];
        })
      : [];
  } catch {
    return [];
  }
}

function writeNamespace(namespace: string, data: LoadedMemory[]) {
  writeFileSync(getFile(namespace), JSON.stringify(data, null, 2), "utf-8");
}

function now(): string {
  return new Date().toISOString();
}

function isValidPriority(value: unknown): value is MemoryPriority {
  return value === 0 || value === 1 || value === 2;
}

function normalizePriority(value: unknown): MemoryPriority {
  if (value === undefined || value === null) return DEFAULT_PRIORITY;
  if (!isValidPriority(value)) {
    throw new Error("priority 必须是 0、1 或 2");
  }
  return value;
}

function normalizeTags(value: unknown): string[] {
  if (value === undefined || value === null) return [...DEFAULT_TAGS];
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    throw new Error("tags 必须是字符串数组");
  }
  return value;
}

function normalizeSource(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_SOURCE;
  }
  if (typeof value !== "string") {
    throw new Error("source 必须是字符串");
  }
  return value;
}

function normalizeStoredMemory(record: unknown): LoadedMemory | null {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }

  const input = record as Record<string, unknown>;
  if (
    typeof input.uri !== "string" ||
    typeof input.content !== "string" ||
    typeof input.disclosure !== "string" ||
    typeof input.createdAt !== "string" ||
    typeof input.updatedAt !== "string"
  ) {
    return null;
  }

  const deletedAt =
    typeof input.deletedAt === "string" ? { deletedAt: input.deletedAt } : {};

  return {
    uri: input.uri,
    content: input.content,
    disclosure: input.disclosure,
    priority: isValidPriority(input.priority) ? input.priority : DEFAULT_PRIORITY,
    tags:
      Array.isArray(input.tags) && input.tags.every((tag) => typeof tag === "string")
        ? input.tags
        : [...DEFAULT_TAGS],
    source: typeof input.source === "string" && input.source !== "" ? input.source : DEFAULT_SOURCE,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    ...deletedAt,
  };
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} 必须是非空字符串`);
  }
  return value;
}

function activeMemories(memories: LoadedMemory[]): LoadedMemory[] {
  return memories.filter(
    (memory) => typeof memory.uri === "string" && !memory.deletedAt
  );
}

function findActive(memories: LoadedMemory[], uri: string): LoadedMemory | undefined {
  return activeMemories(memories).find((memory) => memory.uri === uri);
}

function disclosurePreview(disclosure: string): string {
  if (!disclosure) return "";
  return disclosure.length > 80 ? `${disclosure.slice(0, 77)}...` : disclosure;
}

function contentPreview(content: string): string {
  return content.length > 180 ? `${content.slice(0, 177)}...` : content;
}

function formatMemory(memory: LoadedMemory): string {
  const tags = memory.tags.length ? memory.tags.join(", ") : "[]";
  const disclosure = disclosurePreview(memory.disclosure);
  const disclosureLine = disclosure ? `\n  disclosure: ${disclosure}` : "";
  return [
    `uri: ${memory.uri}`,
    `priority: ${memory.priority}`,
    `tags: ${tags}`,
    `source: ${memory.source}`,
    `createdAt: ${memory.createdAt}`,
    `updatedAt: ${memory.updatedAt}`,
    `${disclosureLine}`,
    `content:\n${memory.content}`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function formatSearchHit(memory: LoadedMemory): string {
  const tags = memory.tags.length ? memory.tags.join(", ") : "[]";
  const disclosure = disclosurePreview(memory.disclosure) || "(none)";
  return [
    `• uri: ${memory.uri}`,
    `  priority: ${memory.priority}; tags: ${tags}; source: ${memory.source}`,
    `  disclosure: ${disclosure}`,
    `  content: ${contentPreview(memory.content)}`,
  ].join("\n");
}

function getUpdateFields(fields: unknown): UpdateFields {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new Error("fields 必须是对象");
  }

  const input = fields as Record<string, unknown>;
  const update: UpdateFields = {};

  if ("content" in input) update.content = requireString(input.content, "fields.content");
  if ("disclosure" in input) {
    if (typeof input.disclosure !== "string") {
      throw new Error("fields.disclosure 必须是字符串");
    }
    update.disclosure = input.disclosure;
  }
  if ("priority" in input) update.priority = normalizePriority(input.priority);
  if ("tags" in input) update.tags = normalizeTags(input.tags);
  if ("source" in input) update.source = normalizeSource(input.source);

  if (Object.keys(update).length === 0) {
    throw new Error("fields 至少需要包含 content、disclosure、priority、tags 或 source 之一");
  }

  return update;
}

// MCP Server
const server = new Server(
  { name: "xmszm-memory", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create",
      description:
        "Create a new URI-only memory. Requires exact namespace and uri. Refuses overwrite when uri already exists; use update to modify an existing memory. Default priority=2, tags=[], source=assistant_inferred.",
      inputSchema: {
        type: "object",
        properties: {
          namespace: { type: "string", description: "User namespace, e.g. admin or alice" },
          uri: { type: "string", description: "Stable memory URI, e.g. memory://admin/project/password-policy" },
          content: { type: "string", description: "Full memory content" },
          disclosure: {
            type: "string",
            description: "When this memory should be considered relevant",
          },
          priority: {
            type: "number",
            enum: [0, 1, 2],
            description: "0 highest, 1 normal, 2 low/default",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags used for search and grouping",
          },
          source: {
            type: "string",
            description: "Enum-like source label; default assistant_inferred",
          },
        },
        required: ["namespace", "uri", "content", "disclosure"],
      },
    },
    {
      name: "update",
      description:
        "Update an existing active memory by exact uri. Use only when you already know the URI. Does not change createdAt. Accepts fields: content, disclosure, priority, tags, source.",
      inputSchema: {
        type: "object",
        properties: {
          namespace: { type: "string" },
          uri: { type: "string", description: "Exact existing memory URI" },
          fields: {
            type: "object",
            properties: {
              content: { type: "string" },
              disclosure: { type: "string" },
              priority: { type: "number", enum: [0, 1, 2] },
              tags: { type: "array", items: { type: "string" } },
              source: { type: "string" },
            },
            additionalProperties: false,
            description: "Fields to modify. Do not include uri, createdAt, updatedAt, or deletedAt.",
          },
        },
        required: ["namespace", "uri", "fields"],
      },
    },
    {
      name: "read",
      description:
        "Read one active memory by exact URI. Do not guess URIs. If URI is unknown, call search first; use list only for prefix browsing.",
      inputSchema: {
        type: "object",
        properties: {
          namespace: { type: "string" },
          uri: { type: "string", description: "Exact memory URI returned by search/list" },
        },
        required: ["namespace", "uri"],
      },
    },
    {
      name: "search",
      description:
        "Main entry when URI is unknown. Search active memories by keyword across uri, content, disclosure, tags, and source. Returns URI plus priority/tags/source/disclosure preview so you can decide whether to read.",
      inputSchema: {
        type: "object",
        properties: {
          namespace: { type: "string" },
          query: { type: "string", description: "Non-empty keyword or phrase" },
        },
        required: ["namespace", "query"],
      },
    },
    {
      name: "list",
      description:
        "Browse active memories by URI. Optional prefix filters by URI prefix. Use search for keyword discovery; use read/update/delete only after you have the exact URI.",
      inputSchema: {
        type: "object",
        properties: {
          namespace: { type: "string" },
          prefix: { type: "string", description: "Optional URI prefix filter" },
        },
        required: ["namespace"],
      },
    },
    {
      name: "delete",
      description:
        "Soft-delete an active memory by exact URI. Does not remove the JSON record; it sets deletedAt. Use search/list first if URI is unknown.",
      inputSchema: {
        type: "object",
        properties: {
          namespace: { type: "string" },
          uri: { type: "string", description: "Exact memory URI" },
        },
        required: ["namespace", "uri"],
      },
    },
    {
      name: "list_namespaces",
      description:
        "List all namespaces only. This does not return memories. After choosing a namespace, call search(namespace, query) for memory content or list(namespace, prefix) for URI prefix browsing.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "create": {
      const {
        namespace,
        uri,
        content,
        disclosure,
        priority,
        tags,
        source,
      } = args as Record<string, unknown>;
      const ns = requireString(namespace, "namespace");
      const memoryUri = requireString(uri, "uri");
      const memoryContent = requireString(content, "content");
      const memoryDisclosure =
        typeof disclosure === "string" ? disclosure : requireString(disclosure, "disclosure");

      const memories = load(ns);
      const existing = memories.find((memory) => memory.uri === memoryUri);
      if (existing) {
        const state = existing.deletedAt ? "已软删除但仍存在" : "已存在";
        return {
          content: [
            {
              type: "text",
              text: `${state} [${ns}] ${memoryUri}；create 不会覆盖，请使用 update 修改。`,
            },
          ],
        };
      }

      const timestamp = now();
      memories.push({
        uri: memoryUri,
        content: memoryContent,
        disclosure: memoryDisclosure,
        priority: normalizePriority(priority),
        tags: normalizeTags(tags),
        source: normalizeSource(source),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      writeNamespace(ns, memories);
      return {
        content: [{ type: "text", text: `已创建 [${ns}] ${memoryUri}` }],
      };
    }

    case "update": {
      const { namespace, uri, fields } = args as Record<string, unknown>;
      const ns = requireString(namespace, "namespace");
      const memoryUri = requireString(uri, "uri");
      const update = getUpdateFields(fields);
      const memories = load(ns);
      const memory = findActive(memories, memoryUri);

      if (!memory) {
        return {
          content: [{ type: "text", text: `未找到或已删除 [${ns}] ${memoryUri}` }],
        };
      }

      Object.assign(memory, update, { updatedAt: now() });
      writeNamespace(ns, memories);
      return {
        content: [{ type: "text", text: `已更新 [${ns}] ${memoryUri}` }],
      };
    }

    case "read": {
      const { namespace, uri } = args as Record<string, unknown>;
      const ns = requireString(namespace, "namespace");
      const memoryUri = requireString(uri, "uri");
      const memories = load(ns);
      const memory = findActive(memories, memoryUri);
      if (!memory) {
        return {
          content: [{ type: "text", text: `未找到或已删除 [${ns}] ${memoryUri}` }],
        };
      }
      return {
        content: [{ type: "text", text: formatMemory(memory) }],
      };
    }

    case "search": {
      const { namespace, query } = args as Record<string, unknown>;
      const ns = requireString(namespace, "namespace");
      const memoryQuery = requireString(query, "query");
      const q = memoryQuery.toLowerCase();
      const hits = activeMemories(load(ns)).filter((memory) => {
        const searchable = [
          memory.uri,
          memory.content,
          memory.disclosure,
          memory.tags.join(" "),
          memory.source,
        ]
          .join("\n")
          .toLowerCase();
        return searchable.includes(q);
      });

      if (hits.length === 0) {
        return {
          content: [{ type: "text", text: `[${ns}] 没有找到「${memoryQuery}」` }],
        };
      }

      const text = hits.slice(0, 10).map(formatSearchHit).join("\n\n");
      return { content: [{ type: "text", text }] };
    }

    case "list": {
      const { namespace, prefix } = args as Record<string, unknown>;
      const ns = requireString(namespace, "namespace");
      const uriPrefix = typeof prefix === "string" ? prefix : "";
      const memories = activeMemories(load(ns))
        .filter((memory) => memory.uri.startsWith(uriPrefix))
        .sort((a, b) => a.uri.localeCompare(b.uri));

      if (memories.length === 0) {
        const suffix = uriPrefix ? ` with prefix ${uriPrefix}` : "";
        return {
          content: [{ type: "text", text: `[${ns}] 没有 active memories${suffix}` }],
        };
      }

      const text = memories.slice(0, 50).map(formatSearchHit).join("\n\n");
      return { content: [{ type: "text", text }] };
    }

    case "delete": {
      const { namespace, uri } = args as Record<string, unknown>;
      const ns = requireString(namespace, "namespace");
      const memoryUri = requireString(uri, "uri");
      const memories = load(ns);
      const memory = findActive(memories, memoryUri);

      if (!memory) {
        return {
          content: [{ type: "text", text: `未找到或已删除 [${ns}] ${memoryUri}` }],
        };
      }

      const timestamp = now();
      memory.deletedAt = timestamp;
      memory.updatedAt = timestamp;
      writeNamespace(ns, memories);
      return {
        content: [{ type: "text", text: `已软删除 [${ns}] ${memoryUri}` }],
      };
    }

    case "list_namespaces": {
      if (!existsSync(DATA_DIR)) {
        return { content: [{ type: "text", text: "还没有用户" }] };
      }
      const { readdirSync } = await import("fs");
      let names: string[] = [];
      try {
        names = readdirSync(DATA_DIR)
          .filter((file) => file.endsWith(".json"))
          .map((file) => `• ${file.replace(".json", "")}`);
      } catch {
        names = [];
      }
      return {
        content: [
          {
            type: "text",
            text: names.length ? names.join("\n") : "还没有用户",
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Main
async function main() {
  const mode = process.argv[2] || "stdio";

  if (mode === "sse") {
    const port = parseInt(process.argv[3] || "8000", 10);

    // Store the last transport for /messages.
    let transport: SSEServerTransport | null = null;

    const httpServer = createServer(async (req, res) => {
      // CORS headers.
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || "/", `http://${req.headers.host}`);

      if (url.pathname === "/sse") {
        const t = new SSEServerTransport("/messages", res);
        transport = t;
        await server.connect(t);
        req.on("close", () => {
          transport = null;
        });
      } else if (url.pathname === "/messages" && transport) {
        await transport.handlePostMessage(req, res);
      } else if (url.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("xmszm-memory MCP server running");
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    httpServer.listen(port, "0.0.0.0", () => {
      console.error(`xmszm-memory SSE running on http://0.0.0.0:${port}`);
      console.error(`Data: ${DATA_DIR}`);
    });
  } else {
    // stdio mode (default)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("xmszm-memory stdio mode");
    console.error(`Data: ${DATA_DIR}`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
