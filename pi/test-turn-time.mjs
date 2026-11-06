import assert from "node:assert/strict";
import test from "node:test";
import turnTime, { formatDuration, turnLine } from "./extensions/turn-time.ts";

function register(mode = "tui") {
  const handlers = new Map();
  const working = [];
  const notices = [];
  turnTime({ on: (event, handler) => handlers.set(event, handler) });
  const ctx = {
    mode,
    ui: { setWorkingMessage: (message) => working.push(message), notify: (message, level) => notices.push([message, level]) },
  };
  const fire = (event, fields = {}) => handlers.get(event)({ type: event, ...fields }, ctx);
  return { handlers, fire, working, notices };
}

test("durations read like Claude Code's", () => {
  assert.equal(formatDuration(0), "0s");
  assert.equal(formatDuration(45_400), "45s");
  assert.equal(formatDuration(326_900), "5m 26s");
  assert.equal(formatDuration(3_720_000), "1h 2m");
});

test("the line gives the local end time, or says the run was stopped", () => {
  assert.equal(turnLine(326_000, new Date(2026, 10, 6, 14, 16, 30)), "✻ Worked for 5m 26s · done 14:16");
  assert.equal(turnLine(12_000, new Date(2026, 10, 6, 9, 5), true), "✻ Worked for 12s · stopped 09:05");
});

test("Working counts up during a run and one line follows its end", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: new Date(2026, 10, 6, 14, 11, 4).getTime() });
  const { handlers, fire, working, notices } = register();
  assert.deepEqual([...handlers.keys()].sort(), ["agent_settled", "agent_start", "session_shutdown"]);
  fire("agent_start");
  assert.deepEqual(working, ["Working 0s"]);
  t.mock.timers.tick(10_000);
  fire("agent_start"); // a retry in the same run keeps its start and its one timer
  t.mock.timers.tick(55_000);
  assert.equal(working.length, 66);
  assert.equal(working.at(-1), "Working 1m 5s");
  t.mock.timers.tick(261_000);
  fire("agent_settled", { aborted: false });
  assert.equal(working.at(-1), undefined); // Pi's own "Working" again
  assert.deepEqual(notices, [["✻ Worked for 5m 26s · done 14:16", "info"]]);
  const settled = working.length;
  t.mock.timers.tick(5_000);
  assert.equal(working.length, settled);
});

test("only the terminal shows it, nothing without a start, and shutdown stops the timer", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: new Date(2026, 10, 6, 9, 0).getTime() });
  const rpc = register("rpc");
  rpc.fire("agent_start");
  t.mock.timers.tick(3_000);
  rpc.fire("agent_settled", { aborted: false });
  assert.deepEqual([rpc.working, rpc.notices], [[], []]);

  const tui = register();
  tui.fire("agent_settled", { aborted: false }); // loaded mid-run: no start to measure from
  assert.deepEqual(tui.notices, []);
  tui.fire("agent_start");
  t.mock.timers.tick(12_000);
  tui.fire("agent_settled", { aborted: true });
  assert.deepEqual(tui.notices, [["✻ Worked for 12s · stopped 09:00", "info"]]);
  tui.fire("agent_start");
  tui.fire("session_shutdown");
  const count = tui.working.length;
  t.mock.timers.tick(5_000);
  assert.equal(tui.working.length, count);
});
