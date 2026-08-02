/* ==========================================================================
   Her Little Pinterest — content layer
   Builds every card with createElement/textContent. Nothing from Supabase is
   ever interpolated into innerHTML.
   ========================================================================== */

const config = window.HLP_CONFIG || {};
const isConfigured =
  config.SUPABASE_URL &&
  config.SUPABASE_ANON_KEY &&
  !config.SUPABASE_URL.includes("PASTE_");

const FALLBACK_IMAGE = "./assets/hero-768.webp";

/* -- content ------------------------------------------------------------- */

const demoMemories = [
  {
    title: "main character energy",
    note: "Some photos do not need context. This is one of them.",
    flower: "Tulip",
    vibe: "iconic",
    poem: "green everywhere,\nand somehow the eye\nstill knows where to go.",
    imageUrl: FALLBACK_IMAGE,
    is_featured: true,
  },
  {
    title: "soft moment, saved",
    note: "This belongs in the nice corner of the internet.",
    flower: "Daisy",
    vibe: "soft",
    imageUrl: FALLBACK_IMAGE,
  },
  {
    title: "quietly special",
    note: "You have a way of making ordinary things feel better.",
    flower: "Peony",
    vibe: "sunshine",
    imageUrl: FALLBACK_IMAGE,
  },
];

const staticCompliments = [
  ["your vibe", "You make conversations feel easy."],
  ["your smile", "It has very unfair screenshot potential."],
  ["your chaos", "Fun to annoy. Respectfully."],
  ["your kindness", "You notice little things, and that matters."],
  ["your photos", "Some pictures just deserve their own page."],
  ["your presence", "Some people feel nice to have around. You do."],
];

const flowerNotes = {
  Tulip: "soft, but impossible to ignore",
  Daisy: "you make simple things feel nicer",
  Peony: "dramatic in the prettiest way",
  Rose: "classic, warm, and a little dangerous",
  Lily: "quietly graceful without trying",
};

/* Petal / core colours per flower. Lily's violet ties back to the
   cherry-blossom reference without pulling the palette off-key. */
const flowerPalette = {
  Tulip: ["#e4788f", "#c9a227"],
  Daisy: ["#f7ead9", "#c9a227"],
  Peony: ["#f0a8b4", "#d9788d"],
  Rose: ["#c9455f", "#e5c97a"],
  Lily: ["#c9a9e0", "#e5c97a"],
};

const noteCards = [
  { kicker: "tiny note", body: "made this because some people deserve prettier corners" },
  { kicker: "saved", body: "for the days that need something soft" },
  { kicker: "mood", body: "Pinterest would understand" },
];

/* -- elements ------------------------------------------------------------ */

const moodboardGrid = document.getElementById("moodboard-grid");
const flowerGrid = document.getElementById("flower-grid");
const complimentGrid = document.getElementById("compliment-grid");
const scrapbookGrid = document.getElementById("scrapbook-grid");
const dialog = document.getElementById("memory-dialog");

/* -- helpers ------------------------------------------------------------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function reveal(node, delay) {
  node.setAttribute("data-reveal", "");
  if (delay) node.style.setProperty("--reveal-d", delay + "ms");
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/* -- data ---------------------------------------------------------------- */

function createClient() {
  if (!isConfigured || !window.supabase) return null;
  return window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
}

function imageUrlFor(client, path) {
  if (!client || !path) return FALLBACK_IMAGE;
  const { data } = client.storage.from(config.PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function loadMemories() {
  const client = createClient();
  if (!client) return demoMemories;

  try {
    const { data, error } = await client
      .from("memories")
      .select("*")
      .eq("is_published", true)
      .order("is_featured", { ascending: false })
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error || !data?.length) {
      console.warn("Using demo memories.", error);
      return demoMemories;
    }

    return data.map((memory) => ({
      ...memory,
      imageUrl: imageUrlFor(client, memory.image_path),
    }));
  } catch (err) {
    console.warn("Memory fetch failed, using demo memories.", err);
    return demoMemories;
  }
}

/* -- dialog -------------------------------------------------------------- */

function openMemory(memory) {
  const image = document.getElementById("dialog-image");
  image.src = memory.imageUrl || FALLBACK_IMAGE;
  image.alt = memory.title || "";
  document.getElementById("dialog-vibe").textContent = memory.vibe || "saved moment";
  document.getElementById("dialog-title").textContent = memory.title || "";
  document.getElementById("dialog-note").textContent = memory.note || "";

  // Poem is optional — the column may not exist yet on older databases.
  const poem = document.getElementById("dialog-poem");
  const verse = (memory.poem || "").trim();
  poem.textContent = verse;
  poem.hidden = !verse;

  dialog.classList.remove("is-closing");
  dialog.showModal();
  // Native <dialog> traps focus and restores it on close; just place it well.
  dialog.querySelector(".dialog-close").focus({ preventScroll: true });
}

function closeMemory() {
  if (!dialog.open || dialog.classList.contains("is-closing")) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    dialog.close();
    return;
  }

  dialog.classList.add("is-closing");
  const done = () => {
    dialog.classList.remove("is-closing");
    dialog.close();
  };
  dialog.addEventListener("animationend", done, { once: true });
  // Guard against the animation never firing.
  setTimeout(() => {
    if (dialog.classList.contains("is-closing")) done();
  }, 400);
}

function wireDialog() {
  dialog.querySelector(".dialog-close").addEventListener("click", closeMemory);

  // Click on the backdrop (the dialog element itself, outside .dialog-inner).
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeMemory();
  });

  // Esc: intercept so the close animation can play.
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeMemory();
  });

  // Swipe down to dismiss the mobile sheet.
  const sheet = dialog.querySelector(".dialog-inner");
  let startY = null;

  sheet.addEventListener(
    "touchstart",
    (event) => {
      startY = sheet.scrollTop <= 0 ? event.touches[0].clientY : null;
    },
    { passive: true }
  );

  sheet.addEventListener(
    "touchmove",
    (event) => {
      if (startY === null) return;
      const dy = event.touches[0].clientY - startY;
      if (dy > 80) {
        startY = null;
        closeMemory();
      }
    },
    { passive: true }
  );

  sheet.addEventListener("touchend", () => {
    startY = null;
  });
}

/* -- moodboard ----------------------------------------------------------- */

/* Photos and notes alternate deliberately: a note every third photo, rather
   than the alphabetical sort the old build used. */
function interleave(photos, notes) {
  const out = [];
  let n = 0;
  photos.forEach((photo, index) => {
    out.push({ kind: "photo", data: photo });
    if ((index + 1) % 3 === 0 && n < notes.length) {
      out.push({ kind: "note", data: notes[n++] });
    }
  });
  while (n < notes.length) out.push({ kind: "note", data: notes[n++] });
  return out;
}

const PIN_RATIOS = ["4 / 5", "1 / 1", "3 / 4", "4 / 5", "5 / 6"];

function buildPhotoPin(memory, index) {
  const card = el("button", "pin pin-photo");
  card.type = "button";

  const media = el("div", "pin-media");
  media.style.aspectRatio = PIN_RATIOS[index % PIN_RATIOS.length];

  const img = el("img");
  img.src = memory.imageUrl || FALLBACK_IMAGE;
  img.alt = memory.title || "Saved photo";
  img.loading = "lazy";
  img.decoding = "async";
  img.addEventListener("error", () => {
    img.src = FALLBACK_IMAGE;
  });
  media.appendChild(img);

  const caption = el("div", "pin-caption");
  caption.appendChild(el("span", "vibe", memory.vibe || "pretty moment"));
  caption.appendChild(el("span", "title", memory.title || "untitled"));

  card.append(media, caption);
  card.setAttribute(
    "aria-label",
    `Open "${memory.title || "saved moment"}"`
  );
  card.addEventListener("click", () => openMemory(memory));
  return card;
}

function buildNotePin(note) {
  // Non-interactive: these have no detail view, so they are not buttons.
  const card = el("article", "pin pin-note");
  card.appendChild(el("span", "kicker", note.kicker));
  card.appendChild(el("p", "body", note.body));
  return card;
}

function renderMoodboard(memories) {
  clear(moodboardGrid);
  moodboardGrid.setAttribute("aria-busy", "false");

  const items = interleave(memories, noteCards);

  if (!items.length) {
    moodboardGrid.appendChild(
      el("p", "empty-state", "The board is empty for now. Add something in the private editor.")
    );
    return;
  }

  items.forEach((item, index) => {
    const node =
      item.kind === "photo"
        ? buildPhotoPin(item.data, index)
        : buildNotePin(item.data);
    moodboardGrid.appendChild(reveal(node, (index % 3) * 70));
  });
}

/* -- flowers ------------------------------------------------------------- */

const SVG_NS = "http://www.w3.org/2000/svg";

function buildBloom(flower) {
  const [petalColor, coreColor] = flowerPalette[flower] || flowerPalette.Peony;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "flower-bloom");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("aria-hidden", "true");

  [0, 72, 144, 216, 288].forEach((angle) => {
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("transform", `rotate(${angle} 32 32)`);

    const petal = document.createElementNS(SVG_NS, "path");
    petal.setAttribute("class", "petal");
    petal.setAttribute(
      "d",
      "M32 32c-5.4-1.6-8.6-6.6-8.6-11.8 0-5.6 3.4-10.6 8.6-14 5.2 3.4 8.6 8.4 8.6 14 0 5.2-3.2 10.2-8.6 11.8z"
    );
    petal.setAttribute("fill", petalColor);
    petal.setAttribute("fill-opacity", "0.92");

    group.appendChild(petal);
    svg.appendChild(group);
  });

  const core = document.createElementNS(SVG_NS, "circle");
  core.setAttribute("class", "core");
  core.setAttribute("cx", "32");
  core.setAttribute("cy", "32");
  core.setAttribute("r", "6.2");
  core.setAttribute("fill", coreColor);
  svg.appendChild(core);

  return svg;
}

function renderFlowers(memories) {
  clear(flowerGrid);

  Object.entries(flowerNotes).forEach(([flower, note], index) => {
    // Prefer a memory tagged with this flower; fall back only if we have any.
    const matched = memories.find((item) => item.flower === flower);
    const memory =
      matched || (memories.length ? memories[index % memories.length] : null);

    const card = el("button", "flower-card");
    card.type = "button";
    card.setAttribute("role", "listitem");
    card.appendChild(buildBloom(flower));
    card.appendChild(el("span", "name", flower));
    card.appendChild(el("span", "truth", note));

    if (memory) {
      card.setAttribute("aria-label", `${flower}: ${note}. Opens a saved photo.`);
      card.addEventListener("click", () => openMemory(memory));
    } else {
      card.disabled = true;
      card.setAttribute("aria-label", `${flower}: ${note}`);
    }

    // Deliberately NOT [data-reveal]: cards 3-5 sit outside the horizontal
    // carousel on phones, so they would never intersect the viewport and would
    // stay invisible when swiped to. They stagger off their container instead.
    card.style.setProperty("--stagger", `${index * 70}ms`);
    flowerGrid.appendChild(card);
  });
}

/* -- compliments --------------------------------------------------------- */

function renderCompliments() {
  clear(complimentGrid);

  staticCompliments.forEach(([title, note], index) => {
    const card = el("button", "flip");
    card.type = "button";
    card.setAttribute("aria-label", `${title}: ${note}`);

    const inner = el("div", "flip-inner");

    const front = el("div", "flip-face flip-front");
    front.appendChild(el("span", "label", "small evidence"));
    front.appendChild(el("span", "headline", title));
    // Label text comes from CSS so it can match the pointer type.
    front.appendChild(el("span", "turn-hint"));

    const back = el("div", "flip-face flip-back");
    back.appendChild(el("span", "label", title));
    back.appendChild(el("span", "body", note));

    inner.append(front, back);
    card.appendChild(inner);

    card.addEventListener("click", () => {
      card.classList.toggle("is-flipped");
    });

    complimentGrid.appendChild(reveal(card, (index % 3) * 70));
  });
}

/* -- scrapbook ----------------------------------------------------------- */

function renderScrapbook(memories) {
  clear(scrapbookGrid);

  if (!memories.length) {
    scrapbookGrid.appendChild(
      el("p", "empty-state", "No notes saved yet.")
    );
    return;
  }

  memories.slice(0, 8).forEach((memory, index) => {
    const card = el("button", `polaroid tilt-${(index % 4) + 1}`);
    card.type = "button";
    card.setAttribute("aria-label", `Open "${memory.title || "saved moment"}"`);

    const img = el("img");
    img.src = memory.imageUrl || FALLBACK_IMAGE;
    img.alt = memory.title || "Saved photo";
    img.loading = "lazy";
    img.decoding = "async";
    img.width = 400;
    img.height = 500;
    img.addEventListener("error", () => {
      img.src = FALLBACK_IMAGE;
    });

    card.appendChild(img);
    card.appendChild(el("span", "caption", memory.title || "untitled"));
    card.addEventListener("click", () => openMemory(memory));

    scrapbookGrid.appendChild(reveal(card, (index % 4) * 60));
  });
}

/* -- hero medallion ------------------------------------------------------ */

/* The shipped hero art is a border composition — all of its detail sits
   around the edge and the middle is deliberately empty copy-space, so a
   circular centre-crop of it lands on blank paper. Swap in the featured
   photo once the board loads. The static art stays as the first paint so
   the circle is never empty while the network is in flight. */
function setHeroMedallion(memory) {
  const wrap = document.querySelector(".hero-medallion");
  const img = wrap?.querySelector("img");
  if (!wrap || !img || !memory?.imageUrl) return;

  const preload = new Image();
  preload.decoding = "async";
  preload.onload = () => {
    // <source> siblings take priority over img.src, so they have to go.
    wrap.querySelectorAll("picture source").forEach((s) => s.remove());
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.src = memory.imageUrl;
    img.alt = memory.title || "A saved photo";
    wrap.classList.add("has-photo");
  };
  preload.onerror = () => {
    /* keep the paper — better than an empty circle */
  };
  preload.src = memory.imageUrl;
}

/* -- boot ---------------------------------------------------------------- */

wireDialog();

loadMemories()
  .then((memories) => {
    const list = Array.isArray(memories) ? memories : [];
    // Already sorted featured-first, then display_order.
    setHeroMedallion(list.find((m) => m.imageUrl));
    renderMoodboard(list);
    renderFlowers(list);
    renderCompliments();
    renderScrapbook(list);
  })
  .catch((err) => {
    console.error("Render failed.", err);
    renderMoodboard([]);
    renderFlowers([]);
    renderCompliments();
    renderScrapbook([]);
  })
  .finally(() => {
    // Tell the motion layer there are new [data-reveal] nodes to observe.
    document.dispatchEvent(new CustomEvent("hlp:rendered"));
  });
