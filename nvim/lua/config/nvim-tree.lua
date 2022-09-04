require'nvim-tree'.setup {
	-- 不显示任何图标
	renderer = {
		icons={
			show={
				file = false,
				folder = false,
				folder_arrow = false,
				git = false
			}
		}
	}
}
