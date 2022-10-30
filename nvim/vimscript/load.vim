source ~/.config/nvim/vimscript/config/coc.vim

"在创建一个新cpp文件时，自动加上作者，创建时间，和代码模板
autocmd BufNewFile *.cpp exec ":call SetTitle()"

func SetComment()
	call setline(1,"/**")
	call setline(2," *    author:  Rift")
	call setline(3," *    created: ".strftime("20%y.%m.%d  %H:%M"))
	call setline(4,"**/")
endfunc

func SetTitle()
	call SetComment()
	call setline(5,"#include<bits/stdc++.h>")
	call setline(6,"#define rep(i, a, b) for (int i = (a); i <= (b); ++i)")
	call setline(7,"#define per(i, a, b) for (int i = (a); i >= (b); --i)")
	call setline(8,"#define x first")
	call setline(9,"#define y second")
	call setline(10,"using namespace std;")
	call setline(11,"using ll = long long;")
	call setline(12,"using pr = pair<int,int>;")
	call setline(13,"")
	call setline(14,"signed main(){")
	call setline(15,"	ios::sync_with_stdio(false),cin.tie(nullptr);")
	call setline(16,"	")
	call setline(17,"	")
	call setline(18,"	")
	call setline(19,"	return 0;")
	call setline(20,"}")
	call cursor(13,1)
endfunc
