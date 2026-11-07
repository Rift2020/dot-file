/**
 * Subagents: the `subagent` tool runs fresh Pi sessions inside this process, several in parallel, and
 * returns their final answers as one tool result. Foreground only, at most two levels below the main
 * agent, models from MODELS only.
 *
 * A child loads no ambient extensions, skills or templates: it gets Pi's default prompt, AGENTS.md and a
 * short note, and one of two tool sets.
 * - read: read, grep, find, ls, plus bash inside an OS sandbox (sandbox-exec on macOS, bubblewrap on
 *   Linux) that can write only the child's own directory and the temp dirs.
 * - write: Pi's seven built-in tools, unrestricted, in the parent's working directory.
 * Both also get pi-web-access's web tools when the parent has them. Retries back off like the parent's,
 * with jitter, so parallel children spread out.
 *
 * A child lives under <agent dir>/subagents/<parent session id>/: `a1.jsonl` is its session and `a1/`
 * its own directory. Nothing is written next to the parent's session, so learn's organizer sees only
 * the tool call and its result. A parent without a session file keeps its children in memory and their
 * directories in the system temp dir, deleted when it ends. On start, folders whose parent session file
 * is gone are deleted; /subagent-clean deletes the child directories of every other session.
 */
import { execFile } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { StringEnum } from "@earendil-works/pi-ai";
import {
  createAgentSession, createBashToolDefinition, DefaultResourceLoader, formatSize, getAgentDir, SessionManager,
  SettingsManager, truncateHead, type AgentSession, type ExtensionAPI, type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/** The model whitelist. `thinking` is the default when a task names none; without it, settings decide. */
export const MODELS: Record<string, { model: string; thinking?: string }> = {
  flash: { model: "opencode-go/deepseek-v4.1-flash", thinking: "max" },
  sol: { model: "openai/gpt-6.1-sol" },
};
const MAX_DEPTH = 2;
const RUNNING_PER_LEVEL = 4;
const WARN_BYTES = 5 * 1024 ** 3;
const TOOLS = {
  read: ["read", "grep", "find", "ls", "bash"],
  write: ["read", "bash", "edit", "write", "grep", "find", "ls"],
};
const WEB_TOOLS = ["web_search", "fetch_content", "get_search_content"];
const ENTRY = "subagent";

type Tier = keyof typeof TOOLS;
interface Choice { model: string; thinking?: string; tools: Tier }
interface Task { task: string; model?: string; thinking?: string; tools?: Tier; followUp?: string }
interface Child { session: AgentSession; choice: Choice; busy: boolean }
type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number } };
export interface Options {
  depth: number;
  root: string;
  models: typeof MODELS;
  /** One queue per level, shared by every instance in this process. */
  limits: Array<<T>(job: () => Promise<T>) => Promise<T>>;
  sandbox?: (command: string, work: string) => string | undefined;
}

/** Runs at most `size` jobs at once; a finished job hands its slot straight to the next one. */
export function limiter(size: number) {
  let running = 0;
  const waiting: Array<() => void> = [];
  return async <T>(job: () => Promise<T>): Promise<T> => {
    if (running < size) running++;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await job();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else running--;
    }
  };
}

/** Pi waits min(base × 2^(n-1), max) before retry n; scale both by 0.5–1.5 each time. Pi needs integers. */
export function jitterRetries(settings: SettingsManager, random = Math.random): SettingsManager {
  const original = settings.getRetrySettings.bind(settings);
  settings.getRetrySettings = () => {
    const retry = original();
    const factor = 0.5 + random();
    return { ...retry, baseDelayMs: Math.round(retry.baseDelayMs * factor),
      maxAgentDelayMs: Math.round((retry.maxAgentDelayMs ?? 60_000) * factor) };
  };
  return settings;
}

const shell = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

/** `command` wrapped in an OS sandbox that can write only `work` and the temp dirs, or undefined without one. */
export function sandboxCommand(command: string, work: string, platform = process.platform, has = existsSync,
  temp = realpathSync(tmpdir())): string | undefined {
  if (platform === "darwin" && has("/usr/bin/sandbox-exec")) {
    const paths = [work, temp].map((path) => `(subpath ${JSON.stringify(path)})`).join(" ");
    const profile = "(version 1)(allow default)(deny file-write*)"
      + `(allow file-write* ${paths} (literal "/dev/null") (literal "/dev/zero") (literal "/dev/dtracehelper") (regex #"^/dev/(tty|fd/)"))`;
    return `/usr/bin/sandbox-exec -p ${shell(profile)} /bin/bash -c ${shell(command)}`;
  }
  const bwrap = ["/usr/bin/bwrap", "/bin/bwrap"].find((path) => has(path));
  if (platform === "linux" && bwrap) {
    return `${bwrap} --ro-bind / / --dev /dev --tmpfs /tmp --bind ${shell(work)} ${shell(work)} --chdir ${shell(work)}`
      + ` --die-with-parent /bin/bash -c ${shell(command)}`;
  }
  return undefined;
}

/** What a child is told beyond Pi's default prompt. */
export function childNote(tools: Tier, work: string, cwd: string): string {
  return [
    "## 子代理",
    "你是主代理派出的子代理，看不到主对话。你的最后一条回复会原样交给主代理，用户看不到你的中间过程。",
    "不能向用户提问：信息不够时按合理的假设做完，并在回复里写明假设了什么、还缺什么。",
    "最后一条回复只写主代理需要的结论和依据（文件路径、行号、命令结果的要点），不复述过程。",
    `你的独占目录是 ${work}，临时文件、下载和克隆的仓库都放这里。`,
    tools === "read"
      ? `工作目录 ${cwd} 只读，你没有 edit 和 write 工具。bash 在独占目录里启动，运行在沙箱里，除了独占目录和临时目录哪里都写不了。`
      : `你可以修改工作目录 ${cwd} 里的文件，bash 在工作目录里启动。`,
  ].join("\n");
}

export function emptyUsage(): Usage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
}

/** Adds what the messages cost: every reply, plus the nested work their tool results report. */
export function addUsage(total: Usage, messages: ReadonlyArray<{ role?: string; usage?: Partial<Usage> }>): Usage {
  for (const message of messages) {
    const usage = message.role === "assistant" || message.role === "toolResult" ? message.usage : undefined;
    if (!usage) continue;
    for (const key of ["input", "output", "cacheRead", "cacheWrite", "totalTokens"] as const) total[key] += usage[key] ?? 0;
    for (const key of Object.keys(total.cost) as Array<keyof Usage["cost"]>) total.cost[key] += usage.cost?.[key] ?? 0;
  }
  return total;
}

/** The parent session a child session file names in its header. */
function parentOf(file: string): string | undefined {
  const fd = openSync(file, "r");
  try {
    const buffer = Buffer.alloc(16_384);
    const line = buffer.subarray(0, readSync(fd, buffer, 0, buffer.length, 0)).toString("utf8").split("\n", 1)[0];
    return JSON.parse(line).parentSession;
  } catch {
    return undefined;
  } finally {
    closeSync(fd);
  }
}

/** Deletes the folders of parent sessions that no longer exist (a /temp chat after 3:30, a deleted one). */
export function sweep(root: string, keep: string): void {
  if (!existsSync(root)) return;
  for (const name of readdirSync(root)) {
    const dir = join(root, name);
    if (name === keep || !statSync(dir).isDirectory()) continue;
    const file = readdirSync(dir).find((entry) => entry.endsWith(".jsonl"));
    const parent = file && parentOf(join(dir, file));
    if (parent && !existsSync(parent)) rmSync(dir, { recursive: true, force: true });
  }
}

/** Deletes the child directories of every parent but `keep`; the child sessions stay. */
export function clean(root: string, keep: string): void {
  if (!existsSync(root)) return;
  for (const name of readdirSync(root)) {
    const dir = join(root, name);
    if (name === keep || !statSync(dir).isDirectory()) continue;
    for (const entry of readdirSync(dir)) {
      if (statSync(join(dir, entry)).isDirectory()) rmSync(join(dir, entry), { recursive: true, force: true });
    }
  }
}

async function diskUsage(root: string): Promise<number> {
  if (!existsSync(root)) return 0;
  const { stdout } = await promisify(execFile)("du", ["-sk", root]);
  return Number.parseInt(stdout, 10) * 1024;
}

function duration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

async function close(session: AgentSession): Promise<void> {
  try {
    await session.abort();
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
  } catch {
    // A child that cannot shut down cleanly is still disposed.
  } finally {
    session.dispose();
  }
}

export function subagents(options: Options) {
  const { depth, root, models } = options;
  const sandbox = options.sandbox ?? ((command, work) => sandboxCommand(command, work));
  return function register(pi: ExtensionAPI): void {
    const children = new Map<string, Child>();
    let memoryDir: string | undefined;

    /** Where this session's children go; a parent without a session file keeps them in the temp dir. */
    const home = (ctx: ExtensionContext) => {
      const id = ctx.sessionManager.getSessionId();
      const file = ctx.sessionManager.getSessionFile();
      if (file) return { dir: join(root, id), file };
      memoryDir = join(tmpdir(), "pi-subagents", id);
      return { dir: memoryDir, file: undefined };
    };

    const open = async (ctx: ExtensionContext, id: string, task: Task | undefined): Promise<Child> => {
      const { dir, file: parentFile } = home(ctx);
      const file = parentFile ? join(dir, `${id}.jsonl`) : undefined;
      if (!task && !(file && existsSync(file))) throw new Error(`没有编号为 ${id} 的子代理`);
      const work = join(dir, id);
      mkdirSync(work, { recursive: true });
      const manager = file ? SessionManager.open(file, dir, ctx.cwd) : SessionManager.inMemory(ctx.cwd);
      let choice: Choice;
      if (task) {
        const name = task.model ?? "flash";
        choice = { model: name, thinking: task.thinking ?? models[name]?.thinking, tools: task.tools ?? "read" };
        const header = manager.getHeader();
        if (header && parentFile) header.parentSession = parentFile;
        manager.appendCustomEntry(ENTRY, choice);
      } else {
        const entry = manager.getEntries().find((item) => item.type === "custom" && item.customType === ENTRY);
        choice = (entry as { data?: Choice } | undefined)?.data ?? { model: "flash", tools: "read" };
      }
      const target = models[choice.model]?.model;
      const slash = target?.indexOf("/") ?? -1;
      const model = target && ctx.modelRegistry.find(target.slice(0, slash), target.slice(slash + 1));
      if (!model) throw new Error(`模型 ${target ?? choice.model} 不可用`);

      const agentDir = getAgentDir();
      const settings = jitterRetries(SettingsManager.inMemory(SettingsManager.create(ctx.cwd, agentDir).getSettings()));
      const web = pi.getAllTools().find((tool) => tool.name === "web_search")?.sourceInfo?.path;
      const loader = new DefaultResourceLoader({
        cwd: ctx.cwd, agentDir, settingsManager: settings,
        noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
        additionalExtensionPaths: web && !web.startsWith("builtin:") ? [web] : [],
        extensionFactories: [(api: ExtensionAPI) => {
          if (choice.tools === "read") {
            api.registerTool(createBashToolDefinition(work, {
              spawnHook: (spawn) => {
                const command = sandbox(spawn.command, work);
                if (!command) throw new Error("这台机器没有可用的沙箱（macOS 的 sandbox-exec 或 Linux 的 bubblewrap），只读档不能用 bash");
                return { ...spawn, command, cwd: work };
              },
            }));
          }
          if (depth + 1 < MAX_DEPTH) subagents({ ...options, depth: depth + 1 })(api);
        }],
        appendSystemPrompt: [childNote(choice.tools, work, ctx.cwd)],
      });
      await loader.reload();
      const tools = [...TOOLS[choice.tools], ...(web ? WEB_TOOLS : []), ...(depth + 1 < MAX_DEPTH ? ["subagent"] : [])];
      const { session } = await createAgentSession({
        cwd: ctx.cwd, agentDir, model, thinkingLevel: choice.thinking as never, tools,
        modelRuntime: (ctx.modelRegistry as unknown as { runtime: never }).runtime,
        resourceLoader: loader, sessionManager: manager, settingsManager: settings,
      });
      await session.bindExtensions({ mode: "print" });
      return { session, choice, busy: false };
    };

    pi.registerTool({
      name: "subagent",
      label: "Subagent",
      description: "Run subagents: fresh sessions that work on the tasks in parallel (4 at a time) and return their "
        + "final answers, each headed by an id such as a1. Use only when the user asks for subagents.",
      parameters: Type.Object({
        tasks: Type.Array(Type.Object({
          task: Type.String({ description: "Complete instructions; the subagent sees nothing of this conversation" }),
          model: Type.Optional(StringEnum(Object.keys(models), { description: "Default flash (cheap); sol is stronger" })),
          thinking: Type.Optional(StringEnum(["low", "medium", "high", "xhigh", "max"])),
          tools: Type.Optional(StringEnum(["read", "write"], { description: "read (default): read tools, web, and "
            + "bash sandboxed to its own empty directory, e.g. for git clone. write: may edit the working directory" })),
          followUp: Type.Optional(Type.String({ description: "Only to continue a subagent from an earlier result: "
            + "its id, e.g. a1. It keeps its model, tools and context. Omit for a new subagent" })),
        }), { minItems: 1 }),
      }),

      async execute(_toolCallId, params, signal, onUpdate, ctx) {
        const { dir } = home(ctx);
        let next = 1;
        for (const name of [...children.keys(), ...(existsSync(dir) ? readdirSync(dir) : [])]) {
          const number = /^a(\d+)/.exec(name);
          if (number) next = Math.max(next, Number(number[1]) + 1);
        }
        const seen = new Set<string>();
        const jobs = (params.tasks as Task[]).map((task) => ({
          task, id: task.followUp ?? `a${next++}`, label: "", calls: 0, current: undefined as string | undefined,
          started: 0, state: "排队中", text: "", ok: false,
        }));
        const total = emptyUsage();

        const run = async (job: (typeof jobs)[number]) => {
          if (seen.has(job.id)) throw new Error(`同一次调用里 ${job.id} 出现了两次`);
          seen.add(job.id);
          if (children.get(job.id)?.busy) throw new Error(`${job.id} 正在运行`);
          await options.limits[depth](async () => {
            if (signal?.aborted) throw new Error("已中断");
            job.state = "启动中";
            job.started = Date.now();
            let child = children.get(job.id);
            if (!child) {
              child = await open(ctx, job.id, job.task.followUp ? undefined : job.task);
              children.set(job.id, child);
            }
            if (signal?.aborted) throw new Error("已中断");
            child.busy = true;
            const { session, choice } = child;
            job.label = `${choice.model} ${session.thinkingLevel} · ${choice.tools}`;
            job.state = "运行中";
            const before = session.messages.length;
            const unsubscribe = session.subscribe((event) => {
              if (event.type === "tool_execution_start") {
                job.calls++;
                job.current = event.toolName;
              } else if (event.type === "tool_execution_end") job.current = undefined;
            });
            const stop = () => void session.abort();
            signal?.addEventListener("abort", stop, { once: true });
            try {
              await session.prompt(job.task.task, { expandPromptTemplates: false });
            } finally {
              unsubscribe();
              signal?.removeEventListener("abort", stop);
              child.busy = false;
            }
            const added = session.messages.slice(before);
            addUsage(total, added as never);
            const last = added.filter((message) => message.role === "assistant").at(-1) as
              { stopReason?: string; errorMessage?: string } | undefined;
            if (signal?.aborted || last?.stopReason === "aborted") throw new Error("已中断");
            if (!last || last.stopReason === "error") throw new Error(last?.errorMessage || "子代理没有回复");
            const answer = truncateHead(session.getLastAssistantText() ?? "");
            job.text = answer.content + (answer.truncated ? "\n[回复太长，已截断]" : "");
            job.ok = true;
          });
        };

        const progress = () => {
          const now = Date.now();
          const lines = jobs.map((job) => {
            if (job.state !== "运行中") return `${job.id} ${job.state}`;
            const tool = job.current ? ` · 正在 ${job.current}` : "";
            return `${job.id} ${job.label} · ${duration(now - job.started)} · ${job.calls} 次工具${tool}`;
          });
          onUpdate?.({ content: [{ type: "text", text: lines.join("\n") }], details: {} });
        };
        progress();
        const timer = setInterval(progress, 1000);
        try {
          await Promise.all(jobs.map((job) => run(job).then(
            () => { job.state = "完成"; },
            (error: unknown) => { job.state = "失败"; job.text = error instanceof Error ? error.message : String(error); },
          )));
        } finally {
          clearInterval(timer);
        }

        const text = jobs.map((job) => {
          const head = [job.id, job.label, job.ok ? `${job.calls} 次工具调用` : "失败"].filter(Boolean).join(" · ");
          return `[${head}]\n${job.text}`;
        }).join("\n\n");
        return {
          content: [{ type: "text", text }],
          details: { tasks: jobs.map(({ id, label, calls, ok }) => ({ id, label, calls, ok })) },
          isError: jobs.every((job) => !job.ok),
          ...(total.totalTokens || total.cost.total ? { usage: total } : {}),
        };
      },
    });

    pi.on("session_shutdown", async () => {
      const sessions = [...children.values()].map((child) => child.session);
      children.clear();
      await Promise.all(sessions.map(close));
      if (memoryDir) rmSync(memoryDir, { recursive: true, force: true });
      memoryDir = undefined;
    });

    if (depth > 0) return;
    pi.on("session_start", (_event, ctx) => {
      try {
        sweep(root, ctx.sessionManager.getSessionId());
      } catch {
        // Cleanup must never block the chat.
      }
      diskUsage(root).then((bytes) => {
        if (bytes > WARN_BYTES) ctx.ui.notify(`子代理目录占用 ${formatSize(bytes)}，可以用 /subagent-clean 清理`, "warning");
      }, () => {});
    });
    pi.registerCommand("subagent-clean", {
      description: "删掉其他会话的子代理独占目录（子会话保留，之后追问会拿到新的空目录）",
      handler: async (_args, ctx) => {
        const before = await diskUsage(root);
        clean(root, ctx.sessionManager.getSessionId());
        const after = await diskUsage(root);
        ctx.ui.notify(`子代理目录原来占用 ${formatSize(before)}，删掉了 ${formatSize(before - after)}`, "info");
      },
    });
  };
}

export default function subagent(pi: ExtensionAPI): void {
  const limits = Array.from({ length: MAX_DEPTH }, () => limiter(RUNNING_PER_LEVEL));
  subagents({ depth: 0, root: join(getAgentDir(), "subagents"), models: MODELS, limits })(pi);
}
