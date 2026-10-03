# Pi 第一版个人配置

配置用于日常聊天、代码任务和纯文本 / Markdown 工作交付，以自然语言区分任务，不实现三套模式或权限切换。

## 文件与设置

| 文件 | 用途 |
| --- | --- |
| `settings.json` | 默认信任项目、终端主题、全屏界面、自动上下文压缩 |
| `AGENTS.md` | 中文协作、简单任务直接执行、复杂任务先讨论、尊重只读要求、证据与交付约定 |
| `link.sh` | 把以上资源链接到本机 Pi 配置目录 |
| `.gitignore` | 仅允许第一版列出的配置文件进入 Git |

`settings.json` 中由本方案设置的四项：

- `defaultProjectTrust: "always"`：默认信任项目，不弹出首次信任询问。已有显式信任决定或命令行覆盖仍遵循 Pi 自身的优先级。
- `theme: "system"`：使用终端配色。
- `tuiMode: "fullscreen"`：使用全屏界面。
- `compaction.enabled: true`：保留自动上下文压缩，阈值沿用 Pi 默认值。

后三项本身也是 Pi 1.0.0 的默认行为，在文件中写明以便理解和同步。本方案保留原生 `read`、`bash`、`edit`、`write` 工具、自动保存会话和系统提示词；后续在 Pi 中选择的模型等偏好仍由 Pi 保存。编辑器继承 `VISUAL` / `EDITOR`，不写机器专属路径。

第一版不安装 Tavily、其他搜索 MCP、第三方扩展、Office / PDF 工具、多代理或长期记忆系统；不创建固定 Chat / Work 工作目录。本方案不预设模型、账号、推理强度或厂商原生搜索。当前不包含自定义提示词模板或 Skill。

## 本机使用

在想工作的目录启动 `pi`，用自然语言说明需求。首次使用模型时在 Pi 中运行 `/login`，完成账号或 API Key 配置，再用 `/model` 选择模型。此配置不会替你选择服务商或填入密钥。

直接用自然语言说明需求，例如“分析这个问题，先不要修改”或“检查最近的未提交改动”。全局协作约定属于提示词指导，不是强制只读沙箱。

- `pi --continue`：继续同一工作目录最近的会话。
- `/resume`：选择历史会话。
- `/reload`：重新加载修改后的指令和设置。
- `pi update`：更新官方安装器管理的 Pi。

## Mac 与 Linux 同步

只同步本目录的配置文件。在每台机器分别安装 Pi（要求 Node.js 22.19 或更新版本），再运行链接脚本：

```sh
curl -fsSL https://pi.dev/install.sh | sh
sh ~/.config/pi/link.sh
pi --version
```

上面的命令假定 dotfiles 已放到 `~/.config`；其他位置可以直接运行该位置的 `pi/link.sh`。脚本根据自身位置建立链接，重复执行不会改动已有正确链接；遇到已有文件或其他链接会停止，不覆盖。

默认链接两项：`~/.pi/agent/settings.json`、`AGENTS.md`。只链接这些配置资源，整个 `~/.pi/agent` 不进入 dotfiles：安装文件、账号 `auth.json`、模型端点配置 `models.json`、模型目录缓存 `models-store.json`、会话、日志与信任记录各机独立。新增需要同步的配置文件时，显式更新本目录的 Git 白名单。

本次仅在 Mac 安装和应用配置。Linux 可在同步这些文件后按上面的步骤独立安装、链接和登录。

## 官方说明

- [安装与开始使用](https://pi.dev/docs/latest/quickstart)
- [配置目录](https://pi.dev/docs/latest/configuration)
- [设置参考](https://pi.dev/docs/latest/settings)
