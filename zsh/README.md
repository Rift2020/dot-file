# Zsh 配置与快捷键指南

这是一套供 macOS、Arch Linux 与 Debian/Ubuntu 共用的 Zsh 配置。软件包列表和各平台安装命令位于 `.zshrc` 顶部。

## 首次部署

每台机器在自己的 `~/.zshrc` 中加载同步下来的主配置：

```zsh
source "${XDG_CONFIG_HOME:-$HOME/.config}/zsh/.zshrc"
```

配置会根据主文件自身的位置加载 `paths.zsh`、`.zsh_plugins.txt` 和 `starship.toml`，不依赖 `~/.zshenv` 或 `ZDOTDIR`。

macOS 可以执行：

```zsh
brew install antidote starship zoxide fzf
brew install --cask font-jetbrains-mono-nerd-font
```

Arch Linux 可以安装图标字体：

```zsh
sudo pacman -S ttf-jetbrains-mono-nerd
```

Debian/Ubuntu 若没有对应软件包，从 Nerd Fonts 官方发布页下载 `JetBrainsMono.tar.xz`，将字体解压到 `~/.local/share/fonts/JetBrainsMono`，然后执行 `fc-cache -f`。终端字体请选择 `JetBrainsMono Nerd Font Mono`。

其余 Arch Linux 与 Debian/Ubuntu 安装说明见 `.zshrc` 顶部。

## 快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Tab` | 通过 fzf-tab 打开模糊补全菜单 |
| `Ctrl-R` | 使用 fzf 搜索命令历史 |
| `Ctrl-T` | 使用 fzf 选择文件或目录，并插入当前命令行 |
| `Alt-C` | 使用 fzf 选择并进入目录 |
| `↑` / `↓` | 按已经输入的前缀搜索历史 |
| `Ctrl-P` | 上一条符合前缀的历史记录 |
| `Ctrl-N` | 接受完整的自动建议；插件不可用时退化为下一条历史记录 |
| `→` 或 `End` | 光标位于行尾时接受自动建议 |
| `Ctrl-→` / `Ctrl-←` | 向前或向后移动一个单词 |
| `Ctrl-A` / `Ctrl-E` | 移动到行首或行尾 |
| `Ctrl-U` / `Ctrl-K` | 删除光标到行首或行尾的内容 |
| `Ctrl-W` | 删除光标前一个单词 |
| `Ctrl-L` | 清空终端画面 |

在 fzf-tab 菜单内，可以使用 `Tab` 或方向键移动、`Enter` 接受、`Ctrl-Space` 多选、`<` / `>` 切换补全分组。

## 辅助命令

- `z 名称`：通过 zoxide 跳到常用目录。
- `zi`：交互选择 zoxide 记录的目录。
- `proxy_on [主机] [端口]`：启用 HTTP、HTTPS 与 SOCKS 代理，默认是 `127.0.0.1:7897`。
- `proxy_off`：清除代理环境变量。
- `proxy_status`：显示当前代理状态。
- `conda ...`：第一次调用时才初始化 Conda，之后与普通 Conda 命令相同。
- `antidote update`：更新 Zsh 插件；Antidote 会保留自动快照。
