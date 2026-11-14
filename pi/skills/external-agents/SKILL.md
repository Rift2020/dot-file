---
name: external-agents
description: 把一件完整的任务交给本机的 Codex（codex exec）或 Claude Code（claude -p），需要时让它自己再开几个子代理并行，最后交回一份结论。只在用户点名 Codex、Claude Code（CC）或"外部代理"时用，包括让它们开子代理；用户没点名时，子代理任务用 subagent 工具。
---

# 外部代理：Codex 和 Claude Code

Codex 和 Claude Code 是本机装好并已登录的另外两个编程代理。交给它们的任务在它们自己的会话里跑：它们看不到这次对话，可以按要求再开子代理，最后交回一份结论。用户没点名时不要用。

## 选哪个

| | Codex | Claude Code |
| --- | --- | --- |
| 模型 | `gpt-6.1-sol`（默认）；最难的活用 `gpt-6-astra` | `sonnet`（默认）；最难的活用 `opus` |
| 额度 | ChatGPT 套餐，和这里的 openai 模型共用一份 | Claude Pro，额度小，每次光起步就要约 2 万 token |
| 子代理 | 一个一个派出，间隔几秒 | 一次派出，同时开始 |
| 运行中 | 什么都不显示，等它做完 | 每个子代理开始、结束各显示一行 |

用户只说"外部代理"时：要分很多份的批量活用 Codex；要看每个子代理的进度，或用户想听 Claude 的意见时用 Claude Code。零碎的小问题自己答，不要交出去。

## 写任务书

先建运行目录，记下打印出的路径，下面命令里的 `RUN=` 都填它（每次 bash 调用都是新 shell，变量不会保留）：

```sh
mkdir -p ~/.cache/external-agents && RUN=$(mktemp -d ~/.cache/external-agents/XXXXXX) && mkdir "$RUN/work" && echo "$RUN"
```

用 write 工具把任务写进 `<运行目录>/task.md`：

- 目标、相关文件或网址（写绝对路径）、限制、做到什么算完。`learn video` 这类工具的用法也写进去。
- 要几个子代理就直接写："用 N 个子代理并行，第 1 个负责……"。写成要求，不要写成"最多 N 个"，它会照这个数开。
- 回复格式：每个子代理一段，失败的写明原因；结论带依据（路径、行号、命令输出），推断要标明。
- 一次只交一件事。

## 档位

- **只读**（默认）：在 `<运行目录>/work` 里启动，只能写这个目录和临时目录；读任何文件、联网、`learn video` 都可以。下载、克隆的仓库都放这里。
- **可写**：只在用户要它改文件时用，在项目目录里启动，能写的是项目目录。改完你自己看 diff、跑检查，再告诉用户。

两个 CLI 都套着自己的沙箱。不要用 `--dangerously-*` 一类的参数，也不要关掉沙箱重试；沙箱起不来时把报错告诉用户。

## Codex

```sh
RUN=<运行目录>
codex exec -m gpt-6.1-sol -c 'model_reasoning_effort="high"' \
  -s workspace-write -C "$RUN/work" -c 'sandbox_workspace_write.network_access=true' \
  -c 'agents.max_concurrent_threads_per_session=4' --skip-git-repo-check \
  --json -o "$RUN/answer.md" - < "$RUN/task.md" > "$RUN/events.jsonl" 2> "$RUN/progress.log"
echo "exit=$?"; cat "$RUN/answer.md"
```

- 可写档：`-C` 换成项目目录。
- `max_concurrent_threads_per_session` 是同时跑的子代理上限，填要的个数（最多 8），多出来的排队。要让子代理省额度，加 `-c 'agents.default_subagent_reasoning_effort="medium"'`。
- 用户要 ultra 时把 `model_reasoning_effort` 改成 `"ultra"`：最高推理，并由它自己决定开不开子代理、开几个。
- 不要加 `--ephemeral`：主机上的 Codex 0.164 不存会话时派不出子代理（`collab spawn failed`），会悄悄由主代理自己做。
- 失败（`exit` 不是 0 或没有 `answer.md`）时看 `progress.log` 末尾。用量在 `events.jsonl` 最后的 `turn.completed`。
- 追问：会话 id 是 `events.jsonl` 第一行的 `thread_id`。回到原来的目录接着问，沙箱要重新指定：

```sh
RUN=<运行目录>; cd "$RUN/work"   # 可写档 cd 到项目目录
codex exec --skip-git-repo-check resume <thread_id> -m gpt-6.1-sol -c 'model_reasoning_effort="high"' \
  -c 'sandbox_mode="workspace-write"' -c 'sandbox_workspace_write.network_access=true' \
  --json -o "$RUN/answer-2.md" - < "$RUN/followup.md" > "$RUN/events-2.jsonl" 2>> "$RUN/progress.log"
echo "exit=$?"; cat "$RUN/answer-2.md"
```

## Claude Code

先写沙箱设置，再运行。输出经本 skill 目录下的 `claude-progress.py`：子代理开始、结束各打一行，最后是结论、会话 id 和估算花费（Pro 套餐按额度算，不另收钱）。

```sh
RUN=<运行目录>
cat > "$RUN/settings.json" <<'EOF'
{"sandbox": {"enabled": true, "failIfUnavailable": true, "autoAllowBashIfSandboxed": true,
  "allowUnsandboxedCommands": false, "network": {"allowedDomains": ["*"], "allowAllUnixSockets": true}}}
EOF
cd "$RUN/work" && claude -p --model sonnet --effort high --settings "$RUN/settings.json" \
  --permission-mode dontAsk --tools "Read,Grep,Glob,Bash,Agent,WebFetch,WebSearch" \
  --allowedTools "Read,Grep,Glob,Bash,Agent,WebFetch,WebSearch" \
  --output-format stream-json --verbose < "$RUN/task.md" 2> "$RUN/progress.log" \
  | python3 <skill 目录>/claude-progress.py "$RUN/events.jsonl"
```

- 可写档：`cd` 到项目目录，`--permission-mode` 换成 `acceptEdits`，去掉 `--tools` 那一行（用全部工具）。
- 任务书从 stdin 传：`--tools`、`--allowedTools` 会把后面跟着的参数当成工具名吞掉。
- 不要加 `--add-dir`：加进来的目录在沙箱里会变成可写。读别处的文件靠上面放行的 Read、Grep、Glob。
- 出现"被拒绝的工具"时，看是不是任务需要的工具没放行；不要换成 `bypassPermissions`。
- 追问：在同一个目录里，同样的命令加 `--resume <会话 id>`，任务书换成 `followup.md`，记录写到 `events-2.jsonl`。

## 拿到结果后

- 交回的是同事的结论，不是事实：关键处自己核对，告诉用户时说明哪些是 Codex 或 Claude Code 给的。
- 运行目录先留着，方便追问；用户说不用了就删掉。`du -sh ~/.cache/external-agents` 看占用。
- 只在主对话里用。subagent 派出的只读子代理本身在系统沙箱里，macOS 不允许沙箱嵌套，在里面启动这两个 CLI 会失败。
