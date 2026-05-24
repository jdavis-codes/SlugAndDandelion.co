#!/bin/bash
# archive_month.sh — export Supabase tables to JSON and optionally reset them.
#
# Usage:
#   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... ./archive_month.sh [OPTIONS] TABLE [TABLE...]
#
# Options:
#   --output DIR      Directory for JSON exports (default: ./exports/YYYY-MM)
#   --truncate        Delete all rows after export (resets site_counter to 0)
#   --dry-run         Print what would happen without doing anything
#   --help            Show this message
#
# Required env:
#   SUPABASE_URL         Your Supabase project URL
#   SUPABASE_SERVICE_KEY Your Supabase service-role key (bypasses RLS)
#
# Example — export and wipe for a new month:
#   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... ./archive_month.sh \
#     --output ../archive/2026-05-Slug-Dandelion/data \
#     --truncate \
#     rsvps comments site_counter

set -euo pipefail

# ── helpers ────────────────────────────────────────────────────────────────────

usage() {
  awk '/^#!/{next} /^# ──/{exit} /^#/{sub(/^# ?/,""); print}' "$0"
  exit 0
}

info()  { echo "  $*"; }
ok()    { echo "  ✓ $*"; }
err()   { echo "  ✗ $*" >&2; exit 1; }

# ── argument parsing ───────────────────────────────────────────────────────────

OUTPUT_DIR=""
DO_TRUNCATE=false
DRY_RUN=false
TABLES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)   OUTPUT_DIR="$2";  shift 2 ;;
    --truncate) DO_TRUNCATE=true; shift ;;
    --dry-run)  DRY_RUN=true;     shift ;;
    --help|-h)  usage ;;
    -*)         err "Unknown option: $1" ;;
    *)          TABLES+=("$1"); shift ;;
  esac
done

[[ ${#TABLES[@]} -eq 0 ]] && { echo "Error: provide at least one table name."; echo "Run with --help for usage."; exit 1; }

# ── env validation ────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

[[ -z "${SUPABASE_URL:-}" ]] \
  && err "SUPABASE_URL env var is required"
[[ -z "${SUPABASE_SERVICE_KEY:-}" ]] \
  && err "SUPABASE_SERVICE_KEY env var is required (service-role key, not anon key)"

# ── output directory ───────────────────────────────────────────────────────────

if [[ -z "$OUTPUT_DIR" ]]; then
  OUTPUT_DIR="$SCRIPT_DIR/exports/$(date +%Y-%m)"
fi

"$DRY_RUN" || mkdir -p "$OUTPUT_DIR"

# ── summary ────────────────────────────────────────────────────────────────────

echo ""
echo "Supabase URL : ${SUPABASE_URL%%/}"
echo "Output dir   : $OUTPUT_DIR"
echo "Tables       : ${TABLES[*]}"
echo "Truncate     : $DO_TRUNCATE"
"$DRY_RUN" && echo "Mode         : DRY RUN"
echo ""

# ── per-table export + optional reset ─────────────────────────────────────────

for TABLE in "${TABLES[@]}"; do
  echo "── $TABLE"
  OUTFILE="$OUTPUT_DIR/${TABLE}.json"

  # export
  if "$DRY_RUN"; then
    info "GET $SUPABASE_URL/rest/v1/$TABLE?select=*  →  $OUTFILE"
  else
    HTTP_STATUS=$(curl -s -o "$OUTFILE" -w "%{http_code}" \
      -H "apikey: $SUPABASE_SERVICE_KEY" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
      -H "Accept: application/json" \
      "$SUPABASE_URL/rest/v1/$TABLE?select=*")

    [[ "$HTTP_STATUS" != "200" ]] \
      && err "Export failed — HTTP $HTTP_STATUS. Response: $(cat "$OUTFILE")"

    ROW_COUNT=$(python3 -c "import json,sys; d=json.load(open('$OUTFILE')); print(len(d))" 2>/dev/null || echo "?")
    ok "Exported $ROW_COUNT row(s) → $OUTFILE"
  fi

  # optional reset
  if "$DO_TRUNCATE"; then
    if [[ "$TABLE" == "site_counter" ]]; then
      # reset to 0 rather than delete the singleton row
      if "$DRY_RUN"; then
        info "PATCH $SUPABASE_URL/rest/v1/site_counter?id=eq.1  {visitor_count:0}"
      else
        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
          -H "apikey: $SUPABASE_SERVICE_KEY" \
          -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
          -H "Content-Type: application/json" \
          -H "Prefer: return=minimal" \
          -d '{"visitor_count":0}' \
          "$SUPABASE_URL/rest/v1/site_counter?id=eq.1")
        [[ "$HTTP_STATUS" == "204" ]] && ok "Counter reset to 0" || err "Reset failed — HTTP $HTTP_STATUS"
      fi
    else
      if "$DRY_RUN"; then
        info "DELETE $SUPABASE_URL/rest/v1/$TABLE?id=gte.0"
      else
        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
          -H "apikey: $SUPABASE_SERVICE_KEY" \
          -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
          -H "Prefer: return=minimal" \
          "$SUPABASE_URL/rest/v1/$TABLE?id=gte.0")
        [[ "$HTTP_STATUS" == "204" ]] && ok "All rows deleted" || err "Delete failed — HTTP $HTTP_STATUS"
      fi
    fi
  fi

  echo ""
done

echo "Done."
