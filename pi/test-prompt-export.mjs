import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import promptExport, { extractPrompt } from "./extensions/prompt-export.ts";

const schema = { type: "object", properties: { path: { type: "string" } } };

test("system text and tools are found in each provider's request shape", () => {
  const responses = { instructions: "Top.", input: [{ role: "developer", content: "Base prompt." }, { role: "user", content: [{ type: "input_text", text: "hi" }] }],
    tools: [{ type: "function", name: "read", description: "Read a file", parameters: schema }] };
  assert.deepEqual(extractPrompt(responses), { system: ["Top.", "Base prompt."], tools: [{ name: "read", description: "Read a file", parameters: schema }] });
  const chat = { messages: [{ role: "system", content: "Chat system." }, { role: "user", content: "hi" }],
    tools: [{ type: "function", function: { name: "ls", description: "List", parameters: schema } }] };
  assert.deepEqual(extractPrompt(chat), { system: ["Chat system."], tools: [{ name: "ls", description: "List", parameters: schema }] });
  const anthropic = { system: [{ type: "text", text: "Part one." }, { type: "text", text: "Part two.", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: "hi" }], tools: [{ name: "grep", description: "Search", input_schema: schema }] };
  assert.deepEqual(extractPrompt(anthropic), { system: ["Part one.\n\nPart two."], tools: [{ name: "grep", description: "Search", parameters: schema }] });
  const google = { contents: [], config: { systemInstruction: { parts: [{ text: "Gemini system." }] },
    tools: [{ functionDeclarations: [{ name: "find", description: "Find", parametersJsonSchema: schema }] }] } };
  assert.deepEqual(extractPrompt(google), { system: ["Gemini system."], tools: [{ name: "find", description: "Find", parameters: schema }] });
  assert.deepEqual(extractPrompt(null), { system: [], tools: [] });
});

test("the command exports the last request of the session with owner-only files", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "pi-prompt-export-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const handlers = {}, commands = {}, notices = [];
  promptExport({ on: (event, handler) => { handlers[event] = handler; }, registerCommand: (name, options) => { commands[name] = options; } });
  const ctx = { cwd: root, model: { provider: "openai", id: "gpt-test" }, ui: { notify: (message, level) => notices.push([message, level]) } };
  await commands["export-prompt"].handler("", ctx);
  assert.equal(notices.pop()[1], "warning");
  for (const text of ["Old prompt.", "Current prompt with 中文."]) {
    assert.equal(handlers.before_provider_request({ type: "before_provider_request", payload: { input: [{ role: "developer", content: text }],
      tools: [{ type: "function", name: "read", description: "Read", parameters: schema }] } }, ctx), undefined);
  }
  await commands["export-prompt"].handler("out", ctx);
  const out = join(root, "out");
  assert.equal(readFileSync(join(out, "system-prompt.md"), "utf8"), "Current prompt with 中文.\n");
  assert.match(readFileSync(join(out, "tools.md"), "utf8"), /^# 工具定义（1 个）\n\n来自 openai\/gpt-test 在 .*\n\n## read\n\nRead\n/);
  assert.equal(JSON.parse(readFileSync(join(out, "request.json"), "utf8")).input[0].content, "Current prompt with 中文.");
  for (const name of ["system-prompt.md", "tools.md", "request.json"]) assert.equal(statSync(join(out, name)).mode & 0o777, 0o600);
  assert.equal(statSync(out).mode & 0o777, 0o700);
  const [message, level] = notices.pop();
  assert.equal(level, "info");
  assert.match(message, /openai\/gpt-test/);
  handlers.session_start({ type: "session_start" }, ctx);
  await commands["export-prompt"].handler("", ctx);
  assert.equal(notices.pop()[1], "warning");
});
