#!/bin/sh
set -eu

pi_config_source=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
pi_config_target=${PI_CODING_AGENT_DIR:-"$HOME/.pi/agent"}
# Settings files are merged into local writable copies; the rest are symlinked.
pi_config_merged="settings.json web-search.json"
pi_config_linked="AGENTS.md extensions/base-prompt.ts extensions/prompt-export.ts extensions/recap.ts extensions/paste-image.ts"

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
if [ -e "$pi_config_target/extensions" ] && [ ! -d "$pi_config_target/extensions" ]; then
  printf 'Existing path left untouched: %s\n' "$pi_config_target/extensions" >&2
  exit 1
fi
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
mkdir -p "$pi_config_target/extensions"
for pi_config_item in $pi_config_linked; do
  pi_config_to=$pi_config_target/$pi_config_item
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
