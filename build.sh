#!/bin/bash
set -euo pipefail

# ── Update this each month ──────────────────────────────────────────────────
CURRENT_MONTH="2026-05-The-Dark-Council"
# ────────────────────────────────────────────────────────────────────────────

if [ -n "${CF_PAGES_COMMIT_SHA:-}" ]; then
  ASSET_VERSION="${CF_PAGES_COMMIT_SHA:0:12}"
elif command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  ASSET_VERSION="$(git rev-parse --short=12 HEAD)"
else
  ASSET_VERSION="$(date -u +%Y%m%d%H%M%S)"
fi

CONFIG_CONTENT="window.SD_CONFIG = {
  supabaseUrl: \"$SUPABASE_URL\",
  supabaseAnonKey: \"$SUPABASE_ANON_KEY\"
};"

# Build a clean dist/
rm -rf dist
mkdir -p dist

# Copy current month's site to root of dist/
cp -r "${CURRENT_MONTH}/." dist/

# Replace cache-busting token in HTML with a per-deploy version.
while IFS= read -r -d '' html_file; do
  sed -i.bak "s/__ASSET_VERSION__/${ASSET_VERSION}/g" "$html_file"
  rm "$html_file.bak"
done < <(find dist -type f -name "*.html" -print0)

# Inject config
mkdir -p dist/js
echo "$CONFIG_CONTENT" > dist/js/config.js

# Copy archive so /archive/ stays accessible
if [ -d archive ]; then
  cp -r archive dist/archive
fi

echo "Built dist/ from ${CURRENT_MONTH}"
echo "Asset version: ${ASSET_VERSION}"
echo "Done."
