#!/usr/bin/env node
/**
 * prepare-photos.mjs — turn a folder of originals into web-ready uploads.
 *
 *   node scripts/prepare-photos.mjs
 *
 * Reads   incoming/   (your originals — never committed, see .gitignore)
 * Writes  outgoing/   (resized WebP + manifest.json)
 *
 * Phone photos are 3-8 MB each and Supabase's free tier is 1 GB, so every
 * image is capped at 1600px on its long edge and re-encoded to WebP. EXIF is
 * stripped, which also removes embedded GPS coordinates.
 *
 * Existing captions in outgoing/manifest.json are preserved on re-runs, so
 * you can safely run this again after adding more photos.
 *
 * No npm dependencies. Uses ImageMagick (`magick`), plus `sips` on macOS to
 * decode HEIC, which ImageMagick here was not built to read.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const IN = path.join(ROOT, "incoming");
const OUT = path.join(ROOT, "outgoing");
const MANIFEST = path.join(OUT, "manifest.json");

const MAX_EDGE = 1600;
const QUALITY = 82;
const EXT = /\.(jpe?g|png|webp|heic|heif|tiff?|bmp)$/i;

const FLOWERS = ["Tulip", "Daisy", "Peony", "Rose", "Lily"];
const VIBES = ["soft", "iconic", "sunshine", "pretty chaos", "quietly special"];

function have(cmd) {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function slugify(name) {
  return (
    path
      .basename(name, path.extname(name))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "photo"
  );
}

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

if (!have("magick")) {
  fail("ImageMagick not found. Install it with:  brew install imagemagick");
}

if (!fs.existsSync(IN)) {
  fs.mkdirSync(IN, { recursive: true });
  fail(`Created ${path.relative(ROOT, IN)}/ — put your photos in it and re-run.`);
}

const files = fs
  .readdirSync(IN)
  .filter((f) => EXT.test(f) && !f.startsWith("."))
  .sort();

if (!files.length) {
  fail(`No images found in ${path.relative(ROOT, IN)}/`);
}

fs.mkdirSync(OUT, { recursive: true });

// Keep any captions that were already written for these files.
let previous = [];
if (fs.existsSync(MANIFEST)) {
  try {
    previous = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  } catch {
    console.warn("  manifest.json was unreadable; starting a fresh one.");
  }
}
const bySource = new Map(previous.map((entry) => [entry.source, entry]));

console.log(`\n  Preparing ${files.length} image(s)…\n`);

const manifest = [];
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hlp-"));
let totalIn = 0;
let totalOut = 0;

// Output names are derived from the source name alone — no index prefix.
// Numbering them would renumber every later file whenever one is added,
// leaving stale copies behind in outgoing/ and shuffling display_order.
// Ordering lives in the manifest instead, where it belongs.
const usedNames = new Set();
let nextOrder =
  previous.reduce((max, e) => Math.max(max, e.display_order || 0), 0) + 1;

files.forEach((file, index) => {
  const src = path.join(IN, file);

  let slug = slugify(file);
  if (usedNames.has(slug)) {
    let n = 2;
    while (usedNames.has(`${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }
  usedNames.add(slug);

  const outName = `${slug}.webp`;
  const dest = path.join(OUT, outName);

  let decoded = src;
  if (/\.hei[cf]$/i.test(file)) {
    if (!have("sips")) {
      console.log(`  ✗ ${file} — HEIC needs macOS \`sips\`; skipped`);
      return;
    }
    decoded = path.join(tmpDir, `${slug}.jpg`);
    execFileSync("sips", ["-s", "format", "jpeg", src, "--out", decoded], {
      stdio: "ignore",
    });
  }

  try {
    execFileSync("magick", [
      decoded,
      "-auto-orient", // honour EXIF rotation before stripping it
      "-resize",
      `${MAX_EDGE}x${MAX_EDGE}>`, // ">" means shrink only, never upscale
      "-strip", // drops EXIF, including GPS
      "-quality",
      String(QUALITY),
      dest,
    ]);
  } catch {
    console.log(`  ✗ ${file} — could not be converted; skipped`);
    return;
  }

  const inKb = fs.statSync(src).size / 1024;
  const outKb = fs.statSync(dest).size / 1024;
  totalIn += inKb;
  totalOut += outKb;

  const kept = bySource.get(file);
  manifest.push({
    source: file,
    file: outName,
    // Captions are filled in separately, then read by import-photos.mjs.
    title: kept?.title ?? "",
    note: kept?.note ?? "",
    poem: kept?.poem ?? "",
    flower: kept?.flower ?? FLOWERS[index % FLOWERS.length],
    vibe: kept?.vibe ?? VIBES[index % VIBES.length],
    is_featured: kept?.is_featured ?? index === 0,
    // new photos go to the end rather than colliding with existing orders
    display_order: kept?.display_order ?? nextOrder++,
    uploaded: kept?.uploaded ?? false,
  });

  console.log(
    `  ✓ ${file.padEnd(34).slice(0, 34)} ${inKb.toFixed(0).padStart(6)} KB → ` +
      `${outKb.toFixed(0).padStart(5)} KB  ${outName}`
  );
});

fs.rmSync(tmpDir, { recursive: true, force: true });
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

const saved = totalIn ? (1 - totalOut / totalIn) * 100 : 0;
console.log(
  `\n  ${manifest.length} ready · ${(totalIn / 1024).toFixed(1)} MB → ` +
    `${(totalOut / 1024).toFixed(1)} MB (${saved.toFixed(0)}% smaller)`
);
console.log(`  manifest: ${path.relative(ROOT, MANIFEST)}`);

const blank = manifest.filter((m) => !m.title || !m.note).length;
if (blank) {
  console.log(
    `\n  ${blank} entr${blank === 1 ? "y still needs" : "ies still need"} ` +
      `a title and note before importing.`
  );
}
console.log("");
