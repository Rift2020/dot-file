#!/bin/sh
set -eu

pi_config_source=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
pi_config_target=${PI_CODING_AGENT_DIR:-"$HOME/.pi/agent"}

# Preflight all destinations before changing any configuration files.
command -v node >/dev/null 2>&1 || {
  printf 'Node.js is required to merge Pi settings.\n' >&2
  exit 1
}
for pi_config_item in settings.json AGENTS.md web-search.json apply-settings.mjs; do
  if [ ! -f "$pi_config_source/$pi_config_item" ]; then
    printf 'Missing source: %s\n' "$pi_config_source/$pi_config_item" >&2
    exit 1
  fi
done
for pi_config_item in settings.json AGENTS.md web-search.json; do
  pi_config_from=$pi_config_source/$pi_config_item
  pi_config_to=$pi_config_target/$pi_config_item
  if [ -L "$pi_config_to" ] && [ "$(readlink "$pi_config_to")" = "$pi_config_from" ]; then
    continue
  fi
  # settings.json is a local writable file; merge it instead of linking it.
  if [ "$pi_config_item" = settings.json ] && [ -f "$pi_config_to" ] && [ ! -L "$pi_config_to" ]; then
    continue
  fi
  if [ -e "$pi_config_to" ] || [ -L "$pi_config_to" ]; then
    printf 'Existing path left untouched: %s\n' "$pi_config_to" >&2
    exit 1
  fi
done

node "$pi_config_source/apply-settings.mjs" \
  "$pi_config_source/settings.json" "$pi_config_target/settings.json"
for pi_config_item in AGENTS.md web-search.json; do
  pi_config_to=$pi_config_target/$pi_config_item
  if [ ! -L "$pi_config_to" ]; then
    ln -s "$pi_config_source/$pi_config_item" "$pi_config_to"
  fi
  printf 'Linked: %s\n' "$pi_config_to"
done
