import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { idleNotify, notification, WAIT_MS } from "./extensions/idle-notify.ts";

const IN = "\x1b[I";
const OUT = "\x1b[O";

function register(mode = "tui") {
  const handlers = new Map();
  const input = new EventEmitter();
  const written = [];
  idleNotify({ on: (event, handler) => handlers.set(event, handler) }, input, (text) => written.push(text));
  const ctx = { mode, cwd: "/Users/rift/code/project/learn" };
  const fire = (event, fields = {}) => handlers.get(event)({ type: event, ...fields }, ctx);
  fire("session_start", { reason: "startup" });
  return { handlers, input, fire, written };
}

function decode(text) {
  return [...text.matchAll(/\x1b\]99;([^;]*);([^\x1b]*)\x1b\\/g)].map(([, meta, payload]) => [meta, Buffer.from(payload, "base64").toString()]);
}

test("the escape code is kitty's two-chunk OSC 99 with base64 text, honored only when unfocused", () => {
  assert.deepEqual(decode(notification("pi-x", "Pi · learn", "回复好了；等你回来")), [
    ["i=pi-x:d=0:o=unfocused:e=1", "Pi · learn"],
    ["i=pi-x:p=body:e=1", "回复好了；等你回来"],
  ]);
});

test("a run that ends while the window is away notifies after a minute", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { handlers, input, fire, written } = register();
  assert.deepEqual([...handlers.keys()].sort(), ["agent_settled", "agent_start", "session_shutdown", "session_start"]);
  input.emit("data", Buffer.from(OUT));
  fire("agent_start");
  fire("agent_settled", { aborted: false });
  t.mock.timers.tick(WAIT_MS - 1);
  assert.deepEqual(written, []);
  t.mock.timers.tick(1);
  assert.equal(written.length, 1);
  const [[titleMeta, title], [, body]] = decode(written[0]);
  assert.match(titleMeta, /^i=pi-[0-9a-f-]{36}:/);
  assert.deepEqual([title, body], ["Pi · learn", "回复好了，等你回来"]);

  fire("agent_start");
  fire("agent_settled", { aborted: false }); // still away: the next run notifies again, with the same id
  t.mock.timers.tick(WAIT_MS);
  assert.equal(written.length, 2);
  assert.equal(decode(written[1])[0][0], titleMeta);
});

test("no notification when the window has focus, comes back in time, the run was stopped, or a new run starts", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { input, fire, written } = register();
  fire("agent_settled", { aborted: false }); // focused at the end
  t.mock.timers.tick(WAIT_MS);

  input.emit("data", `x${OUT}`);
  fire("agent_settled", { aborted: false });
  t.mock.timers.tick(30_000);
  input.emit("data", IN); // back within the minute
  input.emit("data", OUT); // and away again
  t.mock.timers.tick(WAIT_MS);

  fire("agent_settled", { aborted: true }); // Escape: the user is there
  t.mock.timers.tick(WAIT_MS);

  fire("agent_settled", { aborted: false });
  fire("agent_start"); // a queued message starts another run
  t.mock.timers.tick(WAIT_MS);

  input.emit("data", `${OUT}${IN}`); // the later report wins
  fire("agent_settled", { aborted: false });
  t.mock.timers.tick(WAIT_MS);
  assert.deepEqual(written, []);
});

test("only the terminal listens, and shutdown stops the timer and the listener", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const rpc = register("rpc");
  assert.equal(rpc.input.listenerCount("data"), 0);
  rpc.fire("agent_settled", { aborted: false });
  t.mock.timers.tick(WAIT_MS);
  assert.deepEqual(rpc.written, []);

  const tui = register();
  tui.fire("session_start", { reason: "new" });
  assert.equal(tui.input.listenerCount("data"), 1);
  tui.input.emit("data", OUT);
  tui.fire("agent_settled", { aborted: false });
  tui.fire("session_shutdown", { reason: "quit" });
  assert.equal(tui.input.listenerCount("data"), 0);
  t.mock.timers.tick(WAIT_MS);
  assert.deepEqual(tui.written, []);
});
