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
      description: "用精确的 key 读取一条记忆。调用前请确保你知道确切的 key（先用 search 查到 key 再调这里）。",
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
      description: "【主入口】按关键词搜索某用户的记忆。不知道具体 key 时应该先调这个来查找，而不是猜 key 去调用 read。",
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
      name: "get_triggered",
      description:
        "返回所有带 disclosure（触发条件）的记忆的 key 和触发条件，不返回 content。用于对话开始时快速了解哪些记忆需要触发。",
      inputSchema: {
        type: "object",
        properties: {
          namespace: { type: "string", description: "用户命名空间，如 xmszm" },
        },
        required: ["namespace"],
      },
    },
    {
      name: "load_session",
      description:
        "【会话启动专用】一次性加载所有带触发条件的记忆的完整内容。等同于 get_triggered + 批量 read，但只需一次调用。会话开始时优先使用此工具。",
      inputSchema: {
        type: "object",
        properties: {
          namespace: { type: "string", description: "用户命名空间，如 xmszm" },
        },
        required: ["namespace"],
      },
    },
    {
      name: "list_namespaces",
      description: "列出所有 namespace。注意：查询到 namespace 后，你必须再调用 search(该namespace, query) 才能获取记忆内容。只调 list_namespaces 不会返回任何记忆内容。",
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

    case "get_triggered": {
      const { namespace } = args as any;
      const memories = load(namespace);
      const triggered = memories.filter((m) => m.disclosure);
      if (triggered.length === 0) {
        return {
          content: [{ type: "text", text: `[${namespace}] 没有带触发条件的记忆` }],
        };
      }
      const text = triggered
        .map((m) => `• ${m.key} [${m.disclosure}]`)
        .join("\n");
      return { content: [{ type: "text", text }] };
    }

    case "load_session": {
      const { namespace } = args as any;
      const memories = load(namespace);
      const triggered = memories.filter((m) => m.disclosure);
      if (triggered.length === 0) {
        return {
          content: [{ type: "text", text: `[${namespace}] 没有带触发条件的记忆` }],
        };
      }
      const text = triggered
        .map((m) => {
          const header = `━━━ ${m.key} ━━━\n触发: ${m.disclosure}\n`;
          const content = m.content;
          const footer = `\n更新: ${m.updatedAt}\n`;
          return header + content + footer;
        })
        .join("\n");
      return { content: [{ type: "text", text: `✅ 已加载 ${triggered.length} 条会话记忆：\n\n${text}` }] };
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
