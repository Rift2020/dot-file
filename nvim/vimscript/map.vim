map <F2> :NvimTreeToggle<CR>

map <S-a> <ESC>gg0vG$
map <S-c> "+y :OSCYankReg + "+ <CR>
map <F12> :MarkdownPreview<CR>

"F9编译并运行
nnoremap <F9> :call CompileRunGcc()<CR>


"将当前文件<filename>.cpp 
"以c++17标准编译，输出重定向到 <filename>output文件中
"待程序结束后，在末尾打印所有的程序输出
"并且删除所有的中间文件(<filename>,<filename>output)
func! CompileRunGcc()
	:w
	exec "wall"
	exec '!g++ % -o %< -std=c++17 -D LOCAL;./%< >%<output;echo -e "\033[34mexit code = $?,output is:\033[0m";cat %<output;rm %<output %<'

endfunc

