/**
 * Global base prompt: replace Pi's coding-only identity sentence and its fixed
 * "Be concise" rule, and tell every session today's local date.
 *
 * SYSTEM.md would also replace the tool list, tool rules and docs that Pi and
 * other extensions render, so this edits only those two lines of the rendered
 * prompt. When Pi's wording changes, the prompt is left as Pi renders it.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const PI_PREAMBLE =
  "You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.";
export const PREAMBLE =
  "你是在 pi 智能体环境中工作的通用助手，帮助用户编程、学习、研究和写作；按任务需要读取文件、执行命令、编辑代码、创建文件和查找资料。";
// Answer length follows AGENTS.md instead of a fixed brevity rule.
const CONCISE_RULE = "\n- Be concise in your responses\n";

/** Date only, so the prompt changes once a day rather than every turn. */
export function currentDate(now = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const weekday = new Intl.DateTimeFormat("zh-CN", { timeZone, weekday: "long" }).format(now);
  return `今天是 ${day}（${weekday}），时区 ${timeZone}。`;
}

/** The rewritten prompt, or undefined when it does not start with Pi's default sentence. */
export function rewritePrompt(prompt: string): string | undefined {
  if (!prompt.startsWith(PI_PREAMBLE)) return undefined;
  return PREAMBLE + prompt.slice(PI_PREAMBLE.length).replace(CONCISE_RULE, "\n");
}

export default function basePrompt(pi: ExtensionAPI): void {
  let warned = false;
  pi.on("before_agent_start", (event, ctx) => {
    const options = event.systemPromptOptions;
    // Another extension already owns the whole prompt for this run.
    if (options.forceSystemPrompt !== undefined) return;
    options.sections.current_date = currentDate();
    const prompt = rewritePrompt(event.systemPrompt);
    if (prompt !== undefined) return { systemPrompt: prompt };
    if (!options.customPrompt && !warned) {
      warned = true;
      ctx.ui.notify("base-prompt：Pi 默认身份句已变化，本次未替换；请更新 ~/.config/dot-file/pi/extensions/base-prompt.ts。", "warning");
    }
  });
}
