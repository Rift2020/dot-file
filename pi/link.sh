#!/bin/sh
set -eu

pi_config_source=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
pi_config_target=${PI_CODING_AGENT_DIR:-"$HOME/.pi/agent"}

# Preflight all destinations before creating any links.
for pi_config_item in settings.json AGENTS.md; do
  pi_config_from=$pi_config_source/$pi_config_item
  pi_config_to=$pi_config_target/$pi_config_item
  if [ ! -e "$pi_config_from" ]; then
    printf 'Missing source: %s\n' "$pi_config_from" >&2
    exit 1
  fi
  if [ -L "$pi_config_to" ] && [ "$(readlink "$pi_config_to")" = "$pi_config_from" ]; then
    continue
  fi
  if [ -e "$pi_config_to" ] || [ -L "$pi_config_to" ]; then
    printf 'Existing path left untouched: %s\n' "$pi_config_to" >&2
    exit 1
  fi
done

mkdir -p "$pi_config_target"
for pi_config_item in settings.json AGENTS.md; do
  pi_config_to=$pi_config_target/$pi_config_item
  if [ ! -L "$pi_config_to" ]; then
    ln -s "$pi_config_source/$pi_config_item" "$pi_config_to"
  fi
  printf 'Linked: %s\n' "$pi_config_to"
done
