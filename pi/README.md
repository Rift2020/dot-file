# Pi 个人配置

配置用于日常聊天、代码任务和纯文本 / Markdown 工作交付，以自然语言区分任务，不实现三套模式或权限切换。

## 文件与设置

| 文件 | 用途 |
| --- | --- |
| `settings.json` | 可跨机器同步的偏好：项目信任、界面、上下文压缩、默认模型、轮换与插件列表 |
| `web-search.json` | pi-web-access 的 Clash fake-IP 地址池兼容设置；不存放密钥 |
| `AGENTS.md` | 中文协作、简单任务直接执行、复杂任务先讨论、尊重只读要求、证据与交付约定 |
| `link.sh` | 部署入口：合并设置，链接协作约定和搜索配置 |
| `apply-settings.mjs` | 将仓库偏好合并到本机可写的 `settings.json`，保留本机状态 |
| `test-link.mjs` | 部署、重复执行、迁移、冲突与异常处理测试 |
| `.gitignore` | 使用显式白名单，避免凭据、会话、缓存和运行状态误入 Git |

`settings.json` 中由本方案设置的四项基础设置：

- `defaultProjectTrust: "always"`：默认信任项目，不弹出首次信任询问。已有显式信任决定或命令行覆盖仍遵循 Pi 自身的优先级。
- `theme: "system"`：使用终端配色。
- `tuiMode: "fullscreen"`：使用全屏界面。
- `compaction.enabled: true`：保留自动上下文压缩，阈值沿用 Pi 默认值。

后三项本身也是 Pi 1.0.4 的默认行为，在文件中写明以便理解和同步。`hideThinkingBlock: true` 隐藏对话中的思考块，不改变模型的推理强度。本方案保留原生 `read`、`bash`、`edit`、`write` 工具、自动保存会话和系统提示词。编辑器继承 `VISUAL` / `EDITOR`，不写机器专属路径。

Pi 在界面中保存的偏好只写入本机配置，不会自动修改仓库；需要同步的改动应更新本目录的 `settings.json`，然后重新运行 `link.sh`。

已安装联网扩展 `pi-web-access`，保留默认自动选择搜索来源和 `workflow: none`（不打开结果整理页面、不额外生成摘要）；未添加搜索服务密钥。普通零配置搜索可使用 Exa MCP；选用通过 ChatGPT 登录的 OpenAI 模型时，插件会优先尝试复用该授权搜索。

已安装状态栏扩展 `@reedchan/statusline`，沿用插件默认的两行布局，显示上下文占用、模型与 effort、缓存命中率、费用及首字延迟 / 输出速度。运行 `/reload` 或重启 Pi 后加载；`Ctrl+Q` 或 `/breakdown` 可切换上下文明细。当前未配置币种转换，费用按插件默认显示美元。

`web-search.json` 仅设置 `ssrf.allowRanges: ["198.18.0.0/16"]`，适配本机 Clash 的 fake-IP 地址池，避免读取公网网页时被插件按保留地址拦截。其他地址的现有防护保留；其他机器使用前应确认该网段同样由可信代理接管，不使用 fake-IP 时应移除此项。搜索服务密钥使用环境变量等本机凭据来源，不写入这个受 Git 管理的文件。

不额外安装搜索 MCP、Office / PDF 工具、多代理或长期记忆系统；不创建固定 Chat / Work 工作目录。模型与推理强度按下方轮换列表设置。当前不包含自定义提示词模板或 Skill。

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
3. DeepSeek V4.1 Flash：`deepseek/deepseek-flash:high`

在 Pi 输入界面按 `Ctrl+P` 切到下一项，按 `Ctrl+Shift+P` 切到上一项；每次轮换同时应用该项指定的 effort。可用 `/thinking` 或 `Shift+Tab` 临时调整，下一次轮换回该模型时仍采用列表中的强度。

默认启动使用 `defaultProvider: "openai"`、`defaultModel: "gpt-6.1-sol"`、`defaultThinkingLevel: "high"`。`modelThinkingLevels` 同时声明三个模型各自的默认 effort（Sol 为 `high`、Astra 为 `xhigh`、DeepSeek 为 `high`），通过 `/model` 切换时也会应用；快捷轮换以 `enabledModels` 中的显式强度为准。实际启动仍受可用认证与命令行覆盖规则影响；继续历史会话会恢复原会话的模型和 effort。修改仓库中的设置后运行 `link.sh`，重新启动 Pi 使默认值与轮换列表生效。

这里只限制快捷轮换范围，仍可用 `/model` 选择其他已接入模型。不需要预设扩展、提示词模板或 Skill。

## Mac 与 Linux 同步

只同步本目录的配置文件。在每台机器分别安装 Pi（要求 Node.js 22.19 或更新版本），再运行部署脚本：

```sh
curl -fsSL https://pi.dev/install.sh | sh
sh ~/.config/pi/link.sh
pi --version
pi install npm:pi-web-access
pi install npm:@reedchan/statusline
```

上面的命令假定 dotfiles 已放到 `~/.config`；其他位置可以直接运行该位置的 `pi/link.sh`。目标默认是 `~/.pi/agent`，可通过 `PI_CODING_AGENT_DIR` 指定。Linux 按同样步骤独立安装、部署和登录；部署测试目前在 macOS 上运行。

### 偏好与本机状态分离

- `AGENTS.md`、`web-search.json` 使用软链接，仓库修改直接反映到本机文件。
- `settings.json` **不是软链接**：脚本将仓库设置递归合并到本机文件。仓库声明的键优先；没有声明的本机键（包括嵌套键）保留；数组整体替换。
- `deviceId`、`lastChangelogVersion` 不保存在仓库。Pi 可在本机维护这些状态而不会弄脏 Git 工作区。删除仓库中的某个键不会自动删除本机对应的键，需要在本机单独删除。
- 首次变更已有设置时，原文件备份到目标目录的 `settings.json.before-dotfiles.bak`；不覆盖已有备份。写入通过同目录临时文件与原子替换完成，新设置和新备份权限为 `0600`。
- 旧版指向本仓库 `settings.json` 的软链接会自动迁移为普通文件，不修改链接源。已有普通设置文件会合并；其他软链接、目录、无效 JSON，以及已有非本仓库的指令 / 搜索配置均拒绝覆盖。脚本先检查所有目标路径，重复部署相同设置不会重写文件。

部署时避免同时在 Pi 的设置界面修改配置。正在运行的会话可以继续，设置重载或下次启动时读取本机文件。若需要回退本机设置，退出 Pi 后复制备份到 `settings.json`，再重启。

整个 `~/.pi/agent` 不进入 dotfiles：安装目录、`bin/`、插件安装产物 `npm/`、账号 `auth.json`、模型端点配置 `models.json`、模型缓存 `models-store.json`、会话、日志、信任记录、`web-search-cache/` 与 `statusline/state/` 各机独立。插件通过 `settings.json` 的 `packages` 声明及上面的安装命令重建，不复制 `node_modules`。新增需要同步的资源时，显式更新本目录的 Git 白名单与部署脚本。

### 验证

```sh
sh -n ~/.config/pi/link.sh
node --test ~/.config/pi/test-link.mjs
```

测试使用临时目录，不接触本机认证、会话或实际配置。

## 官方说明

- [安装与开始使用](https://pi.dev/docs/latest/quickstart)
- [配置目录](https://pi.dev/docs/latest/configuration)
- [设置参考](https://pi.dev/docs/latest/settings)
