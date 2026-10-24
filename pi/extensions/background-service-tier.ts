/**
 * Keep background requests on Standard without changing the saved /fast preference. learn's phone chats run in
 * RPC mode with a person on the other end; they set LEARN_MANUAL_SESSION=1 and keep /fast like the terminal.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function backgroundServiceTier(pi: ExtensionAPI): void {
  pi.on("before_provider_request", (event, ctx) => {
    const model = ctx.model;
    if (ctx.mode === "tui" || process.env.LEARN_MANUAL_SESSION === "1" || !model) return;
    if (!["openai", "openai-codex"].includes(model.provider)) return;
    if (!["openai-responses", "openai-codex-responses", "openai-completions"].includes(model.api)) return;
    const payload = event.payload;
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return;
    if (!("model" in payload) || payload.model !== model.id) return;
    return { ...payload, service_tier: "default" };
  });
}
