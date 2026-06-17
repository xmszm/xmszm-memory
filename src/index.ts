#!/usr/bin/env node
/**
 * xmszm-memory — Personal MCP Memory Server
 *
 * Multi-user memory with isolated namespaces.
 * Each user's memories stored in a separate JSON file.
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
import { join, dirname } from "path";
import { homedir } from "os";
import { createServer } from "http";

// ── Storage ───────────────────────────────────────────
const DATA_DIR = join(homedir(), ".xmszm-memory");

function getFile(namespace: string): string {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  return join(DATA_DIR, `${namespace}.json`);
}

interface Memory {
  key: string;
  content: string;
  disclosure: string;
  createdAt: string;
  updatedAt: string;
}

function load(namespace: string): Memory[] {
  const file = getFile(namespace);
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

function save(namespace: string, data: Memory[]) {
  writeFileSync(getFile(namespace), JSON.stringify(data, null, 2), "utf-8");
}

function now(): string {
  return new Date().toISOString();
}

// ── MCP Server ────────────────────────────────────────
const server = new Server(
  { name: "xmszm-memory", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "save",
      description:
        "保存一条记忆。namespace 区分用户。key 类似文件路径，如 project/密码规范",
      inputSchema: {
        type: "object",
        properties: {
          namespace: { type: "string", description: "用户命名空间，如 admin、alice" },
          key: { type: "string", description: "记忆的 key，如 project/密码规范" },
          content: { type: "string", description: "记忆内容" },
          disclosure: {
            type: "string",
            description: "触发条件，如「当要创建密码时」",
          },
        },
        required: ["namespace", "key", "content"],
      },
    },
    {
      name: "read",
      description: "读取一条记忆",
      inputSchema: {
        type: "object",
        properties: {
          namespace: { type: "string" },
          key: { type: "string" },
        },
        required: ["namespace", "key"],
      },
    },
    {
      name: "search",
      description: "按关键词搜索某用户的记忆",
      inputSchema: {
        type: "object",
        properties: {
          namespace: { type: "string" },
          query: { type: "string", description: "关键词" },
        },
        required: ["namespace", "query"],
      },
    },
    {
      name: "delete",
      description: "删除一条记忆",
      inputSchema: {
        type: "object",
        properties: {
          namespace: { type: "string" },
          key: { type: "string" },
        },
        required: ["namespace", "key"],
      },
    },
    {
      name: "list_namespaces",
      description: "列出所有 namespace",
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
    case "save": {
      const { namespace, key, content, disclosure = "" } = args as any;
      const memories = load(namespace);
      const existing = memories.find((m) => m.key === key);
      if (existing) {
        existing.content = content;
        existing.disclosure = disclosure;
        existing.updatedAt = now();
      } else {
        memories.push({
          key,
          content,
          disclosure,
          createdAt: now(),
          updatedAt: now(),
        });
      }
      save(namespace, memories);
      return {
        content: [{ type: "text", text: `已保存 [${namespace}] ${key}` }],
      };
    }

    case "read": {
      const { namespace, key } = args as any;
      const memories = load(namespace);
      const m = memories.find((m) => m.key === key);
      if (!m) {
        return {
          content: [{ type: "text", text: `未找到 [${namespace}] ${key}` }],
        };
      }
      const d = m.disclosure ? `\n[触发: ${m.disclosure}]` : "";
      return {
        content: [{ type: "text", text: `${m.content}${d}` }],
      };
    }

    case "search": {
      const { namespace, query } = args as any;
      const memories = load(namespace);
      const q = query.toLowerCase();
      const hits = memories.filter(
        (m) =>
          m.key.toLowerCase().includes(q) ||
          m.content.toLowerCase().includes(q) ||
          m.disclosure.toLowerCase().includes(q)
      );
      if (hits.length === 0) {
        return {
          content: [{ type: "text", text: `[${namespace}] 没有找到「${query}」` }],
        };
      }
      const text = hits
        .slice(0, 10)
        .map((m) => {
          const d = m.disclosure ? ` [${m.disclosure}]` : "";
          return `• ${m.key}${d}\n  ${m.content.slice(0, 150)}`;
        })
        .join("\n\n");
      return { content: [{ type: "text", text }] };
    }

    case "delete": {
      const { namespace, key } = args as any;
      const memories = load(namespace);
      const filtered = memories.filter((m) => m.key !== key);
      save(namespace, filtered);
      return {
        content: [{ type: "text", text: `已删除 [${namespace}] ${key}` }],
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
          .filter((f) => f.endsWith(".json"))
          .map((f) => `• ${f.replace(".json", "")}`);
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

// ── Main ──────────────────────────────────────────────
async function main() {
  const mode = process.argv[2] || "stdio";

  if (mode === "sse") {
    const port = parseInt(process.argv[3] || "8000", 10);

    const httpServer = createServer(async (req, res) => {
      // CORS headers
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
        const transport = new SSEServerTransport("/messages", res);
        await server.connect(transport);
        req.on("close", () => {
          // client disconnected
        });
      } else if (url.pathname === "/messages") {
        await transport?.handlePostMessage(req, res);
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    // Store the last transport for /messages
    let transport: SSEServerTransport | null = null;

    httpServer.on("request", async (req, res) => {
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
