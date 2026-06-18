# xmszm-memory — MCP 记忆服务使用说明

## 概述

xmszm-memory 是一个 MCP（Model Context Protocol）记忆服务，通过 URI-only 记忆为 AI 客户端提供跨会话的持久记忆存取。

每条记忆使用 `uri` 作为唯一标识。没有 `key` 字段，也不要调用或假设任何 key-based API。

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
| `search(namespace, query)` | 按关键词搜索 active 记忆，会搜索 `uri/content/disclosure/tags/source` | **主入口**。不知道具体 URI 时先调这个 |
| `read(namespace, uri)` | 用精确 URI 读取一条 active 记忆 | 仅当已知道 exact URI |
| `list(namespace, prefix?)` | 浏览 active 记忆，可按 URI prefix 过滤 | 已知道 URI 前缀、想浏览一组记忆时 |
| `create(namespace, uri, content, disclosure, priority?, tags?, source?)` | 创建一条新记忆 | 用户告知新信息或偏好，且目标 URI 不存在时 |
| `update(namespace, uri, fields)` | 修改已有 active 记忆，不改变 `createdAt` | 需要修改正文、触发条件、优先级、标签或来源时 |
| `delete(namespace, uri)` | 软删除一条 active 记忆，设置 `deletedAt` | 用户要求删除时；必须知道 exact URI |

## 正确调用流程

```text
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
