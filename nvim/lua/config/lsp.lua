vim.opt.signcolumn = "yes"
vim.opt.updatetime = 300

-- LSP servers listed below are auto-installed/enabled via mason-lspconfig.
-- If your environment blocks downloads, install these servers manually:
--   clangd (C/C++), rust-analyzer (Rust), pyright (Python), jsonls, taplo, lua_ls.

local capabilities = require("blink.cmp").get_lsp_capabilities()

require("mason").setup()
require("mason-lspconfig").setup({
  ensure_installed = {
    "lua_ls",
    "pyright",
    "rust_analyzer",
    "clangd",
    "jsonls",
    "taplo",
  },
  automatic_enable = true,
})

local servers = {
  pyright = {},
  rust_analyzer = {},
  clangd = {},
  jsonls = {},
  taplo = {},
  lua_ls = {
    settings = {
      Lua = {
        diagnostics = {
          globals = { "vim" },
        },
        workspace = {
          checkThirdParty = false,
        },
      },
    },
  },
}

for server_name, server_opts in pairs(servers) do
  server_opts.capabilities = capabilities
  vim.lsp.config(server_name, server_opts)
end

vim.lsp.enable(vim.tbl_keys(servers))

vim.api.nvim_create_autocmd("LspAttach", {
  callback = function(args)
    local opts = { buffer = args.buf, silent = true }

    vim.keymap.set("n", "gd", vim.lsp.buf.definition, opts)
    vim.keymap.set("n", "gD", vim.lsp.buf.declaration, opts)
    vim.keymap.set("n", "gi", vim.lsp.buf.implementation, opts)
    vim.keymap.set("n", "gr", vim.lsp.buf.references, opts)
    vim.keymap.set("n", "K", vim.lsp.buf.hover, opts)
    vim.keymap.set("n", "<leader>rn", vim.lsp.buf.rename, opts)
    vim.keymap.set({ "n", "v" }, "<leader>a", vim.lsp.buf.code_action, opts)
    vim.keymap.set("n", "<leader>f", function()
      vim.lsp.buf.format({ async = true })
    end, opts)
  end,
})

vim.keymap.set("n", "[g", vim.diagnostic.goto_prev, { silent = true })
vim.keymap.set("n", "]g", vim.diagnostic.goto_next, { silent = true })
