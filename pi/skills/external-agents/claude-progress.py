#!/usr/bin/env python3
"""Shows a `claude -p --output-format stream-json --verbose` run while it happens.

Reads the stream on stdin and keeps every line in the file named by the first argument. Prints a line
when a subagent starts or finishes, then the final answer with the session id and the estimated cost.
Exits 1 when the run failed or ended without a result.
"""
import json
import sys

STATUS = {"completed": "完成", "failed": "失败", "killed": "被停止", "stopped": "被停止"}


def main() -> int:
    agents: dict[str, str] = {}
    result = None
    with open(sys.argv[1], "w", encoding="utf-8") as log:
        for line in iter(sys.stdin.readline, ""):
            log.write(line)
            log.flush()
            try:
                event = json.loads(line)
            except ValueError:
                continue
            kind = (event.get("type"), event.get("subtype"))
            task = event.get("task_id")
            if kind == ("system", "task_started") and event.get("task_type") == "local_agent":
                agents[task] = event.get("description") or task
                print(f"子代理 {len(agents)} 开始：{agents[task]}", flush=True)
            elif kind == ("system", "task_notification") and task in agents:
                status = event.get("status")
                print(f"子代理{STATUS.get(status, status)}：{agents[task]}", flush=True)
            elif event.get("type") == "result":
                result = event
    if result is None:
        print(f"没有拿到结果，看 {sys.argv[1]} 和 stderr", flush=True)
        return 1
    failed = bool(result.get("is_error")) or result.get("subtype") != "success"
    cost = result.get("total_cost_usd") or 0
    print(f"\n[{'出错' if failed else '完成'} · 会话 {result.get('session_id')} · 估算 ${cost:.2f}]")
    denied = sorted({item.get("tool_name", "?") for item in result.get("permission_denials") or []})
    if denied:
        print(f"[被拒绝的工具：{', '.join(denied)}]")
    print(result.get("result") or "")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
