import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { homedir, tmpdir } from "node:os";
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
const { default: pasteImage, findKitten, readClipboardImage, remoteKitty } = await import("./extensions/paste-image.ts");

// A stand-in kitten: records its arguments and the password from fd 3, then
// acts on FAKE_MODE the way kitty's clipboard kitten would.
const bin = mkdtempSync(join(tmpdir(), "paste-image-test-"));
const log = join(bin, "log");
writeFileSync(join(bin, "kitten"), `#!/bin/sh
password=$(cat <&3)
for file; do :; done
printf '%s|%s\\n' "$*" "$password" >> "${log}"
case "$FAKE_MODE" in
  image) printf 'PNG' > "$file" ;;
  empty) printf 'The MIME type image/png for %s not available on the clipboard\\n' "$file" >&2; exit 1 ;;
  denied) printf 'Permission denied by user\\n' >&2; exit 1 ;;
  hang) exec sleep 5 ;;
esac
`);
chmodSync(join(bin, "kitten"), 0o755);
const ssh = { SSH_CONNECTION: "1.2.3.4 1 5.6.7.8 22", TERM: "xterm-kitty", PATH: `/nonexistent:${bin}` };
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const pastedFiles = [];
test.after(() => {
  rmSync(bin, { recursive: true, force: true });
  for (const file of pastedFiles) rmSync(file, { force: true });
});

test("only SSH sessions shown directly in kitty, with kitten on PATH, take over Ctrl+V", () => {
  assert.equal(remoteKitty(ssh), true);
  assert.equal(remoteKitty({ ...ssh, TERM: "xterm-256color", KITTY_WINDOW_ID: "3" }), true);
  assert.equal(remoteKitty({ TERM: "xterm-kitty" }), false);
  assert.equal(remoteKitty({ ...ssh, TMUX: "/tmp/tmux-1/default,1,0" }), false);
  assert.equal(remoteKitty({ ...ssh, TERM: "xterm-256color" }), false);
  assert.equal(findKitten(ssh), join(bin, "kitten"));
  assert.equal(findKitten({ PATH: "/nonexistent" }), undefined);
});

test("the kitten gets the password on fd 3 and failures leave no file behind", async () => {
  process.env.FAKE_MODE = "image";
  const file = join(bin, "a.png");
  assert.deepEqual(await readClipboardImage(join(bin, "kitten"), file, "secret"), { ok: true });
  assert.equal(readFileSync(file, "utf8"), "PNG");
  assert.match(readFileSync(log, "utf8"), new RegExp(`clipboard --get-clipboard --password fd:3 --human-name Pi ${file}\\|secret$`, "m"));
  process.env.FAKE_MODE = "empty";
  const missing = await readClipboardImage(join(bin, "kitten"), join(bin, "b.png"), "secret");
  assert.equal(missing.ok, false);
  assert.match(missing.message, /剪贴板里没有图片/);
  assert.equal(existsSync(join(bin, "b.png")), false);
  process.env.FAKE_MODE = "denied";
  assert.deepEqual(await readClipboardImage(join(bin, "kitten"), join(bin, "c.png"), "secret"),
    { ok: false, message: "读取剪贴板失败：Permission denied by user" });
  process.env.FAKE_MODE = "hang";
  assert.deepEqual(await readClipboardImage(join(bin, "kitten"), join(bin, "d.png"), "secret", 100),
    { ok: false, message: "等待 kitty 授权超时" });
  assert.deepEqual(await readClipboardImage(join(bin, "missing-kitten"), join(bin, "e.png"), "secret"),
    { ok: false, message: `spawn ${join(bin, "missing-kitten")} ENOENT` });
});

function harness(env = ssh, mode = "tui") {
  const handlers = {}, pasted = [], notices = [], tuiCalls = [];
  let listener;
  const pi = { on: (event, handler) => { handlers[event] = handler; } };
  const ctx = { mode, ui: {
    onTerminalInput: (handler) => { listener = handler; return () => {}; },
    custom: (factory) => new Promise((done) => {
      factory({ stop: () => tuiCalls.push("stop"), start: () => tuiCalls.push("start"), requestRender: (force) => tuiCalls.push(`render:${force}`) },
        {}, {}, done);
    }),
    pasteToEditor: (text) => { pasted.push(text); pastedFiles.push(text); },
    notify: (message, level) => notices.push([message, level]),
  } };
  pasteImage(pi, env);
  handlers.session_start({}, ctx);
  return { input: (data) => listener?.(data), hasListener: () => Boolean(listener), pasted, notices, tuiCalls };
}

test("Ctrl+V hands the terminal to the kitten and pastes the saved image's path", async () => {
  process.env.FAKE_MODE = "image";
  const h = harness();
  assert.equal(h.input("a"), undefined);
  assert.deepEqual(h.input("\x16"), { consume: true });
  // A second press while the first read is running is swallowed, not queued.
  assert.deepEqual(h.input("\x1b[118;5u"), { consume: true });
  await wait(200);
  assert.deepEqual(h.tuiCalls, ["stop", "start", "render:true"]);
  assert.equal(h.pasted.length, 1);
  assert.match(h.pasted[0], new RegExp(`^${tmpdir()}/pi-clipboard-[0-9a-f-]+\\.png$`));
  assert.equal(readFileSync(h.pasted[0], "utf8"), "PNG");
  // The same password every time, so kitty can remember the user's answer.
  h.input("\x16");
  await wait(200);
  const passwords = readFileSync(log, "utf8").trim().split("\n").slice(-2).map((line) => line.split("|")[1]);
  assert.equal(passwords[0], passwords[1]);
});

test("a failed read restores the terminal and says why", async () => {
  process.env.FAKE_MODE = "empty";
  const h = harness();
  h.input("\x16");
  await wait(200);
  assert.deepEqual(h.tuiCalls, ["stop", "start", "render:true"]);
  assert.deepEqual(h.pasted, []);
  assert.equal(h.notices[0][1], "warning");
  assert.match(h.notices[0][0], /剪贴板里没有图片/);
});

test("local terminals, other terminals and non-interactive runs keep Pi's own Ctrl+V", () => {
  for (const h of [harness({ TERM: "xterm-kitty", PATH: bin }), harness({ ...ssh, PATH: "/nonexistent" }), harness(ssh, "print")]) {
    assert.equal(h.hasListener(), false);
  }
});
