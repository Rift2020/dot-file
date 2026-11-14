import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = join(dirname(fileURLToPath(import.meta.url)), "skills/external-agents/claude-progress.py");

/** Feeds `lines` to claude-progress.py the way `claude -p --output-format stream-json` would. */
function run(t, lines) {
  const dir = mkdtempSync(join(tmpdir(), "external-agents-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = join(dir, "events.jsonl");
  const input = lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n") + "\n";
  const result = spawnSync("python3", [script, log], { input, encoding: "utf8" });
  return { ...result, log: readFileSync(log, "utf8"), input };
}

const started = (id, description, type = "local_agent") =>
  ({ type: "system", subtype: "task_started", task_id: id, task_type: type, description });
const notified = (id, status) => ({ type: "system", subtype: "task_notification", task_id: id, status });

test("subagent starts and ends are shown, then the answer, session and cost", (t) => {
  const r = run(t, [
    { type: "system", subtype: "init", session_id: "s1" },
    started("a1", "读 a.txt"),
    started("a2", "读 b.txt"),
    started("b1", "sleep 20", "local_bash"),
    notified("b1", "completed"),
    notified("a2", "completed"),
    notified("a1", "failed"),
    "not json",
    { type: "result", subtype: "success", is_error: false, session_id: "s1", total_cost_usd: 0.2068, result: "两个都读完了" },
  ]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.log, r.input);
  assert.deepEqual(r.stdout.trim().split("\n"), [
    "子代理 1 开始：读 a.txt",
    "子代理 2 开始：读 b.txt",
    "子代理完成：读 b.txt",
    "子代理失败：读 a.txt",
    "",
    "[完成 · 会话 s1 · 估算 $0.21]",
    "两个都读完了",
  ]);
});

test("a failed run reports the denied tools and exits 1", (t) => {
  const r = run(t, [{
    type: "result", subtype: "success", is_error: true, session_id: "s2", total_cost_usd: 0.05, result: "没做成",
    permission_denials: [{ tool_name: "Read" }, { tool_name: "Bash" }, { tool_name: "Read" }],
  }]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\[出错 · 会话 s2 · 估算 \$0\.05\]\n\[被拒绝的工具：Bash, Read\]\n没做成/);
  const limit = run(t, [{ type: "result", subtype: "error_max_turns", is_error: false, session_id: "s3" }]);
  assert.equal(limit.status, 1);
  assert.match(limit.stdout, /\[出错 · 会话 s3 · 估算 \$0\.00\]/);
});

test("a stream without a result says where to look", (t) => {
  const r = run(t, [started("a1", "读 a.txt")]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /没有拿到结果，看 .*events\.jsonl 和 stderr/);
});
