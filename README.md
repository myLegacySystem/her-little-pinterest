# Her Little Pinterest

A static aesthetic website with Supabase-backed photos and notes. The GitHub repo stores only code and the generated hero background. Personal photos live in Supabase Storage.

## What It Does

- Public page: Pinterest-style moodboard, flower gallery, compliment cards, and scrapbook notes.
- Admin page: email magic-link login, photo upload, title/note/flower/vibe fields.
- Backend: Supabase database + storage. No custom server required.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Public page markup |
| `admin.html` | Private editor |
| `styles.css` | Design system + every component. Tokens live in `:root` at the top |
| `app.js` | Data loading and card rendering (public page) |
| `motion.js` | Reveals, parallax, petal canvas, smooth scroll |
| `admin.js` | Auth + upload |
| `docs/inspiration/` | Design reference images. Not used by the site |

There is no build step. Everything is plain HTML/CSS/JS.

## Design System

The visual language is defined entirely by custom properties at the top of
`styles.css` — colour, spacing, radius, elevation, motion, and type scale.
Change a token there and it propagates everywhere. Both pages share the file.

Layout is mobile-first: base styles target phones, and `min-width` queries at
`37.5em / 48em / 64em / 90em` scale up.

`motion.js` is progressive enhancement. Reveal animations are gated behind a
`js` class, so with JavaScript disabled or blocked every section is simply
visible. `prefers-reduced-motion` disables the petal canvas, parallax,
marquee, and smooth scrolling completely.

## Images

The hero ships as pre-generated responsive variants (`assets/hero-*.avif`,
`.webp`, `.jpg` at 768/1280/1672px), served via `<picture>`. A phone downloads
roughly 26 KB instead of the original 2.5 MB PNG.

To regenerate them from a new source image:

```bash
cd assets
for w in 768 1280 1672; do
  magick source.png -resize ${w}x -strip -quality 82 hero-$w.jpg
  cwebp -q 76 -m 6 hero-$w.jpg -o hero-$w.webp
  ffmpeg -y -i hero-$w.jpg -c:v libsvtav1 -crf 32 -pix_fmt yuv420p -f avif hero-$w.avif
done
```

Photos uploaded through the admin page are served straight from Supabase
Storage and are lazy-loaded.

## Bulk Import

For adding many photos at once, instead of one at a time through the admin page.

```bash
# 1. put the originals anywhere ignored by git (incoming/, she/, photos/)
#    then compress them and build a caption manifest
node scripts/prepare-photos.mjs

# 2. fill in title / note / poem for each entry
open outgoing/manifest.json

# 3. check what would happen — writes nothing
node scripts/import-photos.mjs --dry-run

# 4. upload. Keeping the key out of your shell history:
read -rs "?service key: " KEY && SUPABASE_SERVICE_KEY="$KEY" \
  ADMIN_EMAIL=you@example.com node scripts/import-photos.mjs
```

`prepare-photos.mjs` caps every image at 1600px, converts to WebP and strips
EXIF (which also removes GPS coordinates). Expect around 95% smaller. Output
names are derived from the source name, so re-running after adding more photos
leaves existing files and captions untouched.

`import-photos.mjs` needs the **service_role** key from Project Settings → API,
because every policy in `schema.sql` is gated on `is_board_admin()` and the
anon key in `config.js` is deliberately read-only. That key bypasses all RLS —
treat it like a password and rotate it afterwards if you would rather not keep
it around. The script marks each entry `uploaded` in the manifest as it goes,
so a partial failure can simply be re-run.

`ADMIN_EMAIL` is optional but recommended: it sets `owner_id` on the new rows
so they stay editable and deletable from the admin page later.

Neither script has npm dependencies. `prepare` needs ImageMagick
(`brew install imagemagick`).

## Local Run

```bash
python3 -m http.server 5174
```

Then open:

```text
http://localhost:5174
```

Admin page:

```text
http://localhost:5174/admin.html
```

## Supabase Setup

1. Create a new Supabase project.
2. Go to `SQL Editor`.
3. Run the SQL in `supabase/schema.sql`.
4. Add your email as the only admin:

   ```sql
   insert into public.admin_emails (email)
   values ('your-email@example.com');
   ```

5. Go to `Authentication > Providers > Email`.
6. Enable email login / magic links.
7. Go to `Project Settings > API`.
8. Copy:
   - Project URL
   - anon public key
9. Paste them into `config.js`:

   ```js
   window.HLP_CONFIG = {
     SUPABASE_URL: "https://your-project.supabase.co",
     SUPABASE_ANON_KEY: "your-anon-public-key",
     PHOTO_BUCKET: "her-photos",
   };
   ```

The anon key is safe to expose in a frontend. Row Level Security in `schema.sql` protects writes.
Only emails added to `public.admin_emails` can upload photos or create notes.

## Admin Login

Open `/admin.html`, enter your email, and click the magic link Supabase sends. After login, uploads are enabled.

Important: in Supabase, add your deployed site URL under:

```text
Authentication > URL Configuration > Site URL
```

For local testing, also add:

```text
http://localhost:5174/admin.html
```

For Vercel, add your Vercel admin URL after deployment.

## Deploy With Vercel

1. Push this folder to GitHub.
2. Import the repo in Vercel.
3. Framework preset: `Other`.
4. Build command: leave empty.
5. Output directory: leave empty or use `.`.
6. Deploy.

## Deploy With GitHub Pages

Use:

- Source: deploy from branch
- Branch: `main`
- Folder: `/ root`

GitHub Pages sites are public unless your GitHub plan supports private Pages.
