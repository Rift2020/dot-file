import assert from "node:assert/strict";
import test from "node:test";
import basePrompt, { currentDate, PI_PREAMBLE, PREAMBLE, rewritePrompt } from "./extensions/base-prompt.ts";

const rules = "<rules>\n- Use read to examine files instead of cat or sed.\n- Be concise in your responses\n- Show file paths clearly when working with files\n</rules>";
const rendered = `${PI_PREAMBLE}\n\n<tools>\n- read: Read file contents\n</tools>\n\n${rules}\n\n<cwd>\n/work\n</cwd>`;

function register() {
  const handlers = [];
  const notices = [];
  basePrompt({ on: (event, handler) => handlers.push([event, handler]) });
  assert.deepEqual(handlers.map(([event]) => event), ["before_agent_start"]);
  const run = (options, prompt) => handlers[0][1](
    { systemPromptOptions: options, get systemPrompt() { return prompt(options); } },
    { ui: { notify: (message, level) => notices.push([message, level]) } });
  return { run, notices };
}

test("only the identity sentence and the brevity rule change", () => {
  const prompt = rewritePrompt(rendered);
  assert.ok(prompt.startsWith(PREAMBLE));
  assert.ok(!prompt.includes("Be concise"));
  assert.equal(prompt, rendered.replace(PI_PREAMBLE, PREAMBLE).replace("- Be concise in your responses\n", ""));
  assert.equal(rewritePrompt("Custom project prompt\n\n" + rules), undefined);
});

test("the date is local and changes only by day", () => {
  const now = new Date("2026-10-11T17:30:00Z");
  assert.equal(currentDate(now, "Asia/Shanghai"), "今天是 2026-10-12（星期一），时区 Asia/Shanghai。");
  assert.equal(currentDate(now, "UTC"), "今天是 2026-10-11（星期日），时区 UTC。");
  assert.equal(currentDate(new Date("2026-10-11T23:59:00Z"), "UTC"), currentDate(new Date("2026-10-11T00:00:00Z"), "UTC"));
});

test("the handler adds the date section and forces the rewritten prompt", () => {
  const { run, notices } = register();
  const options = { sections: {}, forceSystemPrompt: undefined };
  const result = run(options, current => `${rendered}\n\n<current_date>\n${current.sections.current_date}\n</current_date>`);
  assert.match(options.sections.current_date, /^今天是 \d{4}-\d{2}-\d{2}（星期.）/);
  assert.ok(result.systemPrompt.startsWith(PREAMBLE));
  assert.ok(result.systemPrompt.endsWith(`<current_date>\n${options.sections.current_date}\n</current_date>`));
  assert.deepEqual(notices, []);
});

test("a prompt owned elsewhere is left alone; changed Pi wording warns once", () => {
  const { run, notices } = register();
  const forced = { sections: {}, forceSystemPrompt: "owned by another extension" };
  assert.equal(run(forced, () => "unused"), undefined);
  assert.deepEqual(forced.sections, {});
  const custom = { sections: {}, customPrompt: "Project SYSTEM.md" };
  assert.equal(run(custom, () => "Project SYSTEM.md"), undefined);
  assert.ok(custom.sections.current_date);
  assert.deepEqual(notices, []);
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal(run({ sections: {} }, () => "You are a renamed assistant."), undefined);
  }
  assert.equal(notices.length, 1);
  assert.equal(notices[0][1], "warning");
});
