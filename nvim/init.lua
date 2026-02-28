-- External dependencies (Linux/macOS):
-- 1) Base tools for plugin manager and installations:
--    - git, curl, unzip, tar, gzip
-- 2) Search backend used by telescope live_grep:
--    - ripgrep (command: rg)
-- 3) Treesitter parser compilation toolchain:
--    - gcc or clang, and make
-- 4) Markdown preview plugin (iamcco/markdown-preview.nvim):
--    - nodejs and npm
-- 5) Clipboard over SSH with vim-oscyank:
--    - terminal must support OSC52 (e.g. iTerm2/Kitty/WezTerm/tmux configured for OSC52)
-- 6) LSP servers are managed by mason-lspconfig in this config:
--    - keep network access available on first run for automatic server install
--
-- Quick install examples:
--   Ubuntu/Debian: sudo apt install git curl unzip tar gzip ripgrep build-essential nodejs npm
--   Fedora: sudo dnf install git curl unzip tar gzip ripgrep gcc gcc-c++ make nodejs npm
--   Arch Linux: sudo pacman -S --needed git curl unzip tar gzip ripgrep base-devel nodejs npm
--   macOS (Homebrew): brew install git curl ripgrep node && xcode-select --install
-- Nerd font optional

local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.loop.fs_stat(lazypath) then
  vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable", -- latest stable release
    lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

require("lazy").setup({
  -- theme
  { "catppuccin/nvim", name = "catppuccin", priority = 1000 },

  { "nvim-lualine/lualine.nvim", lazy = false },

  {
    "neovim/nvim-lspconfig",
    dependencies = {
      "williamboman/mason.nvim",
      "williamboman/mason-lspconfig.nvim",
      "saghen/blink.cmp",
    },
  },

  {
    "saghen/blink.cmp",
    version = "*",
    opts = {
      keymap = { preset = "default" },
      completion = {
        documentation = { auto_show = true, auto_show_delay_ms = 200 },
      },
      sources = {
        default = { "lsp", "path", "buffer" },
      },
      fuzzy = { implementation = "prefer_rust_with_warning" },
    },
    opts_extend = { "sources.default" },
  },

  {
    "nvim-treesitter/nvim-treesitter",
    build = ":TSUpdate",
    config = function()
      require("nvim-treesitter").setup({
        ensure_installed = { "c", "lua", "vim", "vimdoc", "query", "rust", "python" },
        sync_install = false,
        highlight = { enable = true },
        indent = { enable = true },
      })
    end,
  },

  {
    "nvim-telescope/telescope.nvim",
    tag = "0.1.6",
    -- `rg` is a system binary dependency (ripgrep), not a Neovim plugin dependency.
    dependencies = { "nvim-lua/plenary.nvim" },
  },

  {
    "kylechui/nvim-surround",
    version = "*",
    event = "VeryLazy",
    config = function()
      require("nvim-surround").setup({})
    end,
  },

  {
    "numToStr/Comment.nvim",
    opts = {},
    lazy = false,
  },

  { "ojroques/vim-oscyank", branch = "main" },

  {
    "iamcco/markdown-preview.nvim",
    cmd = { "MarkdownPreviewToggle", "MarkdownPreview", "MarkdownPreviewStop" },
    ft = { "markdown" },
    build = function()
      vim.fn["mkdp#util#install"]()
    end,
  },
})

require("lualine").setup()
require("config.catppuccin")
require("config.lsp")
require("Comment").setup()
require("basic")
vim.cmd("source ~/.config/nvim/map.vim")
