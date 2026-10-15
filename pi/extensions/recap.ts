/**
 * Session recap, after Claude Code's: when a run finishes, the current model
 * writes one or two sentences on the goal, the current task and the next
 * action. The recap is a custom session entry: shown in the chat, never sent
 * to the model. Claude Code waits until the terminal has lost focus for a few
 * minutes; this recaps as soon as the reply ends. `/recap [on|off|status]`
 * switches it for every model and the choice survives restarts; excluded
 * models never recap.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { convertToLlm, getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

/** Claude Code's recap prompt, plus a language rule for Chinese sessions. */
export const RECAP_PROMPT = "The user stepped away and is coming back. Recap in under 40 words, 1-2 plain sentences, no markdown. "
  + "Lead with the overall goal and current task, then the one next action. "
  + "Skip root-cause narrative, fix internals, secondary to-dos, and em-dash tangents. "
  + "Write in the language of the user's messages: if they write Chinese, answer in Chinese, under 80 characters.";
export const RECAP_TYPE = "recap";
/** Expensive models never recap, whatever the switch says. */
export const EXCLUDED_MODELS: readonly string[] = ["openai/gpt-6-astra"];
const COMMAND_ARGS = ["on", "off", "status"];
const MAX_CHARS = 400;
/** Claude Code's defaults: 3 user turns before the first recap, 2 between recaps. */
const MIN_USER_TURNS = 3;
const TURNS_BETWEEN = 2;

export interface RecapData {
  text: string;
  model: string;
  at: string;
  usage: { input: number; cacheRead: number; output: number; cost: number };
}

interface BranchEntry { type: string; customType?: string; message?: { role?: string } }
type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => value !== null && typeof value === "object" && !Array.isArray(value);
const isSystemItem = (item: unknown) => isObject(item) && (item.role === "system" || item.role === "developer");

/**
 * Give the recap request the exact prefix of the conversation's last request:
 * its system prompt as sent (after extensions such as base-prompt rewrote it)
 * and its tool list in order. Pi only knows its own original prompt, and a
 * different prefix forfeits the provider's prompt cache. Covers OpenAI
 * Responses and Chat, Anthropic and Google request bodies.
 */
export function alignPrefix(recap: unknown, last: unknown): unknown {
  if (!isObject(recap) || !isObject(last)) return undefined;
  const aligned: Json = { ...recap };
  for (const key of ["instructions", "system", "tools"]) if (key in last) aligned[key] = last[key];
  if (isObject(recap.config) && isObject(last.config)) {
    aligned.config = { ...recap.config, systemInstruction: last.config.systemInstruction, tools: last.config.tools };
  }
  for (const key of ["input", "messages"]) {
    const ours = recap[key], theirs = last[key];
    if (!Array.isArray(ours) || !Array.isArray(theirs)) continue;
    const lead = (items: unknown[]) => { let count = 0; while (count < items.length && isSystemItem(items[count])) count++; return count; };
    aligned[key] = [...theirs.slice(0, lead(theirs)), ...ours.slice(lead(ours))];
  }
  return aligned;
}

/** Enough conversation for a first recap, and enough new conversation since the last one. */
export function eligible(branch: readonly BranchEntry[]): boolean {
  let users = 0;
  let sinceRecap = -1;
  for (const entry of branch) {
    if (entry.type === "custom" && entry.customType === RECAP_TYPE) sinceRecap = 0;
    else if (entry.type === "message" && entry.message?.role === "user") {
      users++;
      if (sinceRecap >= 0) sinceRecap++;
    }
  }
  return users >= MIN_USER_TURNS && (sinceRecap < 0 || sinceRecap >= TURNS_BETWEEN);
}

/** The on/off switch, shared by every model and session. */
export const statePath = () => join(getAgentDir(), "extensions", "recap.json");

/** A missing or unreadable switch means on, the behaviour before the switch existed. */
export function readEnabled(path = statePath()): boolean {
  try {
    const state: unknown = JSON.parse(readFileSync(path, "utf8"));
    return !(isObject(state) && state.enabled === false);
  } catch {
    return true;
  }
}

export function writeEnabled(enabled: boolean, path = statePath()): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ enabled }, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

/**
 * OpenAI caches prompts per reasoning effort, so a recap at the conversation's
 * effort reuses its cache (about a tenth of the cost). Above high it would think
 * for 11–15 s instead of 4–6 s, so those recaps use low and pay full price.
 */
export function recapReasoning(level: string): "minimal" | "low" | "medium" | "high" | undefined {
  if (level === "off") return undefined;
  return level === "minimal" || level === "low" || level === "medium" || level === "high" ? level : "low";
}

const excluded = (model: ExtensionContext["model"]) => !!model && EXCLUDED_MODELS.includes(`${model.provider}/${model.id}`);

export function clipRecap(text: string): string {
  const trimmed = text.trim();
  return trimmed.length <= MAX_CHARS ? trimmed : `${trimmed.slice(0, MAX_CHARS - 1).trimEnd()}…`;
}

/** Same model, system prompt, tools and session as the conversation, so the request can reuse its prompt cache. */
export async function generateRecap(pi: ExtensionAPI, ctx: ExtensionContext, signal: AbortSignal, lastRequest?: unknown): Promise<RecapData> {
  const model = ctx.model;
  if (!model) throw new Error("当前没有选定模型");
  const active = new Set(pi.getActiveTools());
  const tools = pi.getAllTools().filter((tool) => active.has(tool.name))
    .map(({ name, description, parameters }) => ({ name, description, parameters }));
  // Pi records system prompt changes as messages; they are not part of what it sends.
  const messages = convertToLlm(ctx.sessionManager.buildSessionProjection().messages.filter((message) => message.role !== "system"));
  messages.push({ role: "user", content: [{ type: "text", text: RECAP_PROMPT }], timestamp: Date.now() });
  const response = await ctx.modelRegistry.streamSimple(model, { systemPrompt: ctx.getSystemPrompt(), messages, tools },
    { reasoning: model.reasoning ? recapReasoning(pi.getThinkingLevel()) : undefined, toolChoice: "none", sessionId: ctx.sessionManager.getSessionId(), signal,
      onPayload: (payload) => alignPrefix(payload, lastRequest) }).result();
  if (response.stopReason === "error" || response.stopReason === "aborted") {
    throw new Error(response.errorMessage || response.stopReason);
  }
  const text = clipRecap(response.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(""));
  if (!text) throw new Error("模型没有返回内容");
  const { usage } = response;
  return { text, model: `${response.provider}/${response.model}`, at: new Date().toISOString(),
    usage: { input: usage.input, cacheRead: usage.cacheRead, output: usage.output, cost: usage.cost.total } };
}

export default function recap(pi: ExtensionAPI): void {
  let running: AbortController | undefined;
  let lastRequest: unknown;
  let enabled = true;

  const cancel = () => {
    running?.abort();
    running = undefined;
  };

  const write = async (ctx: ExtensionContext) => {
    const controller = new AbortController();
    running = controller;
    try {
      const data = await generateRecap(pi, ctx, controller.signal, lastRequest);
      // Input or a new run during generation makes the recap stale.
      if (!controller.signal.aborted) pi.appendEntry<RecapData>(RECAP_TYPE, data);
    } catch {
      // A missing recap is not worth interrupting the user; the next eligible reply tries again.
    } finally {
      if (running === controller) running = undefined;
    }
  };

  pi.registerEntryRenderer<RecapData>(RECAP_TYPE, (entry, _options, theme) => {
    const text = entry.data?.text;
    return text ? new Text(`${theme.fg("dim", theme.bold("※ recap:"))} ${theme.fg("dim", theme.italic(text))}`, 1, 0) : undefined;
  });

  pi.registerCommand("recap", {
    description: "开关 recap：所有模型共用，重启后保留；排除名单内的模型始终不生成",
    getArgumentCompletions: (prefix) => {
      const matches = COMMAND_ARGS.filter((arg) => arg.startsWith(prefix)).map((arg) => ({ value: arg, label: arg }));
      return matches.length > 0 ? matches : null;
    },
    handler: async (args, ctx) => {
      const command = args.trim().toLowerCase();
      if (command !== "" && !COMMAND_ARGS.includes(command)) {
        ctx.ui.notify("用法：/recap [on|off|status]", "warning");
        return;
      }
      // Another Pi process may have switched it since this one started.
      enabled = readEnabled();
      if (command !== "status") {
        const next = command === "" ? !enabled : command === "on";
        try {
          writeEnabled(next);
        } catch (error) {
          ctx.ui.notify(`recap 开关保存失败：${error instanceof Error ? error.message : String(error)}`, "error");
          return;
        }
        enabled = next;
        if (!enabled) cancel();
      }
      const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "";
      ctx.ui.notify(!enabled ? "recap 已关闭。" : excluded(ctx.model) ? `recap 已开启，但当前模型 ${model} 在排除名单里，不会生成。` : "recap 已开启。", "info");
    },
  });

  pi.on("session_start", () => { cancel(); lastRequest = undefined; enabled = readEnabled(); });
  pi.on("before_provider_request", (event) => { lastRequest = event.payload; });
  pi.on("session_shutdown", cancel);
  // A new message or run makes an unfinished recap stale.
  pi.on("agent_start", cancel);
  pi.on("input", () => { cancel(); });

  pi.on("agent_settled", (_event, ctx) => {
    cancel();
    // Print, JSON and RPC runs have nobody to read a recap.
    if (!enabled || ctx.mode !== "tui" || !ctx.model || excluded(ctx.model)) return;
    if (ctx.hasPendingMessages() || ctx.ui.getEditorText().trim() || !eligible(ctx.sessionManager.getBranch())) return;
    void write(ctx);
  });
}
