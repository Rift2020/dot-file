# Pi 第一版个人配置

配置用于日常聊天、代码任务和纯文本 / Markdown 工作交付，以自然语言区分任务，不实现三套模式或权限切换。

## 文件与设置

| 文件 | 用途 |
| --- | --- |
| `settings.json` | 默认信任项目、终端主题、全屏界面、自动上下文压缩、模型与 effort 轮换、插件列表 |
| `web-search.json` | pi-web-access 的 Clash fake-IP 地址池兼容设置；不存放密钥 |
| `AGENTS.md` | 中文协作、简单任务直接执行、复杂任务先讨论、尊重只读要求、证据与交付约定 |
| `link.sh` | 把以上资源链接到本机 Pi 配置目录 |
| `.gitignore` | 仅允许第一版列出的配置文件进入 Git |

`settings.json` 中由本方案设置的四项基础设置：

- `defaultProjectTrust: "always"`：默认信任项目，不弹出首次信任询问。已有显式信任决定或命令行覆盖仍遵循 Pi 自身的优先级。
- `theme: "system"`：使用终端配色。
- `tuiMode: "fullscreen"`：使用全屏界面。
- `compaction.enabled: true`：保留自动上下文压缩，阈值沿用 Pi 默认值。

后三项本身也是 Pi 1.0.0 的默认行为，在文件中写明以便理解和同步。本方案保留原生 `read`、`bash`、`edit`、`write` 工具、自动保存会话和系统提示词；后续在 Pi 中选择的模型等偏好仍由 Pi 保存。编辑器继承 `VISUAL` / `EDITOR`，不写机器专属路径。

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

1. DeepSeek V4.1 Flash：`deepseek/deepseek-flash:high`
2. GPT-6.1 Sol：`openai/gpt-6.1-sol:xhigh`
3. GPT-6 Astra：`openai/gpt-6-astra:xhigh`

在 Pi 输入界面按 `Ctrl+P` 切到下一项，按 `Ctrl+Shift+P` 切到上一项；每次轮换同时应用该项指定的 effort。可用 `/thinking` 或 `Shift+Tab` 临时调整，下一次轮换回该模型时仍采用列表中的强度。

修改轮换列表后重新启动 Pi。普通新会话从列表中第一个可用模型开始；继续历史会话会恢复原会话的模型和 effort。命令行显式选择模型时遵循 Pi 的覆盖规则。

这里只限制快捷轮换范围，仍可用 `/model` 选择其他已接入模型。不需要预设扩展、提示词模板或 Skill。

## Mac 与 Linux 同步

只同步本目录的配置文件。在每台机器分别安装 Pi（要求 Node.js 22.19 或更新版本），再运行链接脚本：

```sh
curl -fsSL https://pi.dev/install.sh | sh
sh ~/.config/pi/link.sh
pi --version
pi install npm:pi-web-access
pi install npm:@reedchan/statusline
```

上面的命令假定 dotfiles 已放到 `~/.config`；其他位置可以直接运行该位置的 `pi/link.sh`。脚本根据自身位置建立链接，重复执行不会改动已有正确链接；遇到已有文件或其他链接会停止，不覆盖。

默认链接三项：`~/.pi/agent/settings.json`、`AGENTS.md`、`web-search.json`。只链接这些配置资源，整个 `~/.pi/agent` 不进入 dotfiles：安装文件、账号 `auth.json`、模型端点配置 `models.json`、模型目录缓存 `models-store.json`、会话、日志与信任记录各机独立。新增需要同步的配置文件时，显式更新本目录的 Git 白名单。

本次仅在 Mac 安装和应用配置。Linux 可在同步这些文件后按上面的步骤独立安装、链接和登录。

## 官方说明

- [安装与开始使用](https://pi.dev/docs/latest/quickstart)
- [配置目录](https://pi.dev/docs/latest/configuration)
- [设置参考](https://pi.dev/docs/latest/settings)
