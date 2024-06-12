--git needed
--Nerd font optional
--
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
    
    { "nvim-lualine/lualine.nvim",lazy=false},

    { "neoclide/coc.nvim", branch = "release"},

    {
    "nvim-treesitter/nvim-treesitter",
    build = ":TSUpdate",
    config = function () 
      local configs = require("nvim-treesitter.configs")

      configs.setup({
          ensure_installed = { "c", "lua", "vim", "vimdoc", "query" ,"rust","python" },
          sync_install = false,
          highlight = { enable = true },
          indent = { enable = true },  
        })
    end
    },
	
    {
    'nvim-telescope/telescope.nvim', tag = '0.1.6',
	-- or                              , branch = '0.1.x',
      dependencies = { 'nvim-lua/plenary.nvim','BurntSushi/ripgrep' }
    },

    {
    "kylechui/nvim-surround",
    version = "*", -- Use for stability; omit to use `main` branch for the latest features
    event = "VeryLazy",
    config = function()
        require("nvim-surround").setup({
            -- Configuration here, or leave empty to use defaults
        })
    end
    },
    
    {
    'numToStr/Comment.nvim',
    opts = {
        -- add any options here
    },
    lazy = false,
    },
    
    {"ojroques/vim-oscyank", branch="main"},
	{"ethanholz/nvim-lastplace",lazy=false},

	{
    "iamcco/markdown-preview.nvim",
    cmd = { "MarkdownPreviewToggle", "MarkdownPreview", "MarkdownPreviewStop" },
    ft = { "markdown" },
    build = function() vim.fn["mkdp#util#install"]() end,
	},
})
require('lualine').setup()
require("config.catppuccin")
require("config.coc")
require('Comment').setup()
require'nvim-lastplace'.setup {
    lastplace_ignore_buftype = {"quickfix", "nofile", "help"},
    lastplace_ignore_filetype = {"gitcommit", "gitrebase", "svn", "hgcommit"},
    lastplace_open_folds = true
}
require('basic')
vim.cmd 'source ~/.config/nvim/map.vim'
vim.g.coc_global_extensions = {'coc-snippets','coc-pairs','coc-rust-analyzer','coc-pyright','coc-json','coc-clangd','coc-toml'}
