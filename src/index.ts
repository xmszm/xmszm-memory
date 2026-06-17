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

// ── Environment Detection & Deployment ────────────────
interface AIEnvironment {
  name: string;
  detected: boolean;
  skillPath: string;
  hookPath: string;
}

function detectEnvironments(): AIEnvironment[] {
  const home = homedir();

  const environments = [
    {
      name: "claude-code",
      skillPath: join(home, ".claude/commands/init-memory.md"),
      hookPath: join(home, ".claude/settings.json"),
      detect: () => existsSync(join(home, ".claude")) || !!process.env.CLAUDE_CODE_VERSION
    },
    {
      name: "codex",
      skillPath: join(home, ".codex/commands/init-memory.md"),
      hookPath: join(home, ".codex/hooks.json"),
      detect: () => existsSync(join(home, ".codex"))
    },
    {
      name: "cursor",
      skillPath: join(home, ".cursor/commands/init-memory.md"),
      hookPath: join(home, ".cursor/settings.json"),
      detect: () => existsSync(join(home, ".cursor"))
    },
    {
      name: "windsurf",
      skillPath: join(home, ".windsurf/commands/init-memory.md"),
      hookPath: join(home, ".windsurf/settings.json"),
      detect: () => existsSync(join(home, ".windsurf"))
    },
    {
      name: "cline",
      skillPath: join(home, ".cline/commands/init-memory.md"),
      hookPath: join(home, ".cline/settings.json"),
      detect: () => existsSync(join(home, ".cline"))
    }
  ];

  return environments.map(env => ({
    name: env.name,
    detected: env.detect(),
    skillPath: env.skillPath,
    hookPath: env.hookPath
  }));
}

function generateStopHookScript(namespace: string): string {
  return `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Stop Hook - Save important information before session ends
"""
import json
import sys

def main():
    """Output hook result that reminds AI to save important info."""

    context = """💾 会话结束协议

在结束前，请检查本次对话中是否有需要保存的重要信息：
- 用户的新偏好或习惯
- 项目相关的重要决策
- 需要记住的上下文

如果有，使用 mcp__xmszm-memory__save 工具保存，格式：
- namespace: "${namespace}"
- key: "category/具体名称"（如 "preference/工具偏好"）
- content: 具体内容
- disclosure: 触发条件（如 "当需要使用工具时"）

如果没有重要信息需要保存，无需操作。"""

    result = {
        "hookSpecificOutput": {
            "hookEventName": "Stop",
            "additionalContext": context,
        }
    }

    print(json.dumps(result, ensure_ascii=False), flush=True)

if __name__ == "__main__":
    main()
`;
}

function generateHookScript(namespace: string): string {
  return `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Session Start Hook - Auto-load memory
"""
from __future__ import annotations

# IMPORTANT: Suppress all warnings FIRST
import warnings
warnings.filterwarnings("ignore")

import json
import sys

# Force UTF-8 on stdin/stdout/stderr on Windows
if sys.platform.startswith("win"):
    import io as _io
    for _stream_name in ("stdin", "stdout", "stderr"):
        _stream = getattr(sys, _stream_name, None)
        if _stream is None:
            continue
        if hasattr(_stream, "reconfigure"):
            try:
                _stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass
        elif hasattr(_stream, "detach"):
            try:
                setattr(sys, _stream_name, _io.TextIOWrapper(_stream.detach(), encoding="utf-8", errors="replace"))
            except Exception:
                pass

def main():
    """Output hook result that triggers memory loading."""

    context = """🎯 会话启动协议

请立即调用以下工具加载记忆：

mcp__xmszm-memory__load_session(namespace="${namespace}")

这会加载所有触发记忆（身份、偏好、项目上下文等）。
必须在第一次回复前执行。"""

    result = {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": context,
        }
    }

    print(json.dumps(result, ensure_ascii=False), flush=True)

if __name__ == "__main__":
    main()
`;
}

function generateHookConfig(envName: string): any {
  // Codex uses .codex/hooks.json, different from other environments
  if (envName === "codex") {
    // Use 'python' on Windows, 'python3' on Unix
    const pythonCmd = process.platform === "win32" ? "python" : "python3";
    return {
      hooks: {
        SessionStart: [
          {
            matcher: "startup",
            hooks: [
              {
                type: "command",
                command: `${pythonCmd} -X utf8 .codex/hooks/session-start.py`,
                timeout: 30
              }
            ]
          },
          {
            matcher: "clear",
            hooks: [
              {
                type: "command",
                command: `${pythonCmd} -X utf8 .codex/hooks/session-start.py`,
                timeout: 30
              }
            ]
          },
          {
            matcher: "compact",
            hooks: [
              {
                type: "command",
                command: `${pythonCmd} -X utf8 .codex/hooks/session-start.py`,
                timeout: 30
              }
            ]
          }
        ]
      }
    };
  }

  // Other environments use settings.json
  return {
    hooks: {
      SessionStart: [
        {
          matcher: "startup",
          hooks: [
            {
              type: "command",
              command: "python .claude/hooks/session-start.py",
              timeout: 5
            }
          ]
        },
        {
          matcher: "clear",
          hooks: [
            {
              type: "command",
              command: "python .claude/hooks/session-start.py",
              timeout: 5
            }
          ]
        },
        {
          matcher: "compact",
          hooks: [
            {
              type: "command",
              command: "python .claude/hooks/session-start.py",
              timeout: 5
            }
          ]
        }
      ]
    }
  };
}

function mergeHookConfig(existingPath: string, newHook: any): any {
  let existing: any = {};
  if (existsSync(existingPath)) {
    try {
      existing = JSON.parse(readFileSync(existingPath, "utf-8"));
    } catch {
      existing = {};
    }
  }

  const merged = { ...existing };
  merged.hooks = merged.hooks || {};
  merged.hooks.SessionStart = newHook.hooks.SessionStart;
  // Remove Stop hook if it exists
  delete merged.hooks.Stop;

  return merged;
}

function generateSkillTemplate(namespace: string, version: string): string {
  return `# 初始化记忆

🎯 **加载用户记忆设定**

## 使用方式

每次新会话开始时，输入：

\`\`\`
/init-memory
\`\`\`

或者直接说:"请加载我的记忆"

## 功能

一次性加载所有触发记忆：

\`\`\`
mcp__xmszm-memory__load_session(namespace="${namespace}")
\`\`\`

## 返回内容

- 所有带触发条件的记忆的完整内容
- 身份设定、偏好、项目上下文等

## 应用记忆

根据返回内容确认：
- ✅ 身份角色
- ✅ 称呼方式
- ✅ 工具偏好
- ✅ 项目设定

---
Generated: ${new Date().toISOString()}
Namespace: ${namespace}
Version: ${version}
`;
}

function generateMCPConfig(envName: string): any {
  // Get the global package installation path
  const packageName = "@xmszm/memory";

  return {
    mcpServers: {
      "xmszm-memory": {
        command: "npx",
        args: ["-y", packageName]
      }
    }
  };
}

function getMCPConfigPath(envName: string): string | null {
  const home = homedir();

  // Different environments may use different MCP config paths
  switch (envName) {
    case "codex":
      return join(home, ".codex/mcp.json");
    case "claude-code":
      return join(home, ".claude/mcp.json");
    case "cursor":
      return join(home, ".cursor/mcp.json");
    case "windsurf":
      return join(home, ".windsurf/mcp.json");
    case "cline":
      return join(home, ".cline/mcp.json");
    default:
      return null;
  }
}

function mergeMCPConfig(existingPath: string, newConfig: any): any {
  let existing: any = {};
  if (existsSync(existingPath)) {
    try {
      existing = JSON.parse(readFileSync(existingPath, "utf-8"));
    } catch {
      existing = {};
    }
  }

  const merged = { ...existing };
  merged.mcpServers = merged.mcpServers || {};
  merged.mcpServers["xmszm-memory"] = newConfig.mcpServers["xmszm-memory"];

  return merged;
}

function deployToEnvironment(
  env: AIEnvironment,
  namespace: string,
  includeHook: boolean,
  version: string
): { success: boolean; message: string; error?: string } {
  try {
    // 1. Deploy skill
    mkdirSync(dirname(env.skillPath), { recursive: true });
    const skillContent = generateSkillTemplate(namespace, version);
    writeFileSync(env.skillPath, skillContent, "utf-8");

    let hookMessage = "";
    let mcpMessage = "";

    // 2. Deploy MCP config
    const mcpConfigPath = getMCPConfigPath(env.name);
    if (mcpConfigPath) {
      try {
        const mcpConfig = generateMCPConfig(env.name);
        const merged = mergeMCPConfig(mcpConfigPath, mcpConfig);
        mkdirSync(dirname(mcpConfigPath), { recursive: true });
        writeFileSync(mcpConfigPath, JSON.stringify(merged, null, 2), "utf-8");
        mcpMessage = " + mcp-config";
      } catch (mcpErr: any) {
        console.error(`[xmszm-memory] Warning: MCP config deployment failed for ${env.name}:`, mcpErr.message);
        // Don't fail the whole deployment, just warn
      }
    }

    // 3. Deploy hook (SessionStart auto-loading only)
    if (includeHook) {
      try {
        // Deploy SessionStart hook script
        const configDir = dirname(env.hookPath); // ~/.claude or ~/.codex
        const sessionStartPath = join(configDir, "hooks", "session-start.py");
        mkdirSync(dirname(sessionStartPath), { recursive: true });
        const sessionStartScript = generateHookScript(namespace);
        writeFileSync(sessionStartPath, sessionStartScript, "utf-8");

        // Deploy hook config (SessionStart only)
        mkdirSync(dirname(env.hookPath), { recursive: true });
        const hookConfig = generateHookConfig(env.name);
        const merged = mergeHookConfig(env.hookPath, hookConfig);
        writeFileSync(env.hookPath, JSON.stringify(merged, null, 2), "utf-8");

        hookMessage = " + auto-load hook";
      } catch (hookErr: any) {
        return {
          success: true,
          message: `⚠️ ${env.name}: skill${mcpMessage} 已部署，但 hook 部署失败`,
          error: hookErr.message
        };
      }
    }

    return {
      success: true,
      message: `✅ ${env.name}: skill${mcpMessage}${hookMessage} 已部署`
    };
  } catch (err: any) {
    if (err.code === "EACCES") {
      return {
        success: false,
        message: `❌ ${env.name}: 权限不足`,
        error: "请检查文件权限"
      };
    }
    if (err.code === "ENOSPC") {
      return {
        success: false,
        message: `❌ ${env.name}: 磁盘空间不足`,
        error: err.message
      };
    }
    return {
      success: false,
      message: `❌ ${env.name}: ${err.message}`,
      error: err.stack
    };
  }
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
    {
      name: "init",
      description: "初始化记忆系统：自动部署 /init-memory skill 和 SessionStart hook 到当前或指定的 AI 环境。一次配置，自动加载。",
      inputSchema: {
        type: "object",
        properties: {
          namespace: {
            type: "string",
            description: "用户命名空间，如 xmszm"
          },
          target: {
            type: "string",
            enum: ["auto", "claude-code", "cursor", "windsurf", "cline", "all"],
            description: "目标环境。auto=自动检测当前环境，all=部署到所有检测到的环境"
          },
          includeHook: {
            type: "boolean",
            description: "是否部署 SessionStart hook（自动加载记忆）。默认 true"
          }
        },
        required: ["namespace"]
      },
    },
    {
      name: "reset_init",
      description: "重置自动初始化标记，允许下次启动时重新执行自动部署。用于测试或重新配置。",
      inputSchema: {
        type: "object",
        properties: {}
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

    case "init": {
      const { namespace, target = "auto", includeHook = true } = args as any;
      const version = "1.1.0"; // 从 package.json 读取更好，这里硬编码

      // 1. 检测所有环境
      const environments = detectEnvironments();
      const detected = environments.filter(env => env.detected);

      if (detected.length === 0) {
        return {
          content: [{
            type: "text",
            text: "❌ 未检测到支持的 AI 环境（Claude Code / Cursor / Windsurf / Cline）\n\n请确保至少安装了一个支持的 AI 环境。"
          }]
        };
      }

      // 2. 确定目标环境
      let targets: AIEnvironment[] = [];

      if (target === "all") {
        targets = detected;
      } else if (target === "auto") {
        // 优先当前环境，否则第一个检测到的
        targets = [detected[0]];
      } else {
        const found = detected.find(env => env.name === target);
        if (!found) {
          const detectedList = detected.map(e => `• ${e.name}`).join("\n");
          return {
            content: [{
              type: "text",
              text: `❌ 环境 ${target} 未检测到或不支持\n\n检测到的环境：\n${detectedList}`
            }]
          };
        }
        targets = [found];
      }

      // 3. 部署到目标环境
      const results = targets.map(env =>
        deployToEnvironment(env, namespace, includeHook, version)
      );

      // 4. 生成报告
      const summary = results.map(r => r.message).join("\n");
      const successCount = results.filter(r => r.success).length;
      const hasErrors = results.some(r => r.error);

      let errorDetails = "";
      if (hasErrors) {
        const errors = results.filter(r => r.error).map(r => `  ${r.error}`).join("\n");
        errorDetails = `\n\n⚠️ 错误详情：\n${errors}`;
      }

      const report = `📦 记忆系统初始化完成

${summary}

📝 部署内容：
• Skill 文件：/init-memory 命令
${includeHook ? "• SessionStart Hook：会话开始时自动加载记忆" : ""}
${includeHook ? "• Hook 配置：自动触发" : "• Hook 配置：未部署（需手动调用 /init-memory）"}

🎯 工作流程：
${includeHook ? "1. 会话开始 → 自动加载记忆 ✨" : "1. 手动输入 /init-memory 加载记忆"}
${includeHook ? "2. 对话进行中 → AI 主动保存重要信息 💾" : "2. 手动保存记忆"}

💡 提示：
AI 会在对话中主动识别并保存重要信息（偏好、决策、上下文等）

✨ ${successCount}/${targets.length} 个环境部署成功${errorDetails}`;

      return {
        content: [{ type: "text", text: report }]
      };
    }

    case "reset_init": {
      const markerFile = join(DATA_DIR, ".auto-init-done");

      if (!existsSync(markerFile)) {
        return {
          content: [{
            type: "text",
            text: "ℹ️ 自动初始化标记不存在，无需重置。\n\n下次 MCP 服务器启动时会自动执行初始化。"
          }]
        };
      }

      try {
        const { unlinkSync } = await import("fs");
        unlinkSync(markerFile);
        return {
          content: [{
            type: "text",
            text: "✅ 自动初始化标记已重置\n\n下次 MCP 服务器重启时将重新执行自动部署。"
          }]
        };
      } catch (err: any) {
        return {
          content: [{
            type: "text",
            text: `❌ 重置失败: ${err.message}`
          }]
        };
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// ── Auto-Init on First Run ───────────────────────────
async function autoInitIfNeeded() {
  const home = homedir();
  const markerFile = join(DATA_DIR, ".auto-init-done");

  // 如果已经初始化过，跳过
  if (existsSync(markerFile)) {
    return;
  }

  console.error("[xmszm-memory] First run detected, auto-initializing...");

  // 检测环境
  const environments = detectEnvironments();
  const detected = environments.filter(env => env.detected);

  if (detected.length === 0) {
    console.error("[xmszm-memory] No AI environment detected, skipping auto-init");
    return;
  }

  // 尝试从已有数据中获取 namespace
  let defaultNamespace = "user"; // 默认值

  try {
    if (existsSync(DATA_DIR)) {
      const { readdirSync } = await import("fs");
      const files = readdirSync(DATA_DIR).filter(f => f.endsWith(".json"));
      if (files.length > 0) {
        // 使用第一个找到的 namespace
        defaultNamespace = files[0].replace(".json", "");
      }
    }
  } catch {
    // 忽略错误，使用默认值
  }

  const version = "1.1.0";
  const results: string[] = [];

  // 部署到所有检测到的环境（包含 hook）
  for (const env of detected) {
    try {
      const result = deployToEnvironment(env, defaultNamespace, true, version);
      results.push(result.message);
      console.error(`[xmszm-memory] ${result.message}`);
    } catch (err: any) {
      console.error(`[xmszm-memory] Failed to deploy to ${env.name}: ${err.message}`);
    }
  }

  // 创建标记文件，避免重复初始化
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(markerFile, JSON.stringify({
      initialized: new Date().toISOString(),
      namespace: defaultNamespace,
      environments: detected.map(e => e.name),
      results
    }, null, 2), "utf-8");
    console.error("[xmszm-memory] Auto-init completed. Marker file created.");
  } catch (err: any) {
    console.error(`[xmszm-memory] Failed to create marker file: ${err.message}`);
  }
}

// ── Main ──────────────────────────────────────────────
async function main() {
  // 启动时自动初始化
  await autoInitIfNeeded();

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
