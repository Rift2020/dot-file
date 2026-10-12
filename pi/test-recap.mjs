import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

// The extension imports Pi's packages at runtime; inside Pi they come from the
// installed release, so resolve them from there for the test as well.
const install = join(homedir(), ".pi/agent/install");
const release = join(install, "releases", readFileSync(join(install, "current-version"), "utf8").trim());
register(`data:text/javascript,${encodeURIComponent(`
const parentURL = ${JSON.stringify(pathToFileURL(join(release, "resolve.js")).href)};
export function resolve(specifier, context, next) {
  return next(specifier, specifier.startsWith("@earendil-works/") ? { ...context, parentURL } : context);
}`)}`);
const { default: recap, alignPrefix, clipRecap, eligible, RECAP_PROMPT } = await import("./extensions/recap.ts");

const user = (text) => ({ type: "message", message: { role: "user", content: [{ type: "text", text }], timestamp: 1 } });
const assistant = (text) => ({ type: "message", message: { role: "assistant", content: [{ type: "text", text }], api: "openai-responses",
  provider: "openai", model: "m", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  stopReason: "stop", timestamp: 2 } });
const marker = { type: "custom", customType: "recap", data: { text: "old" } };
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

test("a first recap needs three user turns, later ones two more", () => {
  assert.equal(eligible([user("a"), assistant("b"), user("c")]), false);
  assert.equal(eligible([user("a"), user("b"), user("c")]), true);
  assert.equal(eligible([user("a"), user("b"), user("c"), marker, user("d")]), false);
  assert.equal(eligible([user("a"), user("b"), user("c"), marker, user("d"), assistant("e"), user("f")]), true);
  assert.equal(clipRecap(`  ${"字".repeat(500)} `).length, 400);
  assert.equal(clipRecap(" 短句。 "), "短句。");
});

function harness({ mode = "tui", branch = [user("修好登录"), assistant("好"), user("再看日志"), assistant("看了"), user("继续")], reply, editor = "" } = {}) {
  const handlers = {}, commands = {}, entries = [], notices = [], requests = [];
  let renderer;
  const pi = {
    on: (event, handler) => { handlers[event] = handler; },
    registerCommand: (name, options) => { commands[name] = options; },
    registerEntryRenderer: (_type, render) => { renderer = render; },
    appendEntry: (customType, data) => entries.push({ customType, data }),
    getActiveTools: () => ["read", "bash"],
    getAllTools: () => [{ name: "read", description: "Read", parameters: { type: "object" }, exposure: "default" },
      { name: "bash", description: "Run", parameters: { type: "object" } }, { name: "hidden", description: "Off", parameters: {} }],
  };
  const ctx = {
    mode, model: { provider: "openai", id: "m", reasoning: true },
    isIdle: () => true, hasPendingMessages: () => false, getSystemPrompt: () => "系统提示",
    ui: { getEditorText: () => editor, notify: (message, level) => notices.push([message, level]) },
    sessionManager: { getBranch: () => branch, getSessionId: () => "session-1",
      buildSessionProjection: () => ({ messages: branch.filter((entry) => entry.type === "message").map((entry) => entry.message) }) },
    modelRegistry: { streamSimple: (model, context, options) => {
      requests.push({ model, context, options });
      return { result: async () => reply ?? { stopReason: "stop", provider: "openai", model: "m", content: [{ type: "thinking", thinking: "x" }, { type: "text", text: " 在修登录；下一步看日志。 " }],
        usage: { input: 10, cacheRead: 900, output: 20, cost: { total: 0.01 } } } };
    } },
  };
  recap(pi);
  return { handlers, commands, entries, notices, requests, ctx, render: (...args) => renderer(...args) };
}

test("when a reply ends the session model recaps with the conversation's prompt, tools and cache key", async () => {
  const h = harness();
  h.handlers.session_start({}, h.ctx);
  h.handlers.agent_settled({ aborted: false }, h.ctx);
  await wait(10);
  assert.equal(h.requests.length, 1);
  const { context, options } = h.requests[0];
  assert.equal(context.systemPrompt, "系统提示");
  assert.deepEqual(context.tools.map((tool) => tool.name), ["read", "bash"]);
  assert.deepEqual(Object.keys(context.tools[0]), ["name", "description", "parameters"]);
  assert.equal(context.messages.length, 6);
  assert.equal(context.messages.at(-1).content[0].text, RECAP_PROMPT);
  assert.deepEqual([options.reasoning, options.toolChoice, options.sessionId], ["low", "none", "session-1"]);
  assert.equal(h.entries.length, 1);
  assert.equal(h.entries[0].customType, "recap");
  assert.deepEqual({ ...h.entries[0].data, at: undefined }, { text: "在修登录；下一步看日志。", model: "openai/m", at: undefined,
    usage: { input: 10, cacheRead: 900, output: 20, cost: 0.01 } });
  const lines = h.render({ data: h.entries[0].data }, { expanded: false }, { fg: (_color, text) => text, bold: (text) => text, italic: (text) => text }).render(80);
  assert.match(lines.join("\n"), /※ recap: 在修登录；下一步看日志。/);
});

test("no automatic recap for short sessions, drafts, excluded models, or non-interactive runs", async () => {
  const excluded = harness();
  excluded.ctx.model = { provider: "openai", id: "gpt-6-astra", reasoning: true };
  const cases = [harness({ branch: [user("a"), assistant("b"), user("c")] }), harness({ editor: "写到一半" }), harness({ mode: "print" }), excluded];
  for (const h of cases) {
    h.handlers.session_start({}, h.ctx);
    h.handlers.agent_settled({ aborted: false }, h.ctx);
  }
  await wait(10);
  for (const h of cases) assert.deepEqual([h.requests.length, h.entries.length], [0, 0]);
});

test("input during generation drops the stale recap", async () => {
  let release;
  const h = harness();
  const streamSimple = h.ctx.modelRegistry.streamSimple;
  h.ctx.modelRegistry.streamSimple = (...args) => {
    const stream = streamSimple(...args);
    return { result: () => new Promise((done) => { release = () => done(stream.result()); }) };
  };
  h.handlers.session_start({}, h.ctx);
  h.handlers.agent_settled({ aborted: false }, h.ctx);
  h.handlers.input({ type: "input", text: "下一个问题", source: "interactive" }, h.ctx);
  assert.equal(h.requests[0].options.signal.aborted, true);
  release();
  await wait(10);
  assert.equal(h.entries.length, 0);
});

test("there is no /recap command, and a failed recap writes nothing and says nothing", async () => {
  const failed = harness({ reply: { stopReason: "error", errorMessage: "rate limited", content: [], usage: {} } });
  assert.deepEqual(Object.keys(failed.commands), []);
  failed.handlers.session_start({}, failed.ctx);
  failed.handlers.agent_settled({ aborted: false }, failed.ctx);
  await wait(10);
  assert.deepEqual([failed.requests.length, failed.entries.length, failed.notices.length], [1, 0, 0]);
});

test("the recap request takes the system prompt and tools of the conversation's last request", () => {
  const last = { model: "m", instructions: "sent", tools: [{ name: "b" }, { name: "a" }],
    input: [{ role: "developer", content: "rewritten prompt" }, { role: "user", content: "q1" }] };
  const recapPayload = { model: "m", tool_choice: "none", tools: [{ name: "a" }, { name: "b" }],
    input: [{ role: "developer", content: "original prompt" }, { role: "user", content: "q1" }, { role: "assistant", content: "a1" }, { role: "user", content: RECAP_PROMPT }] };
  assert.deepEqual(alignPrefix(recapPayload, last), { model: "m", tool_choice: "none", instructions: "sent", tools: last.tools,
    input: [last.input[0], ...recapPayload.input.slice(1)] });
  const anthropic = alignPrefix({ system: "orig", messages: [{ role: "user", content: "q" }] }, { system: [{ type: "text", text: "sent" }], tools: [], messages: [] });
  assert.deepEqual(anthropic, { system: [{ type: "text", text: "sent" }], tools: [], messages: [{ role: "user", content: "q" }] });
  const google = alignPrefix({ contents: [], config: { systemInstruction: "orig", toolConfig: { mode: "NONE" } } },
    { contents: [], config: { systemInstruction: "sent", tools: [{ functionDeclarations: [] }] } });
  assert.deepEqual(google.config, { systemInstruction: "sent", tools: [{ functionDeclarations: [] }], toolConfig: { mode: "NONE" } });
  assert.equal(alignPrefix({ input: [] }, undefined), undefined);
});

test("system prompt checkpoints in the session are not sent with the recap", async () => {
  const checkpoint = { type: "message", message: { role: "system", content: "Updated system prompt section", timestamp: 0 } };
  const h = harness({ branch: [checkpoint, user("a"), assistant("b"), user("c"), assistant("d"), user("e")] });
  h.handlers.session_start({}, h.ctx);
  h.handlers.before_provider_request({ type: "before_provider_request", payload: { input: [] } }, h.ctx);
  h.handlers.agent_settled({ aborted: false }, h.ctx);
  await wait(10);
  assert.deepEqual(h.requests[0].context.messages.map((message) => message.role), ["user", "assistant", "user", "assistant", "user", "user"]);
  assert.equal(typeof h.requests[0].options.onPayload, "function");
});
