# macOS、Arch Linux 与 Debian/Ubuntu 共用的 Zsh 配置。
#
# 必需软件包：zsh、git
# 推荐软件包：antidote、starship、zoxide、fzf
# 图标字体：JetBrainsMono Nerd Font Mono
#
# macOS（Homebrew）：
#   brew install antidote starship zoxide fzf
#   brew install --cask font-jetbrains-mono-nerd-font
# Arch Linux：
#   sudo pacman -S zsh git starship zoxide fzf
#   sudo pacman -S ttf-jetbrains-mono-nerd
# Debian/Ubuntu：
#   sudo apt install zsh git zoxide fzf
#   如果仓库提供 Starship，也一并安装；否则使用 Starship 官方安装方式。
#   Nerd Font 从 https://github.com/ryanoasis/nerd-fonts/releases 下载 JetBrainsMono。
#
# Arch/Debian 如果没有 Antidote 软件包：
#   git clone --depth=1 https://github.com/mattmc3/antidote.git \
#     "${XDG_DATA_HOME:-$HOME/.local/share}/zsh/antidote"

# Some tools explicitly source ~/.zshrc. Keep repeated loads harmless.
[[ -n ${_RIFT_ZSHRC_LOADED:-} ]] && return
typeset -g _RIFT_ZSHRC_LOADED=1

# Only interactive shells need prompt, completion, plugins, and key bindings.
[[ -o interactive ]] || return

typeset -U path PATH fpath

typeset -g ZSH_CONFIG_DIR="${${(%):-%N}:A:h}"
typeset -g ZSH_CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/zsh"
command mkdir -p "$ZSH_CACHE_DIR/completion"

# 通过主配置自身的位置加载平台 PATH，不依赖 ~/.zshenv 中的 ZDOTDIR。
[[ -r "$ZSH_CONFIG_DIR/paths.zsh" ]] && source "$ZSH_CONFIG_DIR/paths.zsh"

# Editor and application environment.
if (( $+commands[nvim] )); then
  export EDITOR=nvim
  export VISUAL=nvim
else
  export EDITOR=vi
  export VISUAL=vi
fi
export LUA_PATH="$HOME/.config/nvim/?.lua;;"

# History: preserve the existing history file, share it, and deduplicate it.
HISTFILE="$HOME/.zsh_history"
HISTSIZE=50000
SAVEHIST=20000
setopt EXTENDED_HISTORY
setopt SHARE_HISTORY
setopt HIST_EXPIRE_DUPS_FIRST
setopt HIST_FIND_NO_DUPS
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_IGNORE_SPACE
setopt HIST_REDUCE_BLANKS
setopt HIST_SAVE_NO_DUPS

# Useful native Zsh behavior.
setopt AUTO_CD
setopt AUTO_PUSHD
setopt PUSHD_IGNORE_DUPS
setopt PUSHD_SILENT
setopt INTERACTIVE_COMMENTS
setopt NO_BEEP

# Completion styles must be configured before compinit and fzf-tab.
zstyle ':completion:*' use-cache on
zstyle ':completion:*' cache-path "$ZSH_CACHE_DIR/completion"
zstyle ':completion:*' group-name ''
zstyle ':completion:*:descriptions' format '[%d]'
zstyle ':completion:*' menu no
zstyle ':completion:*' matcher-list \
  'm:{a-zA-Z}={A-Za-z}' \
  'r:|[._-]=* r:|=*'
[[ -n ${LS_COLORS:-} ]] && zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"

# Rebuild the completion security audit daily; use the cache otherwise.
autoload -Uz compinit
typeset -a _rift_old_compdump
typeset -g _RIFT_COMPDUMP="$ZSH_CACHE_DIR/zcompdump-$ZSH_VERSION"
_rift_old_compdump=("$_RIFT_COMPDUMP"(N.mh+24))
if [[ ! -s $_RIFT_COMPDUMP || ${#_rift_old_compdump} -gt 0 ]]; then
  compinit -d "$_RIFT_COMPDUMP"
else
  compinit -C -d "$_RIFT_COMPDUMP"
fi
unset _rift_old_compdump

# fzf shell integration. Recent releases expose `fzf --zsh`; older distro
# packages are supported through their installed integration scripts.
if (( $+commands[fzf] )) && [[ -t 0 && -t 1 ]]; then
  export FZF_DEFAULT_OPTS="${FZF_DEFAULT_OPTS:---height=45% --layout=reverse --border}"

  if fzf --zsh </dev/null >/dev/null 2>&1; then
    source <(fzf --zsh)
  else
    typeset _rift_fzf_prefix="${commands[fzf]:A:h:h}"
    typeset -a _rift_fzf_key_files _rift_fzf_completion_files
    _rift_fzf_key_files=(
      "$_rift_fzf_prefix/share/fzf/key-bindings.zsh"
      /usr/share/doc/fzf/examples/key-bindings.zsh
      /usr/share/fzf/key-bindings.zsh
    )
    _rift_fzf_completion_files=(
      "$_rift_fzf_prefix/share/fzf/completion.zsh"
      /usr/share/doc/fzf/examples/completion.zsh
      /usr/share/fzf/completion.zsh
    )

    for _rift_file in "${_rift_fzf_key_files[@]}"; do
      [[ -r $_rift_file ]] && { source "$_rift_file"; break; }
    done
    for _rift_file in "${_rift_fzf_completion_files[@]}"; do
      [[ -r $_rift_file ]] && { source "$_rift_file"; break; }
    done
    unset _rift_file _rift_fzf_prefix _rift_fzf_key_files _rift_fzf_completion_files
  fi
fi

# Antidote discovery covers Homebrew, distro packages, and a user-local clone.
# No network access occurs here after installation.
zstyle ':antidote:bundle' file "$ZSH_CONFIG_DIR/.zsh_plugins.txt"
zstyle ':antidote:static' file "$ZSH_CACHE_DIR/plugins.zsh"
zstyle ':antidote:bundle' use-friendly-names yes

typeset -a _rift_antidote_candidates
[[ -n ${ANTIDOTE_ZSH:-} ]] && _rift_antidote_candidates+=("$ANTIDOTE_ZSH")
for _rift_prefix in ${HOMEBREW_PREFIX:-} /opt/homebrew /usr/local; do
  _rift_antidote_candidates+=("$_rift_prefix/opt/antidote/share/antidote/antidote.zsh")
done
_rift_antidote_candidates+=(
  /usr/share/zsh-antidote/antidote.zsh
  /usr/share/antidote/antidote.zsh
  "${XDG_DATA_HOME:-$HOME/.local/share}/zsh/antidote/antidote.zsh"
)

typeset _rift_antidote_loaded=false
for _rift_file in "${_rift_antidote_candidates[@]}"; do
  if [[ -r $_rift_file ]]; then
    source "$_rift_file"
    antidote load
    _rift_antidote_loaded=true
    break
  fi
done
if [[ $_rift_antidote_loaded == false ]]; then
  print -u2 'zsh: Antidote not found; third-party plugins are disabled. See the package list at the top of ~/.config/zsh/.zshrc.'
fi
unset _rift_antidote_candidates _rift_antidote_loaded _rift_prefix _rift_file

# fzf-tab presentation. It uses Zsh's normal completion results.
zstyle ':fzf-tab:*' switch-group '<' '>'
zstyle ':fzf-tab:complete:cd:*' fzf-preview 'command ls -la -- $realpath 2>/dev/null'

# Predictable Emacs-style editing plus prefix-aware history search.
bindkey -e
autoload -Uz up-line-or-beginning-search down-line-or-beginning-search
zle -N up-line-or-beginning-search
zle -N down-line-or-beginning-search
bindkey '^[[A' up-line-or-beginning-search
bindkey '^[[B' down-line-or-beginning-search
bindkey '^P' up-line-or-beginning-search

# Preserve the old Ctrl-N behavior when autosuggestions is available.
if (( ${+widgets[autosuggest-accept]} )); then
  bindkey '^N' autosuggest-accept
else
  bindkey '^N' down-line-or-beginning-search
fi

zmodload -F zsh/terminfo +p:terminfo 2>/dev/null || true
[[ -n ${terminfo[khome]:-} ]] && bindkey "${terminfo[khome]}" beginning-of-line
[[ -n ${terminfo[kend]:-} ]] && bindkey "${terminfo[kend]}" end-of-line
[[ -n ${terminfo[kdch1]:-} ]] && bindkey "${terminfo[kdch1]}" delete-char
bindkey '^[[1;5C' forward-word
bindkey '^[[1;5D' backward-word

# Conda is expensive to initialize, so load its hook on the first `conda`
# command. Starship alone renders the active environment to avoid duplicate
# `(base)` and `conda base` prompt segments.
export CONDA_CHANGEPS1=false
typeset -g _RIFT_CONDA_EXE=''
for _rift_file in \
  "${CONDA_EXE:-}" \
  "$HOME/miniconda3/bin/conda" \
  "$HOME/anaconda3/bin/conda" \
  /opt/miniconda3/bin/conda \
  /opt/anaconda3/bin/conda; do
  if [[ -n $_rift_file && -x $_rift_file ]]; then
    _RIFT_CONDA_EXE="$_rift_file"
    break
  fi
done
unset _rift_file

if [[ -n $_RIFT_CONDA_EXE ]]; then
  function conda() {
    local -a _rift_conda_args=("$@")
    local _rift_conda_hook
    _rift_conda_hook="$("$_RIFT_CONDA_EXE" shell.zsh hook 2>/dev/null)" || {
      print -u2 "zsh: unable to initialize Conda from $_RIFT_CONDA_EXE"
      return 1
    }
    unfunction conda
    eval "$_rift_conda_hook"
    conda "${_rift_conda_args[@]}"
  }
fi

# Proxy helpers replace the old always-on global proxy.
function proxy_on() {
  local host="${1:-127.0.0.1}"
  local port="${2:-7897}"
  export http_proxy="http://$host:$port"
  export https_proxy="$http_proxy"
  export all_proxy="socks5://$host:$port"
  export HTTP_PROXY="$http_proxy"
  export HTTPS_PROXY="$https_proxy"
  export ALL_PROXY="$all_proxy"
  export no_proxy='localhost,127.0.0.1,::1'
  export NO_PROXY="$no_proxy"
  print "Proxy enabled: $http_proxy"
}

function proxy_off() {
  unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY no_proxy NO_PROXY
  print 'Proxy disabled'
}

function proxy_status() {
  if [[ -n ${http_proxy:-} ]]; then
    print "Proxy enabled: $http_proxy"
  else
    print 'Proxy disabled'
  fi
}

# zoxide replaces zsh-z while keeping the familiar `z <name>` command.
if (( $+commands[zoxide] )); then
  eval "$(zoxide init zsh)"
fi

# Starship replaces the prompt's per-render `git | xargs` subprocess pipeline.
export STARSHIP_CONFIG="$ZSH_CONFIG_DIR/starship.toml"
if (( $+commands[starship] )) && [[ -o zle && -t 0 && -t 1 ]]; then
  eval "$(starship init zsh)"
else
  PROMPT='%F{green}%n%f|%F{yellow}%1~%f %# '
fi
