# Neovim 插件升级/替换审计（基于当前仓库配置）

> 假设目标版本是最新稳定版 Neovim（0.10+ / 0.11）。

## 结论速览

优先考虑替换的对象（按收益排序）：

1. `neoclide/coc.nvim` → **Neovim 原生 LSP 方案**
2. `BurntSushi/ripgrep`（被当作 Telescope 依赖）→ **移除该插件依赖，改用系统 `rg`**
3. `ojroques/vim-oscyank` → **Neovim 原生 OSC52 剪贴板支持（或更轻量方案）**
4. `ethanholz/nvim-lastplace` → **评估是否移除（原生跳转能力已够用）**

其余插件（`catppuccin` / `lualine` / `treesitter` / `telescope` / `Comment.nvim` / `nvim-surround`）总体可继续使用，但建议做版本与配置现代化。

---

## 逐项审计

### 1) `neoclide/coc.nvim`（建议替换）

**现状**
- 你当前配置把补全、跳转、诊断、重构、格式化几乎都绑定在 coc 上。
- 同时依赖 Node 生态与多个 coc 扩展（`coc-rust-analyzer`、`coc-pyright` 等）。

**为什么值得换**
- Neovim 最新版本的原生 LSP、诊断、inlay hints、语义高亮与生态（`nvim-lspconfig`、`mason.nvim`）已经很成熟。
- 减少“编辑器 + Node 插件宿主 + coc 扩展”的维护层数，调试更直接。
- 可按语言自由组合更现代方案（如 Rust 用 `rustaceanvim`，Python 走 `pyright/basedpyright`）。

**建议替代栈（主流组合）**
- LSP：`neovim/nvim-lspconfig` + `williamboman/mason.nvim` + `williamboman/mason-lspconfig.nvim`
- 补全：`hrsh7th/nvim-cmp`（或更新路线 `saghen/blink.cmp`）
- Snippet：`L3MON4D3/LuaSnip`
- 格式化：`stevearc/conform.nvim`
- 代码动作/诊断 UI（可选）：`folke/trouble.nvim`

**迁移成本**
- 中高：需要把现有 coc keymap/mapping 迁移到原生 LSP API。

---

### 2) Telescope 的 `BurntSushi/ripgrep` 依赖（建议移除）

**现状**
- `telescope.nvim` 的 dependencies 中写了 `BurntSushi/ripgrep`。

**问题**
- `ripgrep` 是系统二进制工具，不是常规 Neovim Lua 插件。
- 这种写法通常不会按预期安装可执行文件，反而让依赖语义混乱。

**建议**
- 从插件依赖移除 `BurntSushi/ripgrep`。
- 在系统层安装 `rg`（例如 `apt/pacman/brew`），并在 README 中说明。

**迁移成本**
- 低：改一行配置 + 补文档。

---

### 3) `ojroques/vim-oscyank`（建议评估替换）

**现状**
- 用于远程终端复制（OSC52）。

**为什么可以考虑换**
- 新版 Neovim 与常见终端环境对 OSC52 支持更友好，可通过原生/更轻量方式完成。
- 若你的终端和 SSH 链路已支持 OSC52，可减少一个 Vimscript 插件依赖。

**建议路径**
- 先验证 Neovim 原生 clipboard provider 是否满足需求。
- 不满足再保留 `vim-oscyank` 作为 fallback。

**迁移成本**
- 低到中：取决于终端环境与远程链路。

---

### 4) `ethanholz/nvim-lastplace`（可选替换/移除）

**现状**
- 负责打开文件时回到上次光标位置。

**为什么可评估移除**
- 原生 `'`"` mark 跳转 + 简单 autocmd 在许多场景已足够。
- 如果你不依赖其 fold/filetype 过滤能力，可简化依赖。

**迁移成本**
- 低。

---

## 不建议替换，但建议“升级/整理”的项

1. `nvim-telescope/telescope.nvim`
   - 你固定在 `tag = '0.1.6'`，建议升级到较新的 `0.1.x` tag 或稳定提交。

2. `nvim-treesitter/nvim-treesitter`
   - 保留即可；建议定期 `:TSUpdate`，并按实际语言收敛 `ensure_installed`。

3. `catppuccin/nvim`、`nvim-lualine/lualine.nvim`、`numToStr/Comment.nvim`、`kylechui/nvim-surround`
   - 都属于当前主流且维护正常的插件，可继续使用。

---

## 推荐的“最小风险”升级路线

1. **先做无风险整理**：
   - 移除 `BurntSushi/ripgrep` 插件依赖；改成系统安装说明。
   - 升级 Telescope tag。

2. **再做核心迁移（分阶段）**：
   - 先把 1~2 门语言从 coc 迁到原生 LSP（例如 Lua/Python）。
   - 待 keymap 和补全稳定后，再下线 coc。

3. **最后清理**：
   - 评估 `vim-oscyank` 和 `nvim-lastplace` 是否还必要。

---

## 给你的结论（可直接执行）

如果你只想做“最值得、最有长期收益”的替换：

- **第一优先级**：把 `coc.nvim` 迁移到原生 LSP 栈。
- **第二优先级**：清理 `ripgrep` 的插件式依赖写法。
- **第三优先级**：视你的终端环境，逐步淘汰 `vim-oscyank` 和 `nvim-lastplace`。

