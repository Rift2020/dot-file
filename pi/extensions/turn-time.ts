/**
 * Like Claude Code's "Churned for 5m 26s · done 14:16": while Pi works, the "Working" label in the
 * editor border counts up ("Working 1m 5s"); when it stops, one dim line in the chat says how long the
 * run took and when it ended. Only the terminal shows either: nothing goes into the session or to the
 * model, and the phone app (RPC) and print mode stay quiet.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** 45s, 5m 26s, 1h 2m. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** "✻ Worked for 5m 26s · done 14:16" in local time; a run stopped with Escape ends in "stopped 14:16". */
export function turnLine(ms: number, end: Date, aborted = false): string {
  const clock = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
  return `✻ Worked for ${formatDuration(ms)} · ${aborted ? "stopped" : "done"} ${clock}`;
}

export default function turnTime(pi: ExtensionAPI): void {
  // From the first start to the final settle, so retries, compaction and queued messages are one run.
  let started: number | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    clearInterval(timer);
    timer = undefined;
  };

  pi.on("agent_start", (_event, ctx) => {
    started ??= Date.now();
    if (ctx.mode !== "tui" || timer) return;
    const begin = started;
    const tick = () => ctx.ui.setWorkingMessage(`Working ${formatDuration(Date.now() - begin)}`);
    tick();
    timer = setInterval(tick, 1000);
    timer.unref?.();
  });

  pi.on("agent_settled", (event, ctx) => {
    const begin = started;
    started = undefined;
    stop();
    if (ctx.mode !== "tui") return;
    ctx.ui.setWorkingMessage();
    if (begin !== undefined) ctx.ui.notify(turnLine(Date.now() - begin, new Date(), event.aborted), "info");
  });

  pi.on("session_shutdown", () => {
    stop();
    started = undefined;
  });
}
