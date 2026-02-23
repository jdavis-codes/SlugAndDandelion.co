# Slug & Dandelion Enterprises LTD

Intentionally terrible 90s-corporate static website with an RSVP portal.

## What this includes

- `index.html`: fake 90s corporate front page
- `portal.html`: RSVP + attendee list + guestbook comments
- `js/rsvp.js`: Supabase-powered insert/read logic
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

## 4) Deploy for free fast

### Option A: Cloudflare Pages (recommended)

1. **GitHub Setup**:
   - Create a new GitHub repository.
   - Run these commands in your project folder:
     ```bash
     git init
     git add .
     git commit -m "Initial commit"
     git branch -M main
     git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
     git push -u origin main
     ```
   - Note: `js/config.js` is ignored so your secrets won't be uploaded.

2. **Cloudflare Pages Setup**:
   - In Cloudflare Dashboard > Pages > **Create project** > Connect to Git.
   - Select your new repository.
   - **Build settings**:
     - **Build command**: `./build.sh`
     - **Build output directory**: `.` (leave as root)
   - **Environment variables** (crucial step!):
     - Add variable `SUPABASE_URL` with your project URL.
     - Add variable `SUPABASE_ANON_KEY` with your anon key.
   - Click **Save and Deploy**.

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
