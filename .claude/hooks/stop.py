#!/usr/bin/env python3
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
- namespace: "xmszm"
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
