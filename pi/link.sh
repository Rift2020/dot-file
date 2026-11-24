#!/bin/sh
set -eu

pi_config_source=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
pi_config_target=${PI_CODING_AGENT_DIR:-"$HOME/.pi/agent"}
# Settings files are merged into local writable copies; the rest are symlinked.
pi_config_merged="settings.json web-search.json models.json claude-bridge.json"
pi_config_linked="AGENTS.md extensions/base-prompt.ts extensions/prompt-export.ts extensions/recap.ts extensions/paste-image.ts extensions/turn-time.ts extensions/idle-notify.ts extensions/subagent.ts skills/external-agents/SKILL.md skills/external-agents/claude-progress.py"
# The HTML page skill drives a separate checkout (see README); link it only on machines that have one.
pi_html_tool=$HOME/.local/share/answer-me-with-html/skills/answer-me-with-html/scripts/am.mjs
if [ -f "$pi_html_tool" ]; then
  pi_config_linked="$pi_config_linked skills/html-page/SKILL.md"
else
  printf 'Not installed, html-page skill left out: %s\n' "$pi_html_tool"
fi

# Preflight all destinations before changing any configuration files.
command -v node >/dev/null 2>&1 || {
  printf 'Node.js is required to merge Pi settings.\n' >&2
  exit 1
}
for pi_config_item in $pi_config_merged $pi_config_linked apply-settings.mjs patches/statusline-today-cost.patch; do
  if [ ! -f "$pi_config_source/$pi_config_item" ]; then
    printf 'Missing source: %s\n' "$pi_config_source/$pi_config_item" >&2
    exit 1
  fi
done
# Every folder a link goes into must be a folder or not exist yet.
for pi_config_item in $pi_config_linked; do
  pi_config_dir=$(dirname -- "$pi_config_target/$pi_config_item")
  while [ "$pi_config_dir" != "$pi_config_target" ]; do
    if [ -e "$pi_config_dir" ] && [ ! -d "$pi_config_dir" ]; then
      printf 'Existing path left untouched: %s\n' "$pi_config_dir" >&2
      exit 1
    fi
    pi_config_dir=$(dirname -- "$pi_config_dir")
  done
done
for pi_config_item in $pi_config_merged $pi_config_linked; do
  pi_config_from=$pi_config_source/$pi_config_item
  pi_config_to=$pi_config_target/$pi_config_item
  if [ -L "$pi_config_to" ] && [ "$(readlink "$pi_config_to")" = "$pi_config_from" ]; then
    continue
  fi
  case " $pi_config_merged " in
    *" $pi_config_item "*)
      if [ -f "$pi_config_to" ] && [ ! -L "$pi_config_to" ]; then
        continue
      fi
      ;;
  esac
  if [ -e "$pi_config_to" ] || [ -L "$pi_config_to" ]; then
    printf 'Existing path left untouched: %s\n' "$pi_config_to" >&2
    exit 1
  fi
done

set --
for pi_config_item in $pi_config_merged; do
  set -- "$@" "$pi_config_source/$pi_config_item" "$pi_config_target/$pi_config_item"
done
node "$pi_config_source/apply-settings.mjs" "$@"
for pi_config_item in $pi_config_linked; do
  pi_config_to=$pi_config_target/$pi_config_item
  mkdir -p "$(dirname -- "$pi_config_to")"
  if [ ! -L "$pi_config_to" ]; then
    ln -s "$pi_config_source/$pi_config_item" "$pi_config_to"
  fi
  printf 'Linked: %s\n' "$pi_config_to"
done

# Local fix to the pinned statusline package until upstream ships it (see README).
# Pi installs packages on its own, so run this script again after `pi install`.
pi_package=$pi_config_target/npm/node_modules/@reedchan/statusline
pi_patch=$pi_config_source/patches/statusline-today-cost.patch
if [ ! -d "$pi_package" ]; then
  printf 'Not installed yet; run link.sh again after pi install: %s\n' "$pi_package"
elif ! command -v patch >/dev/null 2>&1; then
  printf 'patch(1) is missing; statusline left unpatched\n' >&2
elif patch -d "$pi_package" -p1 -R -s -f --dry-run < "$pi_patch" >/dev/null 2>&1; then
  printf 'Already patched: %s\n' "$pi_package"
elif patch -d "$pi_package" -p1 -s -f --dry-run < "$pi_patch" >/dev/null 2>&1; then
  patch -d "$pi_package" -p1 -s -f < "$pi_patch"
  printf 'Patched: %s\n' "$pi_package"
else
  printf 'Patch no longer applies; check whether upstream fixed it: %s\n' "$pi_patch" >&2
fi
