# Her Little Pinterest

A static aesthetic website with Supabase-backed photos and notes. The GitHub repo stores only code and the generated hero background. Personal photos live in Supabase Storage.

## What It Does

- Public page: Pinterest-style moodboard, flower gallery, compliment cards, and scrapbook notes.
- Admin page: email magic-link login, photo upload, title/note/flower/vibe fields.
- Backend: Supabase database + storage. No custom server required.

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
