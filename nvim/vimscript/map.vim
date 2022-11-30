map <F2> :NvimTreeToggle<CR>

map <C-a> <ESC>gg0vG$
map <C-c> "+y :OSCYankReg + "+ <CR>
map <F12> :MarkdownPreview<CR>

"F9编译并运行
nnoremap <F9> :call CompileRunGcc()<CR>
nnoremap <F8> :call OpenInputFile()<CR>

"将当前文件<filename>.cpp 
"以c++17标准编译，输出重定向到 <filename>output文件中
"待程序结束后，在末尾打印所有的程序输出
"并且删除所有的中间文件(<filename>,<filename>output)
func!  OpenInputFile()
	:vsp
	:e %<.input
endfunc
func!  CompileRunGcc()
	:w
	exec "wall"
	exec '!g++ % -o %< -std=c++17 -D LOCAL'
	exec '!./%< <%<.input >%<.output'
	exec '!echo "exit code = $?,output is:\n";cat %<.output;rm %<.output %<'

endfunc

