#!/bin/bash
set -euo pipefail

# ── Update this each month ──────────────────────────────────────────────────
CURRENT_MONTH="2026-05-The-Dark-Council"
# ────────────────────────────────────────────────────────────────────────────

CONFIG_CONTENT="window.SD_CONFIG = {
  supabaseUrl: \"$SUPABASE_URL\",
  supabaseAnonKey: \"$SUPABASE_ANON_KEY\"
};"

# Build a clean dist/
rm -rf dist
mkdir -p dist

# Copy current month's site to root of dist/
cp -r "${CURRENT_MONTH}/." dist/

# Inject config
mkdir -p dist/js
echo "$CONFIG_CONTENT" > dist/js/config.js

# Copy archive so /archive/ stays accessible
if [ -d archive ]; then
  cp -r archive dist/archive
fi

echo "Built dist/ from ${CURRENT_MONTH}"
echo "Done."
