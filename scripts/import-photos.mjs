#!/usr/bin/env node
/**
 * import-photos.mjs — upload outgoing/ to Supabase and add the board rows.
 *
 *   node scripts/import-photos.mjs --dry-run     # show what would happen
 *   node scripts/import-photos.mjs               # actually upload
 *
 * Needs a write-capable credential. Every policy in supabase/schema.sql is
 * gated on is_board_admin(), so the anon key in config.js cannot write —
 * that is deliberate, not a bug.
 *
 * Run it like this so the key stays out of your shell history and off disk:
 *
 *   read -rs "?service key: " KEY && SUPABASE_SERVICE_KEY="$KEY" \
 *     ADMIN_EMAIL=you@example.com node scripts/import-photos.mjs
 *
 * Get the key from: Supabase dashboard → Project Settings → API →
 * service_role. It bypasses every RLS policy, so treat it like a password
 * and rotate it afterwards if you would rather not keep it around.
 *
 * Safe to re-run: entries already marked uploaded in manifest.json are
 * skipped, so a partial failure can be resumed.
 *
 * No npm dependencies — plain fetch against the Supabase REST and Storage
 * endpoints.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "outgoing");
const MANIFEST = path.join(OUT, "manifest.json");

const DRY = process.argv.includes("--dry-run");

function fail(message, hint) {
  console.error(`\n  ${message}`);
  if (hint) {
    // indent every line, not just the first
    hint.split("\n").forEach((line) => console.error(`  ${line}`));
  }
  console.error("");
  process.exit(1);
}

/* -- config -------------------------------------------------------------- */

// Project URL and bucket come from config.js so they cannot drift from the
// site. Only the secret is passed in by hand.
let cfg = {};
try {
  const raw = fs.readFileSync(path.join(ROOT, "config.js"), "utf8");
  const shim = { window: {} };
  new Function("window", raw).call(shim, shim.window);
  cfg = shim.window.HLP_CONFIG || {};
} catch (err) {
  fail("Could not read config.js.", String(err.message));
}

const URL_BASE = (cfg.SUPABASE_URL || "").replace(/\/+$/, "");
const BUCKET = cfg.PHOTO_BUCKET || "her-photos";
const KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

if (!URL_BASE) fail("SUPABASE_URL missing from config.js.");
// The key is checked further down, once we know there is actually work to do.

/* -- manifest ------------------------------------------------------------ */

if (!fs.existsSync(MANIFEST)) {
  fail(
    `No manifest at ${path.relative(ROOT, MANIFEST)}.`,
    "Run:  node scripts/prepare-photos.mjs"
  );
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const pending = manifest.filter((m) => !m.uploaded);

if (!pending.length) {
  console.log("\n  Everything in the manifest is already uploaded.\n");
  process.exit(0);
}

const incomplete = pending.filter((m) => !m.title?.trim() || !m.note?.trim());
if (incomplete.length) {
  fail(
    `${incomplete.length} entr${incomplete.length === 1 ? "y needs" : "ies need"} a title and note:`,
    incomplete.map((m) => `  - ${m.file}`).join("\n")
  );
}

const missing = pending.filter((m) => !fs.existsSync(path.join(OUT, m.file)));
if (missing.length) {
  fail(
    "These files are in the manifest but not in outgoing/:",
    missing.map((m) => `  - ${m.file}`).join("\n")
  );
}

if (!DRY && !KEY) {
  fail(
    "SUPABASE_SERVICE_KEY is not set.",
    'Try:  read -rs "?service key: " KEY && SUPABASE_SERVICE_KEY="$KEY" \\\n' +
      "         ADMIN_EMAIL=you@example.com node scripts/import-photos.mjs"
  );
}

/* -- dry run ------------------------------------------------------------- */

if (DRY) {
  console.log(`\n  Would upload ${pending.length} photo(s) to ${URL_BASE}\n`);
  pending.forEach((m) => {
    const kb = (fs.statSync(path.join(OUT, m.file)).size / 1024).toFixed(0);
    console.log(`  • ${m.title}`);
    console.log(`      file    ${m.file} (${kb} KB)`);
    console.log(`      note    ${m.note}`);
    if (m.poem) console.log(`      poem    ${m.poem.split("\n")[0]} …`);
    console.log(
      `      meta    ${m.flower} · ${m.vibe}` +
        `${m.is_featured ? " · featured" : ""} · order ${m.display_order}\n`
    );
  });
  console.log("  Nothing was written. Re-run without --dry-run to upload.\n");
  process.exit(0);
}

/* -- api ----------------------------------------------------------------- */

const auth = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
};

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...auth, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} — ${body.slice(0, 300)}`);
  }
  return res;
}

/* Rows inserted with the service role would otherwise land with a null
   owner_id, and the update/delete policies require auth.uid() = owner_id.
   Resolving the admin's real user id keeps those photos editable later. */
async function resolveOwnerId(email) {
  if (!email) return null;
  try {
    const res = await api(`${URL_BASE}/auth/v1/admin/users?per_page=200`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.users || [];
    const found = list.find(
      (u) => (u.email || "").toLowerCase() === email.toLowerCase()
    );
    if (!found) {
      console.warn(
        `  ! No Supabase user for ${email} — rows will have no owner and ` +
          `will not be editable from admin.html.`
      );
      return null;
    }
    return found.id;
  } catch (err) {
    console.warn(`  ! Could not look up the admin user: ${err.message}`);
    return null;
  }
}

async function uploadFile(localPath, storagePath) {
  const body = fs.readFileSync(localPath);
  await api(`${URL_BASE}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: "POST",
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "31536000",
      "x-upsert": "false",
    },
    body,
  });
}

async function insertRow(row) {
  const res = await api(`${URL_BASE}/rest/v1/memories`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  return res.json();
}

/* -- run ----------------------------------------------------------------- */

const save = () =>
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

console.log(`\n  Uploading ${pending.length} photo(s) to ${URL_BASE}\n`);

const ownerId = await resolveOwnerId(ADMIN_EMAIL);
let done = 0;
let failed = 0;

for (const entry of pending) {
  const local = path.join(OUT, entry.file);
  const storagePath = `memories/${crypto.randomUUID()}.webp`;

  try {
    await uploadFile(local, storagePath);

    const row = {
      title: entry.title.trim(),
      note: entry.note.trim(),
      flower: entry.flower,
      vibe: entry.vibe,
      image_path: storagePath,
      display_order: entry.display_order ?? 0,
      is_featured: Boolean(entry.is_featured),
      is_published: true,
    };
    if (ownerId) row.owner_id = ownerId;
    // Only send poem if the column exists (supabase/002-add-poem.sql).
    if (entry.poem?.trim()) row.poem = entry.poem.trim();

    try {
      await insertRow(row);
    } catch (err) {
      if (/poem/.test(err.message)) {
        console.warn(
          `    ! poem column missing — run supabase/002-add-poem.sql. ` +
            `Inserting without it.`
        );
        delete row.poem;
        await insertRow(row);
      } else {
        throw err;
      }
    }

    entry.uploaded = true;
    entry.image_path = storagePath;
    save();
    done++;
    console.log(`  ✓ ${entry.title}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${entry.file} — ${err.message}`);
  }
}

console.log(
  `\n  ${done} added${failed ? `, ${failed} failed` : ""}. ` +
    `Reload the site to see them.\n`
);
process.exit(failed ? 1 : 0);
