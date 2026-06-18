# xmszm-memory — MCP 记忆服务使用说明

## 概述

xmszm-memory 是一个 MCP（Model Context Protocol）记忆服务，通过 URI-only 记忆为 AI 客户端提供跨会话的持久记忆存取。

每条记忆使用 `uri` 作为唯一标识。没有 `key` 字段，也不要调用或假设任何 key-based API。

## 三段式使用流程

```text
1. 配置 MCP
   -> 客户端能看到 xmszm-memory 工具。

2. 首次使用初始化
   -> initialize(namespace, profile?) 创建 boot/personality 记忆。
   -> boot_instructions(namespace, target?) 生成要写入 AGENTS.md、CLAUDE.md、.cursorrules 或全局指令的启动规则。

3. 正常对话
   -> 已安装的客户端规则让每个新会话先调用 initialize(...) 和 read(..., "system://boot")。
   -> 对话中按需 search/read/list 召回记忆，create/update/delete 维护长期记忆。
```

注意：MCP Server 只能提供工具，不能强迫客户端在会话开始时自动调用工具。自动加载记忆必须依赖 `boot_instructions` 返回的客户端/项目规则。

## Memory 字段

| 字段 | 说明 |
|------|------|
| `uri` | 记忆唯一 URI，例如 `memory://admin/project/password-policy` |
| `content` | 记忆正文 |
| `disclosure` | 触发条件，描述什么时候应该主动检索这条记忆 |
| `priority` | 数字优先级，只能是 `0`、`1`、`2`，默认 `2` |
| `tags` | 字符串数组，默认 `[]` |
| `source` | 类枚举字符串来源，默认 `"assistant_inferred"` |
| `createdAt` | 创建时间，update 不会修改 |
| `updatedAt` | 最近更新时间 |
| `deletedAt` | delete 设置的软删除时间；存在时默认不再被 read/search/list 返回 |

## 工具列表

| 工具 | 作用 | 使用时机 |
|------|------|---------|
| `list_namespaces()` | 列出所有用户命名空间 | 首次连接时，确认有哪些用户；不会返回记忆内容 |
| `initialize(namespace, profile?)` | 初始化 v2.1 boot/personality 记忆；`profile` 默认为 `"assistant"`，也支持 `"blank"` | 新会话开始且 namespace 可能为空时调用一次；幂等，不覆盖 active 已有记忆 |
| `boot_instructions(namespace, target?)` | 生成可复制到客户端全局/项目规则的启动指令；`target` 支持 `generic/project/claude-code/codex/cursor/windsurf` | 第一次接入某个客户端时调用一次，让后续新会话自动 initialize + read system://boot |
| `search(namespace, query)` | 按关键词搜索 active 记忆，会搜索 `uri/content/disclosure/tags/source` | **主入口**。不知道具体 URI 时先调这个 |
| `read(namespace, uri)` | 用精确 URI 读取一条 active 记忆；支持特殊 URI `system://boot` 和 `system://diagnostic/identity` | 新会话初始化后先读 `system://boot`；其他记忆仅当已知道 exact URI |
| `list(namespace, prefix?)` | 浏览 active 记忆，可按 URI prefix 过滤 | 已知道 URI 前缀、想浏览一组记忆时 |
| `create(namespace, uri, content, disclosure, priority?, tags?, source?)` | 创建一条新记忆 | 用户告知新信息或偏好，且目标 URI 不存在时 |
| `update(namespace, uri, fields)` | 修改已有 active 记忆，不改变 `createdAt` | 需要修改正文、触发条件、优先级、标签或来源时 |
| `delete(namespace, uri)` | 软删除一条 active 记忆，设置 `deletedAt` | 用户要求删除时；必须知道 exact URI |

## 首次初始化与 Boot / Personality 流程

首次接入某个客户端时，先调用：

```text
initialize(namespace, "assistant")
read(namespace, "system://boot")
boot_instructions(namespace, target?)
```

然后把 `boot_instructions` 返回的规则安装到该客户端的全局或项目规则中。

安装规则后，新会话开始时，如果 namespace 可能为空或不确定是否已初始化，客户端应先调用：

```text
initialize(namespace, "assistant")  # 默认 profile，可省略第二个参数
read(namespace, "system://boot")
```

`initialize` 必须幂等：

- active 已存在的 URI 只报告为 `skipped_active_existing`，不得覆盖。
- 缺失的默认记忆报告为 `created`。
- 默认写入 `priority=0`、`source="system_initialized"`，并带有 `identity` / `boot` 等 tags。

Profiles：

| profile | 行为 |
|---------|------|
| `"assistant"` | 创建默认 identity/principles/boundaries/workflow 记忆，至少包括 `identity://default/self`、verification、no-fake-execution、conflict-resolution、relationship/user、boundaries、boundaries/reality、workflow/coding。 |
| `"blank"` | 只创建最小结构占位，例如 `identity://default/self` 和 boundaries；不得假设用户特定偏好。 |

特殊读取：

| URI | 返回内容 |
|-----|----------|
| `system://boot` | active 的 `identity://default/*` 记忆 + 所有 active `priority=0` 记忆；按 URI 去重、排序，并附带简短 routing guide。 |
| `system://diagnostic/identity` | 报告 core identity URI 是否存在、缺失项、active 数量、priority-0 数量，以及缺少 boundaries / verification / no-fake-execution 时的 warnings。 |

## 正确调用流程

```text
[新会话]
    |
    v
initialize(namespace, profile?)  <- namespace 可能为空时先调用一次
    |
    v
read(namespace, "system://boot") <- 回答前读取 boot context

[用户消息]
    |
    v
search(namespace, query)  <- 解析消息中的关键词，搜相关记忆
    |
    +- 有匹配 -> read(namespace, uri) 看完整内容，必要时 update/delete
    +- 无匹配 -> 正常处理消息，如需保存新信息则 create(namespace, uri, ...)
```

浏览某类 URI：

```text
list(namespace, prefix) -> read/update/delete(namespace, exactUri)
```

## 启动规则安装

第一次接入某个客户端时，先调用：

```text
boot_instructions(namespace, target?)
```

把返回的规则复制到该客户端的全局指令或项目规则文件里。否则 MCP 只是“可用”，模型可能直到用户明确询问 xmszm-memory 才会加载工具；安装启动规则后，后续新会话才会主动 initialize + read `system://boot`。

常用 target：

```text
boot_instructions("admin", "generic")
boot_instructions("admin", "codex")
boot_instructions("admin", "claude-code")
boot_instructions("admin", "cursor")
```

## 重要规则

- 不要猜 URI 去调 `read`、`update` 或 `delete`，先用 `search` 或 `list` 找到 exact URI。
- 不要只调 `list_namespaces` 就结束，它只返回用户名，不返回记忆内容。
- `search` 的 query 不能为空，必须有实际关键词。
- `create` 只创建新记忆；如果 URI 已存在会拒绝覆盖。修改已有记忆必须用 `update`。
- `delete` 是软删除，只设置 `deletedAt`，不会从 JSON 文件物理移除记录。
- 已删除记忆默认不会出现在 `read`、`search`、`list` 结果中；读取已删除 URI 应视为未找到或已删除。

## disclosure（触发条件）机制

每条记忆可以附带 `disclosure` 字段，描述什么时候应该触发这条记忆。

**AI 的行为准则：**

1. 当用户消息中的关键词可能匹配某条记忆的 `disclosure` 描述时，应主动 `search(namespace, query)`。
2. 仍需通过 `search` 来发现 URI，不要凭印象直接 `read`。

## 命名空间规则

- `admin` — 你（开发者）的个人记忆
- 其他命名空间按实际用户划分
- 创建新记忆时，namespace 请确认后再写入

## 数据存储

数据文件在 `~/.xmszm-memory/<namespace>.json`，纯 JSON 格式，AI 客户端**不要直接读写文件**，必须通过 MCP 工具操作。
