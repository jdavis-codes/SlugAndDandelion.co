# Slug & Dandelion

A new site every month. Each release lives in its own folder, the old one goes to `/archive/`, and Cloudflare Pages builds everything into `dist/` on deploy.

---

## Repo structure

```
build.sh                        ← one variable to update each month
archive/
  archive.html                  ← public archive gallery
  archive_assets/               ← thumbnails + guestbook PDFs
  2026-03-Slug-&-Dandelion-Enterprises/   ← past sites
    data/                       ← exported JSON from Supabase
supabase/
  schema.sql
  archive_month.sh              ← export + wipe script
2026-05-The-Dark-Council/       ← current month (active site)
  index.html
  styles.css
  assets/
  js/                           ← config.js is generated here at build time
```

---

## Monthly release checklist

### 1 — Export and wipe the old site's data

```bash
cd supabase/
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_KEY=YOUR_SERVICE_ROLE_KEY \
./archive_month.sh \
  --output "../archive/YYYY-MM-Site-Name/data" \
  --truncate \
  rsvps comments site_counter
```

> **Service role key** — Supabase dashboard → Project Settings → API → `service_role`. Never commit it.
> Use `--dry-run` first to preview what will happen.

This exports `rsvps.json`, `comments.json`, `site_counter.json` into the archive folder, then clears the live tables.

---

### 2 — Create the new month's folder

```
YYYY-MM-Your-Site-Name/
  index.html
  styles.css
  assets/
  js/          ← leave empty; config.js is injected at build time
```

---

### 3 — Screenshot the old site and add it to the archive gallery

1. Save the screenshot as `archive/archive_assets/YYYY-MM-Site-Name.png`.
2. Add a card to `archive/archive.html` (copy an existing card block).

---

### 4 — Set passwords for the new site

In the Supabase SQL editor, run:

```sql
select set_auth_password('portal', 'your-new-password');
-- Add more named keys as needed:
select set_auth_password('admin', 'another-password');
```

To check which keys exist (hashes only, never plaintext):

```sql
select name, updated_at from public.auth;
```

The `check_portal_key()` function used by existing portal JS automatically checks the `'portal'` key. For new pages with different passwords, call `check_auth_key('key-name')` instead.

---

### 5 — Point the build at the new month

In `build.sh`, update the one variable at the top:

```bash
CURRENT_MONTH="2026-06-Your-New-Site-Name"
```

Commit and push — Cloudflare picks it up automatically.

---

## Cloudflare Pages settings

| Setting | Value |
|---|---|
| Build command | `bash build.sh` |
| Build output directory | `dist` |
| Root directory | *(repo root)* |
| Environment variables | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |

The build copies the current month's files to `dist/` and also copies `archive/` into `dist/archive/` so the gallery stays accessible at `/archive/archive.html`.

---

## First-time Supabase setup

1. Create a free project at [supabase.com](https://supabase.com).
2. Run `supabase/schema.sql` in the SQL editor.
3. Set the initial portal password:
   ```sql
   select set_auth_password('portal', 'your-password');
   ```
4. Copy **Project URL** and **anon public key** into Cloudflare Pages environment variables as `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

---

## Local dev

```bash
python3 -m http.server 8080
# open http://localhost:8080/2026-05-The-Dark-Council/
```

Config is not injected locally — create `js/config.js` manually from `js/config.example.js` (it's gitignored).
