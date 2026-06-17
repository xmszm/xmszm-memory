# xmszm-memory MCP Server

这是 xmszm-memory MCP 服务器的开发项目。

## 🎯 会话启动协议

**重要**：每次新会话开始时，立即执行以下命令加载记忆系统：

```
/init-memory
```

这会调用 `mcp__xmszm-memory__load_session(namespace="xmszm")` 加载所有触发记忆，包括：
- 身份设定
- 称呼偏好  
- 工具使用习惯
- 项目上下文

## 开发说明

- MCP 服务器配置：`.mcp.json`
- 数据存储：`~/.xmszm-memory/`
- Skill 文件：`~/.claude/commands/init-memory.md`
