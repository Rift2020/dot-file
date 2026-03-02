# Neovim 配置不合理点排查（当前仓库）

> 目标：仅针对当前已经启用的配置（`nvim/init.lua` + `nvim/lua/**`）识别“容易踩坑/维护成本高/行为不一致”的点。

## 结论（优先级从高到低）

1. **同时启用 `mason-lspconfig` 自动启用 + 手动 `vim.lsp.enable`，存在重复启用风险**。
2. **`map.vim` 用绝对路径 `~/.config/nvim/map.vim` source，不利于 dotfiles 仓库复用**。
3. **`completeopt` 被清空字符串，可能影响补全菜单体验与一致性**。
4. **`<Tab>` 在 blink.cmp 中强绑定为“选下一个候选”，容易与缩进/跳转语义冲突**。
5. **Treesitter 每次启动都执行 `install(...)`，会引入启动期额外开销/网络行为**。
6. **仓库内存在旧配置副本（`nvim/basic.lua`、`nvim/config/*.lua`），与实际加载路径并存，易误导维护者**。

---

## 详细问题

### 1) LSP 启用路径重复

- 在 `mason-lspconfig` 中开启了 `automatic_enable = true`。  
- 后续又对同一组 server 执行 `vim.lsp.enable(vim.tbl_keys(servers))`。  

这两者叠加时，可能出现同一服务器被重复启用、attach 次数异常或调试困难（尤其在升级 Neovim/LSP 生态后更明显）。

**建议**
- 只保留一种启用方式：
  - 要么保留 `automatic_enable = true`，去掉手动 `vim.lsp.enable(...)`；
  - 要么关闭 automatic_enable，统一手动启用。

### 2) `map.vim` 使用绝对路径 source

- 当前使用：`vim.cmd("source ~/.config/nvim/map.vim")`。

在 dotfiles 仓库里，这种写法依赖运行时目录布局，迁移到其他机器或 CI 场景时容易失效。

**建议**
- 改为基于 `stdpath("config")` 的路径拼接，或直接把 map 迁移为 Lua keymap。

### 3) `completeopt` 设为空字符串

- 当前：`set.completeopt = ""`。

补全框行为通常依赖 `completeopt`（例如 `menu,menuone,noinsert,noselect` 等组合），清空后会回落到默认行为，可能和 blink/LSP 的预期交互不一致。

**建议**
- 显式设置为一组可维护的默认值（按个人习惯微调）：
  - 如 `menu,menuone,noselect`。

### 4) `<Tab>` 作为补全选择键的冲突风险

- blink keymap 中将 `<Tab>` 绑定为 `select_next`。

这会和常见的“插入 tab 字符/缩进/snippet 跳转”语义竞争，特别在空白行、Makefile、缩进敏感语言中体感差异明显。

**建议**
- 使用更保守组合（例如 `<C-n>/<C-p>` 导航，`<Tab>` 仅在 snippet 可跳转时接管）。

### 5) Treesitter 安装策略放在启动路径

- 配置中在 plugin `config` 里直接调用 `require("nvim-treesitter").install({...})`。

这会让“安装行为”与“编辑器启动”耦合：首次/缺 parser 时可能触发网络与编译开销，不利于稳定启动时间。

**建议**
- 将安装动作迁移到显式命令（如首次手动执行）或专门的 bootstrap 脚本；
- 启动时只做 `setup` 与按需 `start`。

### 6) 旧配置文件与新路径并存

- 当前实际加载的是 `nvim/lua/basic.lua` 与 `nvim/lua/config/*.lua`（`require("basic")`、`require("config.lsp")` 等）。
- 但仓库中还保留了 `nvim/basic.lua`、`nvim/config/*.lua` 的旧版本。

这会导致“看起来都像在生效，但其实只有一套生效”的维护陷阱，后续改错文件概率较高。

**建议**
- 删除未使用旧文件，或在文件头明确标记“deprecated / not loaded”。

---

## 快速修复顺序（建议）

1. 先修 LSP 启用重复（收益高、改动小）。
2. 改 `source ~/.config/nvim/map.vim` 为可移植路径。
3. 明确 `completeopt` 与 blink 的键位策略。
4. 把 Treesitter 安装动作从启动路径剥离。
5. 清理旧配置副本，降低维护歧义。
