#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Session Start Hook - Auto-load memory
"""
import json
import sys

def main():
    """Output hook result that triggers memory loading."""

    context = """🎯 会话启动协议

请立即调用以下工具加载记忆：

mcp__xmszm-memory__load_session(namespace="xmszm")

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
