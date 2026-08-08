# 由同目录的 .zshrc 显式加载，不依赖 ZDOTDIR 或登录 Shell。
typeset -U path PATH

# 只处理 macOS 的 Homebrew；Arch 与 Debian/Ubuntu 使用系统提供的 PATH。
if [[ $OSTYPE == darwin* ]]; then
  typeset _rift_brew=''
  for _rift_candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [[ -x $_rift_candidate ]]; then
      _rift_brew="$_rift_candidate"
      break
    fi
  done
  if [[ -n $_rift_brew && -z ${HOMEBREW_PREFIX:-} ]]; then
    eval "$("$_rift_brew" shellenv)"
  fi

  for _rift_dir in \
    /opt/homebrew/opt/curl/bin \
    /opt/homebrew/opt/coreutils/libexec/gnubin \
    /opt/homebrew/opt/bison/bin \
    /opt/homebrew/opt/findutils/libexec/gnubin \
    /usr/local/opt/curl/bin \
    /usr/local/opt/coreutils/libexec/gnubin \
    /usr/local/opt/bison/bin \
    /usr/local/opt/findutils/libexec/gnubin; do
    [[ -d $_rift_dir ]] && path=("$_rift_dir" $path)
  done

  unset _rift_brew _rift_candidate _rift_dir
fi
