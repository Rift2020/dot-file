/**
 * Ctrl+V image paste over SSH in kitty. Pi's own paste reads the clipboard of
 * the machine Pi runs on, which over SSH has no display and never holds the
 * image. kitty's clipboard kitten asks the local terminal instead: Pi hands it
 * the terminal for the read, then the image is saved where Pi saves its own
 * pasted images and, as with Pi's paste, its path goes into the editor for the
 * model to open with read. Elsewhere Ctrl+V stays Pi's.
 */
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { accessSync, constants, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isKeyRelease, matchesKey } from "@earendil-works/pi-tui";

/** The user may leave kitty's permission prompt open; give up after this. */
const READ_TIMEOUT_MS = 120_000;

export type ReadResult = { ok: true } | { ok: false; message: string };

/** An SSH session shown directly in kitty; inside tmux the kitten's escape codes would not reach kitty. */
export function remoteKitty(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.SSH_CONNECTION || env.SSH_TTY) && !env.TMUX && (env.TERM === "xterm-kitty" || Boolean(env.KITTY_WINDOW_ID));
}

/** kitten on PATH, which kitty's ssh kitten installs on the remote machine. */
export function findKitten(env: NodeJS.ProcessEnv): string | undefined {
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const path = join(dir, "kitten");
    try {
      accessSync(path, constants.X_OK);
      return path;
    } catch { /* Not in this directory. */ }
  }
  return undefined;
}

/**
 * Save the clipboard's image as PNG. The kitten talks to kitty through the
 * terminal, so the caller must have released it. kitty asks before letting a
 * program read the clipboard; with a password the user can allow it once for
 * the rest of the terminal session. The password goes through fd 3, not argv.
 */
export function readClipboardImage(kitten: string, file: string, password: string, timeoutMs = READ_TIMEOUT_MS): Promise<ReadResult> {
  return new Promise((resolve) => {
    const child = spawn(kitten, ["clipboard", "--get-clipboard", "--password", "fd:3", "--human-name", "Pi", file],
      { stdio: ["inherit", "inherit", "pipe", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    const finish = (result: ReadResult) => {
      clearTimeout(timer);
      if (!result.ok) rmSync(file, { force: true });
      resolve(result);
    };
    child.on("error", (error) => finish({ ok: false, message: error.message }));
    child.on("close", (code, signal) => {
      if (signal) return finish({ ok: false, message: "等待 kitty 授权超时" });
      const size = (() => { try { return statSync(file).size; } catch { return 0; } })();
      if (code === 0 && size > 0) return finish({ ok: true });
      const reason = stderr.trim().split("\n").at(-1) ?? "";
      finish({ ok: false, message: /not available on the clipboard|clipboard is empty|No data for/.test(reason)
        ? "剪贴板里没有图片（文字用 Ctrl+Shift+V 粘贴）" : `读取剪贴板失败：${reason || `kitten 退出码 ${code}`}` });
    });
    const secret = child.stdio[3] as NodeJS.WritableStream | null;
    secret?.on("error", () => { /* The kitten exited before reading it; close reports why. */ });
    secret?.end(password);
  });
}

export default function pasteImage(pi: ExtensionAPI, env: NodeJS.ProcessEnv = process.env): void {
  // One password per Pi process: kitty asks on the first paste and can remember the answer.
  const password = randomBytes(16).toString("hex");
  let busy = false;

  const paste = async (ctx: ExtensionContext, kitten: string) => {
    busy = true;
    const file = join(tmpdir(), `pi-clipboard-${randomUUID()}.png`);
    try {
      const result = await ctx.ui.custom<ReadResult>((tui, _theme, _keybindings, done) => {
        tui.stop();
        void readClipboardImage(kitten, file, password).then((read) => {
          tui.start();
          tui.requestRender(true);
          done(read);
        });
        return { render: () => [], invalidate: () => {} };
      });
      if (result.ok) ctx.ui.pasteToEditor(file);
      else ctx.ui.notify(result.message, "warning");
    } finally {
      busy = false;
    }
  };

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui" || !remoteKitty(env)) return;
    const kitten = findKitten(env);
    if (!kitten) return;
    ctx.ui.onTerminalInput((data) => {
      if (!matchesKey(data, "ctrl+v") || isKeyRelease(data)) return undefined;
      if (!busy) void paste(ctx, kitten);
      return { consume: true };
    });
  });
}
