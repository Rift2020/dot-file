-- External dependencies (Linux/macOS):
-- 1) Base tools for plugin manager and installations:
--    - git, curl, unzip, tar, gzip
-- 2) Search backend used by telescope live_grep:
--    - ripgrep (command: rg)
-- 3) Treesitter parser compilation toolchain:
--    - gcc or clang, and make
--    - tree-sitter-cli >= 0.26.1 (command: tree-sitter), installed via your package manager (not npm)
-- 4) Markdown preview plugin (iamcco/markdown-preview.nvim):
--    - nodejs and npm
-- 5) Clipboard over SSH with vim-oscyank:
--    - terminal must support OSC52 (e.g. iTerm2/Kitty/WezTerm/tmux configured for OSC52)
-- 6) LSP servers are managed by mason-lspconfig in this config:
--    - keep network access available on first run for automatic server install
-- 7) C/C++ formatting on buffer leave is powered by conform.nvim + clang-format:
--    - remember to install clang-format (binary: clang-format)
--
-- Quick install examples:
--   Ubuntu/Debian: sudo apt install git curl unzip tar gzip ripgrep build-essential nodejs npm
--   Fedora: sudo dnf install git curl unzip tar gzip ripgrep gcc gcc-c++ make nodejs npm
--   Arch Linux: sudo pacman -S --needed git curl unzip tar gzip ripgrep base-devel nodejs npm tree-sitter-cli
--   macOS (Homebrew): brew install git curl ripgrep node && xcode-select --install
-- Nerd font optional

if vim.fn.has("nvim-0.11") == 0 then
	error("This configuration requires Neovim >= 0.11")
end

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

	{
		"folke/which-key.nvim",
		event = "VeryLazy",
		opts = {
			-- your configuration comes here
			-- or leave it empty to use the default settings
			-- refer to the configuration section below
		},
		keys = {
			{
				"<leader>?",
				function()
					require("which-key").show({ global = false })
				end,
				desc = "Buffer Local Keymaps (which-key)",
			},
		},
	},

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
		"stevearc/conform.nvim",
		event = { "BufReadPre", "BufNewFile" },
		config = function()
			require("conform").setup({
				formatters_by_ft = {
					c = { "clang_format" },
					cpp = { "clang_format" },
					h = { "clang_format" },
					hpp = { "clang_format" },
				},
				-- Keep this simple per conform.nvim README: enable built-in format-on-save.
				format_on_save = function(bufnr)
					local ft = vim.bo[bufnr].filetype
					if ft == "c" or ft == "cpp" or ft == "h" or ft == "hpp" then
						return { timeout_ms = 500, lsp_format = "never" }
					end
				end,
			})
		end,
	},

	{
		"saghen/blink.cmp",
		version = "*",
		opts = {
			keymap = {
				preset = "default",
				["<Right>"] = { "snippet_forward", "fallback" },
				["<Left>"] = { "snippet_backward", "fallback" },
				["<Tab>"] = { "select_next", "fallback" },
				["<CR>"] = { "accept", "fallback" },
				-- ["<C-y>"] = false,
			},
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
		branch = "main",
		lazy = false,
		build = ":TSUpdate",
		config = function()
			require("nvim-treesitter").setup({})

			require("nvim-treesitter").install({
				"lua",
				"python",
				"c",
				"cpp",
				"rust",
				"go",
				"bash",
			})

			-- bash 的查询也用于 sh / zsh（可选，但很实用）
			vim.treesitter.language.register("bash", { "sh", "zsh" })

			vim.api.nvim_create_autocmd("FileType", {
				pattern = {
					"lua",
					"python",
					"c",
					"cpp",
					"rust",
					"go",
					"bash",
					"sh",
					"zsh",
				},
				callback = function()
					pcall(vim.treesitter.start)
				end,
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

	{
		"windwp/nvim-autopairs",
		event = "InsertEnter",
		config = function()
			require("nvim-autopairs").setup({})
		end,
	},

	{
		"rachartier/tiny-inline-diagnostic.nvim",
		event = "VeryLazy",
		config = function()
			require("tiny-inline-diagnostic").setup({})
			vim.diagnostic.config({ virtual_text = false })
		end,
	},

	{ "ojroques/vim-oscyank", branch = "main" },

})

require("lualine").setup()
require("config.catppuccin")
require("config.lsp")
require("Comment").setup()
require("basic")
vim.cmd.source(vim.fs.joinpath(vim.fn.stdpath("config"), "map.vim"))
