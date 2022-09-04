" 基本配置
source ~/.config/nvim/vimscript/basic.vim

" Packer插件管理
lua require('plugins')

lua require('load')
source ~/.config/nvim/vimscript/load.vim
source ~/.config/nvim/vimscript/map.vim
