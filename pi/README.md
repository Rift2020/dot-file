# Pi 个人配置

配置用于日常聊天、代码任务和纯文本 / Markdown 工作交付，以自然语言区分任务，不实现三套模式或权限切换。

## 文件与设置

| 文件 | 用途 |
| --- | --- |
| `settings.json` | 可跨机器同步的偏好：项目信任、界面、上下文压缩、默认模型、轮换与插件列表 |
| `web-search.json` | pi-web-access 的 Clash fake-IP 地址池兼容设置；不存放密钥 |
| `AGENTS.md` | 中文协作、简单任务直接执行、复杂任务先讨论、尊重只读要求、难以撤销的操作先确认、证据与交付约定 |
| `extensions/base-prompt.ts` | 全局扩展：替换 Pi 默认系统提示的身份句，去掉固定的“Be concise”，并告诉每个会话当天日期 |
| `extensions/prompt-export.ts` | 全局扩展：`/export-prompt` 导出最近一次实际发给模型的系统提示、工具定义和请求原文 |
| `extensions/recap.ts` | 全局扩展：仿 Claude Code，每次回复结束后在对话里补一行 `※ recap:`，一两句话说明目标、当前任务和下一步；`/recap` 开关 |
| `extensions/background-service-tier.ts` | 全局扩展：非交互 OpenAI 请求固定 Standard，保留手动会话保存的 Fast 开关 |
| `extensions/gemini4-thinking.ts` | 临时全局扩展：Pi 原生支持 Gemini 4 前，把发给 Gemini 4 的思考预算改成它接受的思考档位 |
| `extensions/paste-image.ts` | 全局扩展：SSH 连到 kitty 时，`Ctrl+V` 经 kitty 读取本地剪贴板里的图片 |
| `link.sh` | 部署入口：合并设置与搜索配置，链接协作约定和扩展 |
| `apply-settings.mjs` | 将仓库偏好合并到本机可写的 `settings.json` 与 `web-search.json`，保留本机状态 |
| `test-link.mjs` | 部署、重复执行、迁移、冲突与异常处理测试 |
| `test-base-prompt.mjs` | 系统提示改写与日期的测试 |
| `test-prompt-export.mjs` | 各服务商请求格式的提取与导出测试 |
| `test-recap.mjs` | recap 的触发条件、请求内容、缓存前缀、开关、黑名单与失败处理测试 |
| `test-background-service-tier.mjs` | 验证交互保留 Fast、后台固定 Standard，以及两个扩展的加载顺序 |
| `test-gemini4-thinking.mjs` | Gemini 4 思考档位改写及其他请求不受影响的测试 |
| `test-paste-image.mjs` | 图片粘贴的启用条件、kitten 调用、授权密码传递与失败处理测试 |
| `.gitignore` | 使用显式白名单，避免凭据、会话、缓存和运行状态误入 Git |

`settings.json` 中由本方案设置的四项基础设置：

- `defaultProjectTrust: "always"`：默认信任项目，不弹出首次信任询问。已有显式信任决定或命令行覆盖仍遵循 Pi 自身的优先级。
- `theme: "system"`：使用终端配色。
- `tuiMode: "fullscreen"`：使用全屏界面。
- `compaction.enabled: true`：保留自动上下文压缩，阈值沿用 Pi 默认值。

后三项本身也是 Pi 1.0.4 的默认行为，在文件中写明以便理解和同步。`hideThinkingBlock: true` 隐藏对话中的思考块，不改变模型的推理强度。本方案保留原生 `read`、`bash`、`edit`、`write` 工具和自动保存会话。编辑器继承 `VISUAL` / `EDITOR`，不写机器专属路径。

Pi 在界面中保存的偏好只写入本机配置，不会自动修改仓库；需要同步的改动应更新本目录的 `settings.json`，然后重新运行 `link.sh`。

## 系统提示

Pi 默认系统提示的开头是 “You are an expert coding assistant…”，规则里固定有一条 “Be concise in your responses”。这里的用途不只是编程，回答长度也交给 `AGENTS.md` 的协作约定，所以 `extensions/base-prompt.ts` 在每轮开始前做三件事：

- 把身份句换成“通用助手，帮助用户编程、学习、研究和写作”。
- 删掉 “Be concise” 这一条，其他规则保持不变。
- 增加 `<current_date>` 小节，写明本机时区的当天日期和星期。只写到日期，一天只变一次，对提示缓存影响很小；Pi 自己不提供日期。

工具列表、工具规则、Pi 文档索引、`AGENTS.md`、skills 等部分仍由 Pi 和各扩展按原样生成。不用 `SYSTEM.md` 的原因：它会连同工具列表、工具规则和文档索引一起替换掉，其他扩展写的工具说明也会消失。项目自带 `SYSTEM.md` 时只加日期，不改写。

扩展通过 `before_agent_start` 返回改写后的完整提示；会话记录里仍保存 Pi 的原始分节。Pi 升级后如果默认身份句的措辞变了，扩展不做改写，并在界面提示一次需要更新。learn 聊天和阅读线批处理也会加载这个全局扩展；learn 的整理工作会话不加载扩展，不受影响。

### 查看实际发送的提示

在会话里输入 `/export-prompt`，把本会话最近一次实际发给模型的请求导出到 `~/.cache/pi-prompt-exports/<时间>/`；也可以写 `/export-prompt <目录>` 指定位置（相对路径按当前工作目录）。导出三个文件：

- `system-prompt.md`：系统提示原文，已经包含 `base-prompt` 等扩展的改写、`AGENTS.md`、skill 清单和应用追加的内容。会话记录里存的是 Pi 改写前的分节，看实际发送内容以这里为准。
- `tools.md`：每个工具的名称、说明和参数结构，模型看到的工具说明都在这里。
- `request.json`：完整请求体，包括对话内容。

扩展只在内存里保留最近一次请求的引用，执行命令时才写文件；目录权限 0700、文件 0600，因为其中可能有记忆、规则和对话。新会话开始后要先发一条消息才能导出。支持 OpenAI（Responses 与 Chat Completions）、Anthropic 和 Google 的请求格式；`request.json` 总是原样保存。

### 会话回顾

仿 Claude Code 的 session recap。Claude Code 在终端失焦几分钟后才生成；这里不检测失焦，每次回复结束就生成，显示为对话里一行灰色的 `※ recap: …`。

- **触发条件**沿用 Claude Code：会话里至少有 3 轮用户消息，上一次回顾之后至少又有 2 轮；输入框里有草稿、还有排队的消息时跳过。生成途中发出新消息或开始新一轮，这次回顾作废。只在交互界面生成，`--print`、JSON 和 RPC 模式不生成。
- **生成方式**照 Claude Code 的做法：用当前会话的模型和完整对话，末尾追加 Claude Code 的回顾指令（另加一句：用户写中文就用中文，不超过 80 字）；thinking 用 low，禁止调用工具，超过 400 字符截断。请求沿用主对话最近一次实际请求的系统提示和工具列表（Pi 自己只知道 base-prompt 改写前的提示），并去掉会话里记录系统提示变化的条目，前缀与主对话一致。OpenAI 的提示缓存按推理档位区分，所以只有会话本身也是 low 时才能复用主对话的缓存；high、xhigh 会话的第一次回顾整段按原价计，之后的回顾复用上一次回顾的缓存（2026-10-15 实测，约 3 万 token 的会话每次约 $0.06）。
- **显示与保存**：回顾作为自定义条目存进会话记录，翻历史还能看到，但不会发给模型；learn 的整理也会跳过它。条目里另存了模型和用量（输入、缓存命中、输出、花费）。
- **开关**：`/recap off`、`/recap on` 或 `/recap`（切换），所有模型共用；`/recap status` 查看。状态存在 `~/.pi/agent/extensions/recap.json`，留在本机、不提交 Git，新会话、`/reload` 和重启沿用；没有这个文件时为开启。
- **模型黑名单**：`recap.ts` 里的 `EXCLUDED_MODELS`，目前是 `openai/gpt-6-astra`；名单里的模型无论开关如何都不生成回顾。

### 粘贴图片

Pi 自带的 `Ctrl+V` 会把剪贴板里的图片存成临时文件，再把路径插进输入框，由模型用 `read` 打开。它读的是运行 Pi 那台机器的剪贴板；通过 SSH 使用时远端没有图形界面，读不到本地截图。`extensions/paste-image.ts` 在这种情况下接管 `Ctrl+V`：

- **启用条件**：SSH 会话、终端是 kitty、不在 tmux 里（tmux 会拦下 kitty 的剪贴板请求），且 `PATH` 里有 `kitten`。用 `kitten ssh` 登录时 kitty 会在远端装好 `kitten`。条件不满足时不接管，`Ctrl+V` 仍是 Pi 自带的行为。只在交互界面生效。
- **做法**：仿 Pi 示例 `interactive-shell.ts`，先暂停界面、把终端交给 `kitten clipboard --get-clipboard`，由它经 kitty 读取本地剪贴板里的图片并转成 PNG；读完恢复界面。图片和 Pi 自带粘贴一样存成 `/tmp/pi-clipboard-<uuid>.png`，路径插进输入框。剪贴板里没有图片时只提示，文字仍用 kitty 的 `Ctrl+Shift+V` 粘贴。
- **授权**：kitty 默认在程序读取剪贴板前弹窗询问。扩展每个 Pi 进程生成一个随机密码，通过文件描述符交给 kitten，不出现在命令行参数里。kitty 弹窗时选择记住这个密码，同一个 Pi 进程之后的粘贴就不再询问；`/reload` 或重启 Pi 后会再问一次。弹窗两分钟没有回应则放弃这次粘贴。

## 插件

已安装联网扩展 `pi-web-access`，保留默认自动选择搜索来源和 `workflow: none`（不打开结果整理页面、不额外生成摘要）；未添加搜索服务密钥。普通零配置搜索可使用 Exa MCP；选用通过 ChatGPT 登录的 OpenAI 模型时，插件会优先尝试复用该授权搜索。

已安装状态栏扩展 `@reedchan/statusline`，沿用插件默认的两行布局，显示上下文占用、模型与 effort、缓存命中率、费用及首字延迟 / 输出速度。运行 `/reload` 或重启 Pi 后加载；`Ctrl+Q` 或 `/breakdown` 可切换上下文明细。当前未配置币种转换，费用按插件默认显示美元。

`web-search.json` 仅设置 `ssrf.allowRanges: ["198.18.0.0/16"]`，适配本机 Clash 的 fake-IP 地址池，避免读取公网网页时被插件按保留地址拦截。其他地址的现有防护保留；其他机器使用前应确认该网段同样由可信代理接管，不使用 fake-IP 时应移除此项。搜索服务密钥使用环境变量等本机凭据来源，不写入这个受 Git 管理的文件。只适用于某台机器的设置（例如本机为避开内存盘 `/tmp` 而设的 `githubClone.clonePath`）直接写在那台机器的 `~/.pi/agent/web-search.json`，部署时保留。

已安装文档解析扩展 `pi-docparser`，固定版本 4.0.0（`pi update` 不会移动固定版本），提供 `document_parse`、`document_search`、`document_screenshot`：本地解析 PDF、按短语查页码、把页面渲染成图片；Office 转换需要另装 LibreOffice。

Fast 使用社区 [pi-gpt-fast-extension](https://github.com/dingdinglz/pi-gpt-fast-extension)（当前 1.2.0）。`/fast on`、`/fast off` 和 `/fast` 保存最后一次开关；新会话、`/new`、`/resume`、`/reload` 和重启恢复该状态，`/fast status` 查看状态。默认首次关闭，支持当前 `openai/gpt-6.1-sol`；只请求 `service_tier: "priority"`，不改变 thinking、模型、提示或工具。状态文件 `~/.pi/agent/extensions/fast-mode.json` 留在本机，不提交 Git。

`background-service-tier.ts` 对非 TUI 的 OpenAI 请求（print、JSON、RPC）明确设置 `service_tier: "default"`，包括 learn 的摘要、选材与阅读加工；不会修改 Fast 状态文件。社区插件尊重已有 `service_tier`，因此无论这两个扩展的加载顺序如何，后台都保持普通档位。learn 的 `/org` 不加载全局插件，不读取 Fast 开关；recap 用 runtime 直接调用，也不经过社区插件。Fast 的实际服务档位与用量以 OpenAI 后端为准。

`gemini4-thinking.ts` 是临时补丁。Pi 1.2.0 还不认识 Gemini 4（`gemini-4-argon`），learn 的阅读加工却要用它：本机 `~/.pi/agent/models.json` 手工登记了这个模型（`google-vertex`，思考档位 low/medium/high，价格按每百万 token 输入 $2、输出 $10、缓存读 $0.1），可是 Pi 只对 Gemini 3 发送 `thinkingLevel`，对其他型号发 `thinkingBudget`，Vertex 会以 400 拒绝。扩展在发请求前把 Gemini 4 的 `thinkingBudget` 换成对应的 `thinkingLevel`，其他请求不动。Pi 原生支持 Gemini 4 后，删除这个扩展和 `models.json` 里的条目，再从本仓库的 `link.sh`、白名单和测试中去掉它。

不额外安装搜索 MCP、多代理或长期记忆系统；不创建固定 Chat / Work 工作目录。模型与推理强度按下方轮换列表设置。当前不包含自定义提示词模板或 Skill。

## 本机使用

在想工作的目录启动 `pi`，用自然语言说明需求。首次使用模型时在 Pi 中运行 `/login`，完成账号或 API Key 配置，再用 `/model` 选择模型。此配置不会填入密钥；轮换模型需要对应服务商已有可用认证。

直接用自然语言说明需求，例如“分析这个问题，先不要修改”或“检查最近的未提交改动”。全局协作约定属于提示词指导，不是强制只读沙箱。

- `pi --continue`：继续同一工作目录最近的会话。
- `/resume`：选择历史会话。
- `/reload`：重新加载修改后的指令和设置。
- `pi update`：更新官方安装器管理的 Pi。

## 模型与 effort 轮换

使用 Pi 原生 `enabledModels`，按以下顺序循环：

1. GPT-6.1 Sol：`openai/gpt-6.1-sol:high`（默认模型）
2. GPT-6 Astra：`openai/gpt-6-astra:xhigh`
3. Gemini 3.8 Flash：`google-vertex/gemini-3.8-flash:medium`（需要 Vertex AI 认证）

在 Pi 输入界面按 `Ctrl+P` 切到下一项，按 `Ctrl+Shift+P` 切到上一项；每次轮换同时应用该项指定的 effort。可用 `/thinking` 或 `Shift+Tab` 临时调整，下一次轮换回该模型时仍采用列表中的强度。

默认启动使用 `defaultProvider: "openai"`、`defaultModel: "gpt-6.1-sol"`、`defaultThinkingLevel: "high"`。`modelThinkingLevels` 同时声明三个模型各自的默认 effort（Sol 为 `high`、Astra 为 `xhigh`、Gemini 为 `medium`），通过 `/model` 切换时也会应用；快捷轮换以 `enabledModels` 中的显式强度为准。实际启动仍受可用认证与命令行覆盖规则影响；继续历史会话会恢复原会话的模型和 effort。修改仓库中的设置后运行 `link.sh`，重新启动 Pi 使默认值与轮换列表生效。

这里只限制快捷轮换范围，仍可用 `/model` 选择其他已接入模型。不需要预设扩展、提示词模板或 Skill。

## Mac 与 Linux 同步

只同步本目录的配置文件。在每台机器分别安装 Pi（要求 Node.js 22.19 或更新版本），再运行部署脚本：

```sh
curl -fsSL https://pi.dev/install.sh | sh
sh ~/.config/pi/link.sh
pi --version
pi install npm:pi-web-access
pi install npm:@reedchan/statusline
pi install npm:pi-docparser@4.0.0
pi install git:github.com/dingdinglz/pi-gpt-fast-extension
```

上面的命令假定 dotfiles 已放到 `~/.config`；其他位置可以直接运行该位置的 `pi/link.sh`。目标默认是 `~/.pi/agent`，可通过 `PI_CODING_AGENT_DIR` 指定。Linux 按同样步骤独立安装、部署和登录；部署测试目前在 macOS 上运行。

### 偏好与本机状态分离

- `AGENTS.md` 和 `extensions/` 下的扩展使用软链接，仓库修改直接反映到本机文件；扩展的改动在 `/reload` 或重启后生效。
- `settings.json` 和 `web-search.json` **不是软链接**：脚本将仓库设置递归合并到本机文件。仓库声明的键优先；没有声明的本机键（包括嵌套键）保留；数组整体替换。
- `deviceId`、`lastChangelogVersion` 不保存在仓库。Pi 可在本机维护这些状态而不会弄脏 Git 工作区。删除仓库中的某个键不会自动删除本机对应的键，需要在本机单独删除。
- 首次变更已有设置时，原文件备份到目标目录的 `<文件名>.before-dotfiles.bak`；不覆盖已有备份。写入通过同目录临时文件与原子替换完成，新设置和新备份权限为 `0600`。
- 旧版指向本仓库 `settings.json` 或 `web-search.json` 的软链接会自动迁移为普通文件，不修改链接源。已有普通设置文件会合并；其他软链接、目录、无效 JSON，以及已有非本仓库的指令 / 扩展均拒绝覆盖。脚本先检查所有目标路径，两个设置文件都通过校验后才开始写入；重复部署相同设置不会重写文件。

部署时避免同时在 Pi 的设置界面修改配置。正在运行的会话可以继续，设置重载或下次启动时读取本机文件。若需要回退本机设置，退出 Pi 后复制备份到 `settings.json`，再重启。

整个 `~/.pi/agent` 不进入 dotfiles：安装目录、`bin/`、插件安装产物 `npm/`、账号 `auth.json`、模型端点配置 `models.json`、模型缓存 `models-store.json`、会话、日志、信任记录、`web-search-cache/` 与 `statusline/state/` 各机独立。插件通过 `settings.json` 的 `packages` 声明及上面的安装命令重建，不复制 `node_modules`。新增需要同步的资源时，显式更新本目录的 Git 白名单与部署脚本。

### 验证

```sh
sh -n ~/.config/pi/link.sh
node --test ~/.config/pi/test-link.mjs ~/.config/pi/test-base-prompt.mjs ~/.config/pi/test-prompt-export.mjs ~/.config/pi/test-recap.mjs ~/.config/pi/test-paste-image.mjs ~/.config/pi/test-background-service-tier.mjs ~/.config/pi/test-gemini4-thinking.mjs
```

测试使用临时目录，不接触本机认证、会话或实际配置。

## 官方说明

- [安装与开始使用](https://pi.dev/docs/latest/quickstart)
- [配置目录](https://pi.dev/docs/latest/configuration)
- [设置参考](https://pi.dev/docs/latest/settings)
