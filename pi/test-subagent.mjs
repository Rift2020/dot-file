import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// The extension imports Pi's packages at runtime; inside Pi they come from the
// installed release, so resolve them from there for the test as well.
const install = join(homedir(), ".pi/agent/install");
const release = join(install, "releases", readFileSync(join(install, "current-version"), "utf8").trim());
register(`data:text/javascript,${encodeURIComponent(`
const parentURL = ${JSON.stringify(pathToFileURL(join(release, "resolve.js")).href)};
export function resolve(specifier, context, next) {
  const pi = specifier.startsWith("@earendil-works/") || specifier === "typebox" || specifier.startsWith("typebox/");
  return next(specifier, pi ? { ...context, parentURL } : context);
}`)}`);
const base = realpathSync(mkdtempSync(join(tmpdir(), "subagent-test-")));
after(() => rmSync(base, { recursive: true, force: true }));
// Children read settings from the agent directory; keep the real one out of it.
process.env.PI_CODING_AGENT_DIR = join(base, "agent");
mkdirSync(process.env.PI_CODING_AGENT_DIR);
const ext = await import("./extensions/subagent.ts");
const ai = await import("@earendil-works/pi-ai");
const sdk = await import("@earendil-works/pi-coding-agent");

const faux = ai.fauxProvider({ provider: "faux-test", models: [{ id: "fast", reasoning: true }] });
const runtime = await sdk.ModelRuntime.create({ authPath: join(base, "auth.json"), modelsPath: null, refreshOnCreate: false });
runtime.registerNativeProvider(faux.provider);
const MODELS = { flash: { model: "faux-test/fast", thinking: "high" } };
const USAGE = { input: 60, output: 40, cacheRead: 0, cacheWrite: 0, totalTokens: 100,
  cost: { input: 0.006, output: 0.004, cacheRead: 0, cacheWrite: 0, total: 0.01 } };

const textOf = (message) => typeof message.content === "string" ? message.content
  : message.content.map((part) => part.text ?? "").join("");

/** Scripted children: `answer` maps a request to a reply; every request is recorded. */
function script(answer) {
  const requests = [];
  const step = async (context, options) => {
    const last = context.messages.at(-1);
    const system = context.messages.filter((message) => message.role === "system" || message.role === "developer");
    const request = { tools: ai.getCurrentTools(context.messages).map((tool) => tool.name), text: textOf(last),
      role: last.role, messages: context.messages, system: JSON.stringify(system), signal: options?.signal };
    requests.push(request);
    const reply = await answer(request);
    return typeof reply === "string" ? ai.fauxAssistantMessage(reply) : reply;
  };
  faux.setResponses(Array.from({ length: 50 }, () => step));
  return requests;
}

let sessions = 0;
function parent({ limits = [ext.limiter(4), ext.limiter(4)], sandbox = (command) => command, file = true } = {}) {
  const cwd = join(base, `project-${++sessions}`);
  mkdirSync(cwd);
  const root = join(base, `subagents-${sessions}`);
  const sessionDir = join(base, `sessions-${sessions}`);
  const sessionManager = file ? sdk.SessionManager.create(cwd, sessionDir) : sdk.SessionManager.inMemory(cwd);
  const notices = [];
  const ctx = { cwd, sessionManager, modelRegistry: { runtime, find: (provider, id) => runtime.getModel(provider, id) },
    ui: { notify: (message, level) => notices.push([message, level]) } };
  const options = { depth: 0, root, models: MODELS, limits, sandbox };
  const load = () => {
    const tools = new Map();
    const handlers = new Map();
    const commands = new Map();
    ext.subagents(options)({ registerTool: (tool) => tools.set(tool.name, tool), on: (event, handler) => handlers.set(event, handler),
      registerCommand: (name, command) => commands.set(name, command), getAllTools: () => [] });
    const call = (tasks, signal) => tools.get("subagent").execute("call", { tasks }, signal, undefined, ctx);
    const fire = (event, fields = {}) => handlers.get(event)({ type: event, ...fields }, ctx);
    return { tools, handlers, commands, call, fire };
  };
  return { cwd, root, sessionDir, sessionManager, ctx, notices, load,
    childDir: () => join(root, sessionManager.getSessionId()) };
}

const header = (file) => JSON.parse(readFileSync(file, "utf8").split("\n", 1)[0]);
/** Tokens the replies in a session file used; the faux provider counts them itself. */
const tokens = (file) => readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line))
  .filter((entry) => entry.type === "message" && entry.message.role === "assistant")
  .reduce((sum, entry) => sum + entry.message.usage.totalTokens, 0);

test("a finished job hands its slot to the next one, so no more than the limit run", async () => {
  const limit = ext.limiter(2);
  let running = 0;
  let peak = 0;
  const job = () => limit(async () => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running--;
  });
  await Promise.all(Array.from({ length: 7 }, job));
  assert.equal(peak, 2);
  await assert.rejects(limit(async () => { throw new Error("boom"); }), /boom/);
  await Promise.all([job(), job()]); // a failed job still gives its slot back
  assert.equal(peak, 2);
});

test("retry waits keep Pi's backoff but each is scaled by 0.5–1.5, also at the cap", () => {
  const random = [0, 0.5, 0.999];
  const settings = ext.jitterRetries(sdk.SettingsManager.inMemory({ retry: { baseDelayMs: 5000, maxRetries: 5 } }),
    () => random.shift());
  assert.equal(ai.retryDelayMs(settings.getRetrySettings(), 1), 2500);
  assert.equal(ai.retryDelayMs(settings.getRetrySettings(), 3), 20_000);
  assert.equal(ai.retryDelayMs(settings.getRetrySettings(), 5), 89_940); // 60 s cap × 1.499
  assert.equal(settings.getRetrySettings().maxRetries, 5);
  const untouched = sdk.SettingsManager.inMemory({ retry: { baseDelayMs: 5000 } });
  assert.equal(ai.retryDelayMs(untouched.getRetrySettings(), 1), 5000);
});

test("the sandbox command for each platform, and none without a sandbox", () => {
  const work = "/w/it's here";
  const mac = ext.sandboxCommand("echo 'hi'", work, "darwin", () => true, "/private/var/T");
  assert.match(mac, /^\/usr\/bin\/sandbox-exec -p '\(version 1\)\(allow default\)\(deny file-write\*\)/);
  assert.ok(mac.includes(`(subpath "/w/it'\\''s here") (subpath "/private/var/T") (literal "/dev/null")`));
  assert.ok(mac.endsWith(` /bin/bash -c 'echo '\\''hi'\\'''`));
  const linux = ext.sandboxCommand("ls", work, "linux", (path) => path === "/usr/bin/bwrap", "/tmp");
  assert.equal(linux, `/usr/bin/bwrap --ro-bind / / --dev /dev --tmpfs /tmp --bind '/w/it'\\''s here' '/w/it'\\''s here'`
    + ` --chdir '/w/it'\\''s here' --die-with-parent /bin/bash -c 'ls'`);
  assert.equal(ext.sandboxCommand("ls", work, "linux", () => false, "/tmp"), undefined);
  assert.equal(ext.sandboxCommand("ls", work, "darwin", () => false, "/tmp"), undefined);
  assert.equal(ext.sandboxCommand("ls", work, "win32", () => true, "/tmp"), undefined);
});

test("inside the real sandbox a command writes its own directory but nothing else", (t) => {
  const work = join(base, "sandbox it's");
  // Not in a temp dir: on Linux the sandbox gives /tmp its own empty copy, so writes there just vanish.
  const outside = join(dirname(fileURLToPath(import.meta.url)), ".sandbox-probe");
  t.after(() => rmSync(outside, { force: true }));
  mkdirSync(work);
  // The test folder sits in the system temp dir, which the sandbox lets commands write; allow another one instead.
  const command = ext.sandboxCommand(`echo in > inside.txt; git init -q repo && git -C repo status --short; echo out > '${outside}'`,
    work, process.platform, existsSync, join(base, "allowed-temp"));
  if (!command) return t.skip("no sandbox-exec or bubblewrap on this machine");
  const result = spawnSync("/bin/sh", ["-c", command], { cwd: work, encoding: "utf8" });
  assert.equal(readFileSync(join(work, "inside.txt"), "utf8"), "in\n");
  assert.ok(existsSync(join(work, "repo", ".git")));
  assert.equal(existsSync(outside), false);
  assert.notEqual(result.status, 0);
});

test("usage adds every reply and the nested work tool results report", () => {
  const total = ext.addUsage(ext.emptyUsage(), [
    { role: "user", usage: USAGE }, { role: "assistant", usage: USAGE }, { role: "toolResult" },
    { role: "toolResult", usage: USAGE },
  ]);
  assert.equal(total.totalTokens, 200);
  assert.equal(Math.round(total.cost.total * 1000), 20);
});

test("startup cleanup drops folders whose parent session is gone; /subagent-clean drops other sessions' directories", () => {
  const root = join(base, "sweep");
  const live = join(base, "live.jsonl");
  writeFileSync(live, "");
  const folder = (name, parent) => {
    mkdirSync(join(root, name, "a1"), { recursive: true });
    if (parent !== undefined) writeFileSync(join(root, name, "a1.jsonl"), JSON.stringify({ type: "session", parentSession: parent }) + "\n");
  };
  folder("kept", live);
  folder("gone", join(base, "deleted.jsonl"));
  folder("current", join(base, "also-deleted.jsonl"));
  folder("unwritten");
  ext.sweep(root, "current");
  assert.deepEqual(readdirSync(root).sort(), ["current", "kept", "unwritten"]);
  ext.clean(root, "current");
  assert.deepEqual(readdirSync(join(root, "kept")), ["a1.jsonl"]);
  assert.deepEqual(readdirSync(join(root, "current")).sort(), ["a1", "a1.jsonl"]);
});

test("parallel children answer in one result, each with its tier's tools, outside the parent's session folder", async () => {
  const requests = script(({ text }) => `answer: ${text}`);
  const p = parent();
  const { call, tools } = p.load();
  assert.match(tools.get("subagent").description, /Use only when the user asks for subagents/);
  const result = await call([{ task: "alpha" }, { task: "beta", tools: "write" }]);
  assert.equal(result.content[0].text, "[a1 · flash high · read · 0 次工具调用]\nanswer: alpha\n\n"
    + "[a2 · flash high · write · 0 次工具调用]\nanswer: beta");
  assert.equal(result.isError, false);
  assert.equal(result.usage.totalTokens, tokens(join(p.childDir(), "a1.jsonl")) + tokens(join(p.childDir(), "a2.jsonl")));
  const byTask = Object.fromEntries(requests.map((request) => [request.text, request]));
  assert.deepEqual(byTask.alpha.tools, ["read", "grep", "find", "ls", "bash", "subagent"]);
  assert.deepEqual(byTask.beta.tools, ["read", "bash", "edit", "write", "grep", "find", "ls", "subagent"]);
  assert.ok(byTask.alpha.system.includes("## 子代理") && byTask.alpha.system.includes(join(p.childDir(), "a1")));
  assert.ok(byTask.alpha.system.includes("只读"));
  assert.equal(header(join(p.childDir(), "a1.jsonl")).parentSession, p.sessionManager.getSessionFile());
  assert.ok(existsSync(join(p.childDir(), "a2")));
  assert.equal(existsSync(p.sessionDir) && readdirSync(p.sessionDir).some((name) => name.includes("a1")), false);
});

test("no more than the limit run at once on a level; the rest wait their turn", async () => {
  let running = 0;
  let peak = 0;
  script(async ({ text }) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 30));
    running--;
    return `done ${text}`;
  });
  const { call } = parent({ limits: [ext.limiter(2), ext.limiter(2)] }).load();
  const result = await call(["t1", "t2", "t3", "t4", "t5"].map((task) => ({ task })));
  assert.equal(peak, 2);
  assert.equal(result.details.tasks.filter((task) => task.ok).length, 5);
});

test("a follow-up by id keeps the context, the model and the tools, also after a restart", async () => {
  const requests = script(({ text, messages }) => `${text} (${messages.filter((m) => m.role === "user").length} user messages)`);
  const p = parent();
  let loaded = p.load();
  await loaded.call([{ task: "first", tools: "write" }]);
  const again = await loaded.call([{ task: "second", followUp: "a1" }]);
  assert.equal(again.content[0].text, "[a1 · flash high · write · 0 次工具调用]\nsecond (2 user messages)");
  await loaded.fire("session_shutdown", { reason: "quit" });
  loaded = p.load(); // a new process: the child comes back from its file
  const reopened = await loaded.call([{ task: "third", followUp: "a1" }, { task: "fresh" }]);
  assert.match(reopened.content[0].text, /^\[a1 · flash high · write · 0 次工具调用\]\nthird \(3 user messages\)/);
  assert.match(reopened.content[0].text, /\[a2 · flash high · read · 0 次工具调用\]\nfresh/);
  assert.deepEqual(requests.find((request) => request.text === "third").tools.slice(0, 4), ["read", "bash", "edit", "write"]);
  const missing = await loaded.call([{ task: "x", followUp: "a9" }, { task: "y", followUp: "a2" }, { task: "z", followUp: "a2" }]);
  assert.match(missing.content[0].text, /\[a9 · 失败\]\n没有编号为 a9 的子代理/);
  assert.match(missing.content[0].text, /同一次调用里 a2 出现了两次/);
  const none = await loaded.call([{ task: "x", followUp: "a9" }]);
  assert.equal(none.isError, true);
});

test("a child can start its own children, but they cannot go deeper", async () => {
  const requests = script(({ text, role }) => {
    if (text === "delegate" && role === "user") return ai.fauxAssistantMessage(ai.fauxToolCall("subagent", { tasks: [{ task: "leaf" }] }));
    return role === "toolResult" ? `got: ${text}` : `answer: ${text}`;
  });
  const p = parent();
  const result = await p.load().call([{ task: "delegate" }]);
  assert.equal(result.content[0].text, "[a1 · flash high · read · 1 次工具调用]\ngot: [a1 · flash high · read · 0 次工具调用]\nanswer: leaf");
  const leaf = requests.find((request) => request.text === "leaf");
  assert.deepEqual(leaf.tools, ["read", "grep", "find", "ls", "bash"]);
  const child = join(p.childDir(), "a1.jsonl");
  const grandchild = join(p.root, header(child).id, "a1.jsonl");
  assert.equal(header(grandchild).parentSession, child);
  assert.ok(tokens(grandchild) > 0);
  assert.equal(result.usage.totalTokens, tokens(child) + tokens(grandchild)); // the child's two replies and the grandchild's one
});

test("the read tier's bash runs through the sandbox and refuses to run without one; the write tier's does not", async () => {
  script(({ text, role }) => role === "user"
    ? ai.fauxAssistantMessage(ai.fauxToolCall("bash", { command: "echo hi" }))
    : `bash said: ${text.trim()}`);
  const seen = [];
  const boxed = parent({ sandbox: (command, work) => { seen.push([command, work]); return `printf 'boxed in %s' "$PWD"`; } });
  const read = await boxed.load().call([{ task: "run" }, { task: "run", tools: "write" }]);
  const work = join(boxed.childDir(), "a1");
  assert.match(read.content[0].text, new RegExp(`^\\[a1 [^\\n]*\\]\\nbash said: boxed in ${realpathSync(work)}`));
  assert.match(read.content[0].text, /\[a2 [^\n]*\]\nbash said: hi/);
  assert.deepEqual(seen, [["echo hi", work]]);
  const bare = await parent({ sandbox: () => undefined }).load().call([{ task: "run" }]);
  assert.match(bare.content[0].text, /bash said: .*没有可用的沙箱/);
});

test("aborting the call stops its children", async () => {
  script(({ signal }) => new Promise((resolve) => {
    const timer = setTimeout(() => resolve("too late"), 5000);
    signal?.addEventListener("abort", () => { clearTimeout(timer); resolve("stopped"); });
  }));
  const controller = new AbortController();
  const started = Date.now();
  setTimeout(() => controller.abort(), 100);
  const result = await parent().load().call([{ task: "slow" }, { task: "slow too" }], controller.signal);
  assert.ok(Date.now() - started < 3000);
  assert.match(result.content[0].text, /^\[a1 [^\n]*失败\]\n已中断/);
});

test("without a session file, children stay in memory and their folder goes with the parent", async () => {
  script(({ text }) => `answer: ${text}`);
  const p = parent({ file: false });
  const loaded = p.load();
  await loaded.call([{ task: "alpha" }]);
  const folder = join(tmpdir(), "pi-subagents", p.sessionManager.getSessionId());
  assert.ok(existsSync(join(folder, "a1")));
  assert.equal(existsSync(p.root), false);
  assert.match((await loaded.call([{ task: "again", followUp: "a1" }])).content[0].text, /answer: again/);
  await loaded.fire("session_shutdown", { reason: "quit" });
  assert.equal(existsSync(folder), false);
  assert.match((await loaded.call([{ task: "x", followUp: "a1" }])).content[0].text, /没有编号为 a1 的子代理/);
});

test("only the main agent cleans up and has /subagent-clean; a model outside the list is refused", async () => {
  const p = parent();
  const top = p.load();
  assert.deepEqual([...top.handlers.keys()].sort(), ["session_shutdown", "session_start"]);
  assert.deepEqual([...top.commands.keys()], ["subagent-clean"]);
  assert.deepEqual(top.tools.get("subagent").parameters.properties.tasks.items.properties.model.enum, ["flash"]);
  const nested = { tools: new Map(), handlers: new Map(), commands: new Map() };
  ext.subagents({ depth: 1, root: p.root, models: MODELS, limits: [] })({ registerTool: (tool) => nested.tools.set(tool.name, tool),
    on: (event) => nested.handlers.set(event), registerCommand: (name) => nested.commands.set(name), getAllTools: () => [] });
  assert.deepEqual([[...nested.tools.keys()], [...nested.handlers.keys()], nested.commands.size], [["subagent"], ["session_shutdown"], 0]);
  script(() => "unused");
  const refused = await top.call([{ task: "x", model: "opus" }]);
  assert.match(refused.content[0].text, /模型 opus 不可用/);
  await top.commands.get("subagent-clean").handler("", p.ctx);
  assert.match(p.notices.at(-1)[0], /^子代理目录原来占用 .*，删掉了 /);
});
