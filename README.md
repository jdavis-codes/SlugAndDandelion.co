# Slug & Dandelion Enterprises LTD

Intentionally terrible 90s-corporate static website with an RSVP portal.

## What this includes

- `index.html`: fake 90s corporate front page
- `portal.html`: RSVP + attendee list + guestbook comments
- `js/rsvp.js`: Supabase-powered insert/read logic
- `js/counter.js`: live Supabase-backed visitor counter for homepage
- `supabase/schema.sql`: tables + policies

## 1) Add your logo files

Place your images in:

- `assets/full_size_logo.svg` (wide logo shown in header)
- `assets/condensed_S&D_logo.svg` (small logo shown in sidebar)

## 2) Set up Supabase (free)

1. Create a free project at Supabase.
2. Open SQL Editor and run `supabase/schema.sql`.
3. In project settings, copy:
   - Project URL
   - anon public key
4. Update `js/config.js`:

```js
window.SD_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY"
};
```

## 3) Test locally

From this folder run:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Existing projects: apply counter migration

If your Supabase project was already set up before the visitor counter was added,
run the updated `supabase/schema.sql` again so `site_counter` and its RPC functions
(`increment_site_counter`, `get_site_counter`) are created.

## 4) Deploy for free fast

### Option A: Cloudflare Pages (recommended)

1. Push this folder to a GitHub repo.
2. In Cloudflare Pages: **Create project** → connect GitHub repo.
3. Framework preset: **None**.
4. Build command: *(leave empty)*.
5. Build output directory: `/`.
6. Deploy.

### Connect Porkbun domain

1. In Cloudflare Pages custom domains, add `sluganddandelion.co` and `www.sluganddandelion.co`.
2. Cloudflare will provide DNS targets.
3. In Porkbun DNS, create/update records as Cloudflare shows.
4. Wait for DNS propagation.

### Option B: Netlify

Drag-and-drop deploy this folder, then connect your custom domain in Netlify settings.

## RSVP link location

The RSVP portal is linked as `Company Jamboree` in the homepage sidebar navigation.

A tiny footer dot also still links to the same portal as a backup shortcut.
