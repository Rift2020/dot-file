/**
 * Temporary: Gemini 4 accepts only thinkingLevel, but Pi 1.2.0 sends it just for
 * Gemini 3 IDs and a thinkingBudget for everything else, which Vertex rejects.
 * Delete this file once Pi supports Gemini 4 natively.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function gemini4Thinking(pi: ExtensionAPI): void {
  pi.on("before_provider_request", (event, ctx) => {
    const model = ctx.model;
    if (!model || model.provider !== "google-vertex" || !model.id.startsWith("gemini-4")) return;
    const payload = event.payload;
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return;
    const config = (payload as { config?: unknown }).config;
    if (config === null || typeof config !== "object" || Array.isArray(config)) return;
    const thinking = (config as { thinkingConfig?: unknown }).thinkingConfig;
    if (thinking === null || typeof thinking !== "object" || Array.isArray(thinking) || !("thinkingBudget" in thinking)) return;
    const level = model.thinkingLevelMap?.[pi.getThinkingLevel()];
    if (typeof level !== "string") return;
    const { thinkingBudget: _budget, ...rest } = thinking as Record<string, unknown>;
    return { ...payload, config: { ...config, thinkingConfig: { ...rest, thinkingLevel: level.toUpperCase() } } };
  });
}
