/**
 * /export-prompt: save what the last model request of this session actually
 * sent, after every extension has changed it — the system prompt verbatim, the
 * tool definitions, and the raw request body.
 */
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Json = Record<string, unknown>;
export interface ToolDefinition { name: string; description: string; parameters: unknown }

const isObject = (value: unknown): value is Json => value !== null && typeof value === "object" && !Array.isArray(value);

function text(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (isObject(part) && typeof part.text === "string" ? part.text : "")).filter(Boolean).join("\n\n");
  }
  return isObject(content) && Array.isArray(content.parts) ? text(content.parts) : "";
}

/** System text and tools from OpenAI Responses or Chat, Anthropic, and Google request bodies. */
export function extractPrompt(payload: unknown): { system: string[]; tools: ToolDefinition[] } {
  const body = isObject(payload) ? payload : {};
  const config = isObject(body.config) ? body.config : {};
  const system = [body.instructions, body.system, body.systemInstruction, config.systemInstruction].map(text).filter(Boolean);
  for (const list of [body.input, body.messages]) {
    if (!Array.isArray(list)) continue;
    for (const message of list) {
      if (isObject(message) && (message.role === "system" || message.role === "developer")) {
        const found = text(message.content);
        if (found) system.push(found);
      }
    }
  }
  const tools: ToolDefinition[] = [];
  const declared = Array.isArray(body.tools) ? body.tools : Array.isArray(config.tools) ? config.tools : [];
  for (const tool of declared) {
    if (!isObject(tool)) continue;
    const entries = Array.isArray(tool.functionDeclarations) ? tool.functionDeclarations : [isObject(tool.function) ? tool.function : tool];
    for (const entry of entries) {
      if (!isObject(entry) || typeof entry.name !== "string") continue;
      tools.push({
        name: entry.name,
        description: typeof entry.description === "string" ? entry.description : "",
        parameters: entry.parameters ?? entry.input_schema ?? entry.parametersJsonSchema ?? null,
      });
    }
  }
  return { system, tools };
}

function stamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** Writes the three files with owner-only permissions; they can hold memory, rules and conversation. */
export function writeExport(directory: string, payload: unknown, model: string, at: Date): { system: number; tools: number } {
  const { system, tools } = extractPrompt(payload);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const files: Record<string, string> = {
    "system-prompt.md": `${system.join("\n\n<!-- 下一条系统消息 -->\n\n")}\n`,
    "tools.md": `# 工具定义（${tools.length} 个）\n\n来自 ${model} 在 ${at.toLocaleString("sv-SE")} 发出的请求。\n\n`
      + tools.map((tool) => `## ${tool.name}\n\n${tool.description}\n\n\`\`\`json\n${JSON.stringify(tool.parameters, null, 2)}\n\`\`\`\n`).join("\n"),
    "request.json": `${JSON.stringify(payload, null, 2)}\n`,
  };
  for (const [name, content] of Object.entries(files)) {
    const path = join(directory, name);
    writeFileSync(path, content, { mode: 0o600 });
    chmodSync(path, 0o600);
  }
  return { system: system.join("").length, tools: tools.length };
}

export default function promptExport(pi: ExtensionAPI): void {
  let last: { payload: unknown; model: string; at: Date } | undefined;
  pi.on("session_start", () => { last = undefined; });
  pi.on("before_provider_request", (event, ctx) => {
    // Keep a reference only; serializing every request would copy the whole conversation.
    last = { payload: event.payload, model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "未知模型", at: new Date() };
  });
  pi.registerCommand("export-prompt", {
    description: "导出本会话最近一次实际发给模型的系统提示、工具定义和请求原文；可指定输出目录",
    handler: async (args, ctx) => {
      if (!last) {
        ctx.ui.notify("本会话还没有发出过模型请求；发一条消息后再导出。", "warning");
        return;
      }
      const cache = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
      const directory = args.trim() ? resolve(ctx.cwd, args.trim()) : join(cache, "pi-prompt-exports", stamp(last.at));
      const counts = writeExport(directory, last.payload, last.model, last.at);
      ctx.ui.notify(`已导出 ${last.model} 最近一次请求到 ${directory}\n- system-prompt.md：系统提示原文，${counts.system} 字符\n- tools.md：${counts.tools} 个工具定义\n- request.json：完整请求体（含对话）`, "info");
    },
  });
}
