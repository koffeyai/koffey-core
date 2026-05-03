#!/usr/bin/env bash
# Detect drift between frontend function invocations, backend function
# directories, and supabase/config.toml entries.
#
# Exits 0 if everything is consistent, 1 if drift is detected.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FUNCTIONS_DIR="$ROOT_DIR/supabase/functions"
CONFIG_FILE="$ROOT_DIR/supabase/config.toml"
SRC_DIR="$ROOT_DIR/src"
EXIT_CODE=0

# --- 1. Frontend invokes a function that has no backend directory -----------
echo "Checking frontend → backend function drift..."

frontend_functions=$(
  grep -roh "functions\.invoke(['\"][^'\"]*['\"]" "$SRC_DIR" 2>/dev/null \
    | sed "s/functions\.invoke(['\"]//;s/['\"]$//" \
    | sort -u
)

for fn in $frontend_functions; do
  if [ ! -d "$FUNCTIONS_DIR/$fn" ]; then
    # Allow if the reference is inside a comment block
    if grep -rn "functions\.invoke(['\"]${fn}['\"]" "$SRC_DIR" | grep -qv "^\s*\*\|^\s*//\|/\*"; then
      echo "  DRIFT: src/ invokes '$fn' but supabase/functions/$fn/ does not exist"
      EXIT_CODE=1
    fi
  fi
done

# --- 2. config.toml references a function that has no directory -------------
echo "Checking config.toml → directory drift..."

config_functions=$(
  grep '^\[functions\.' "$CONFIG_FILE" 2>/dev/null \
    | sed 's/\[functions\.//;s/\]//' \
    | sort -u
)

for fn in $config_functions; do
  if [ ! -d "$FUNCTIONS_DIR/$fn" ]; then
    echo "  DRIFT: config.toml declares [functions.$fn] but directory does not exist"
    EXIT_CODE=1
  fi
done

# --- 3. Directory exists but has no config.toml entry ----------------------
echo "Checking directory → config.toml drift..."

for dir in "$FUNCTIONS_DIR"/*/; do
  fn=$(basename "$dir")
  [ "$fn" = "_shared" ] && continue
  if ! grep -q "^\[functions\.${fn}\]" "$CONFIG_FILE" 2>/dev/null; then
    echo "  DRIFT: supabase/functions/$fn/ exists but has no [functions.$fn] in config.toml"
    EXIT_CODE=1
  fi
done

if [ "$EXIT_CODE" -eq 0 ]; then
  echo "No drift detected."
else
  echo ""
  echo "Function drift detected. Fix the mismatches above."
fi

exit "$EXIT_CODE"
