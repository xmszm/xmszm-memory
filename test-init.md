# Init 工具测试清单

## 测试步骤

### 1. 重启 Claude Code
新的 `init` 工具需要 MCP 服务器重启后才能使用。

### 2. 测试基本功能

```
请调用 mcp__xmszm-memory__init 工具，参数：
{
  namespace: "xmszm",
  target: "auto"
}
```

**预期结果**：
- ✅ 检测到 claude-code 环境
- ✅ 部署 skill 到 ~/.claude/commands/init-memory.md
- ✅ 部署 hook 到 ~/.claude/settings.json
- ✅ 返回成功消息

### 3. 验证部署结果

```bash
# 检查 skill 文件
cat ~/.claude/commands/init-memory.md

# 检查 hook 配置
cat ~/.claude/settings.json | grep -A 10 ConversationStart
```

### 4. 测试部署到所有环境

```
请调用 mcp__xmszm-memory__init 工具，参数：
{
  namespace: "xmszm",
  target: "all"
}
```

**预期结果**：
- 列出所有检测到的环境
- 逐个部署成功/失败状态

### 5. 测试不部署 hook

```
请调用 mcp__xmszm-memory__init 工具，参数：
{
  namespace: "test-user",
  target: "auto",
  includeHook: false
}
```

**预期结果**：
- 只部署 skill，不修改 settings.json

### 6. 验证自动加载（最终测试）

- 再次重启 Claude Code
- 开始新会话
- 观察是否自动调用 `load_session`

---

## 当前状态

- [x] 代码已实现
- [x] 已编译 (v1.1.0)
- [x] 已提交 Git
- [ ] 等待重启测试
- [ ] 验证部署文件
- [ ] 测试自动加载

---

## 快速验证命令

```bash
# 一键检查部署状态
echo "=== Skill File ===" && \
cat ~/.claude/commands/init-memory.md 2>/dev/null || echo "Not found" && \
echo -e "\n=== Hook Config ===" && \
cat ~/.claude/settings.json 2>/dev/null | grep -A 5 ConversationStart || echo "Not found"
```
