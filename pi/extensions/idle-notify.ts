/**
 * Like Claude Code's "Claude is waiting for your input": when a run ends while this kitty window is not
 * focused, and the window does not get focus back within a minute, kitty shows a desktop notification
 * with the sound macOS gives kitty's notifications. Clicking it brings the window back.
 *
 * Pi's fullscreen mode already turns on the terminal's focus reports (ESC[I in, ESC[O out), but its own
 * input listener swallows them before extensions see them, so this reads them straight off stdin,
 * without consuming anything. Both the reports and the notification are escape codes, so it works the
 * same when Pi runs over SSH. Only the terminal UI uses it: the phone app (RPC) and print mode stay quiet.
 */
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const WAIT_MS = 60_000;
const FOCUS_IN = "\x1b[I";
const FOCUS_OUT = "\x1b[O";

/** kitty's OSC 99 in two chunks, base64 text. o=unfocused: kitty drops it if the window has focus after all. */
export function notification(id: string, title: string, body: string): string {
  const b64 = (text: string) => Buffer.from(text).toString("base64");
  return `\x1b]99;i=${id}:d=0:o=unfocused:e=1;${b64(title)}\x1b\\\x1b]99;i=${id}:p=body:e=1;${b64(body)}\x1b\\`;
}

type Input = { on(event: "data", fn: (data: Buffer | string) => void): unknown; off(event: "data", fn: (data: Buffer | string) => void): unknown };

export default function (pi: ExtensionAPI): void {
  idleNotify(pi, process.stdin, (text) => process.stdout.write(text));
}

/** The extension, with the terminal passed in so tests can drive it. */
export function idleNotify(pi: ExtensionAPI, input: Input, write: (text: string) => unknown): void {
  const id = `pi-${randomUUID()}`; // one per window, so a newer notification replaces the older one
  let focused = true; // Pi was just started from this window
  let listening = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const onInput = (data: Buffer | string) => {
    const text = String(data);
    const focusIn = text.lastIndexOf(FOCUS_IN);
    const focusOut = text.lastIndexOf(FOCUS_OUT);
    if (focusIn === focusOut) return; // neither
    focused = focusIn > focusOut;
    if (focused) cancel();
  };

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui" || listening) return;
    input.on("data", onInput);
    listening = true;
  });

  pi.on("agent_start", cancel);

  pi.on("agent_settled", (event, ctx) => {
    cancel();
    if (ctx.mode !== "tui" || event.aborted || focused) return;
    const title = `Pi · ${basename(ctx.cwd)}`;
    timer = setTimeout(() => {
      timer = undefined;
      write(notification(id, title, "回复好了，等你回来"));
    }, WAIT_MS);
    timer.unref?.();
  });

  pi.on("session_shutdown", () => {
    cancel();
    if (listening) input.off("data", onInput);
    listening = false;
  });
}
