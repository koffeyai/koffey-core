#!/usr/bin/env bash
# Thin wrapper for curl|bash convenience. The real logic is in bootstrap.mjs.
set -euo pipefail
DEST="${KOFFEY_DIR:-$PWD/koffey-core}"
BRANCH="${KOFFEY_BRANCH:-main}"
REPO="${REPO_URL:-https://github.com/koffeyai/koffey-core.git}"
[ -d "$DEST/.git" ] || git clone --branch "$BRANCH" --single-branch "$REPO" "$DEST"
exec node "$DEST/scripts/bootstrap.mjs" --in-repo "$@"
