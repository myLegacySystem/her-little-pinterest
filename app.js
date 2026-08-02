const config = window.HLP_CONFIG || {};
const isConfigured =
  config.SUPABASE_URL &&
  config.SUPABASE_ANON_KEY &&
  !config.SUPABASE_URL.includes("PASTE_");

const demoMemories = [
  {
    title: "main character energy",
    note: "Some photos do not need context. This is one of them.",
    flower: "Tulip",
    vibe: "iconic",
    imageUrl: "./assets/scrapbook-hero.png",
    is_featured: true,
  },
  {
    title: "soft moment, saved",
    note: "This belongs in the nice corner of the internet.",
    flower: "Daisy",
    vibe: "soft",
    imageUrl: "./assets/scrapbook-hero.png",
  },
  {
    title: "quietly special",
    note: "You have a way of making ordinary things feel better.",
    flower: "Peony",
    vibe: "sunshine",
    imageUrl: "./assets/scrapbook-hero.png",
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

const moodboardGrid = document.getElementById("moodboard-grid");
const flowerGrid = document.getElementById("flower-grid");
const complimentGrid = document.getElementById("compliment-grid");
const scrapbookGrid = document.getElementById("scrapbook-grid");
const dialog = document.getElementById("memory-dialog");

function createClient() {
  if (!isConfigured || !window.supabase) return null;
  return window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
}

function imageUrlFor(client, path) {
  if (!client || !path) return "./assets/scrapbook-hero.png";
  const { data } = client.storage.from(config.PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function loadMemories() {
  const client = createClient();
  if (!client) return demoMemories;

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
}

function openMemory(memory) {
  document.getElementById("dialog-image").src = memory.imageUrl;
  document.getElementById("dialog-image").alt = memory.title;
  document.getElementById("dialog-vibe").textContent = memory.vibe || "saved moment";
  document.getElementById("dialog-title").textContent = memory.title;
  document.getElementById("dialog-note").textContent = memory.note;
  dialog.showModal();
}

function renderMoodboard(memories) {
  const noteCards = [
    { title: "tiny note", note: "made this because some people deserve prettier corners" },
    { title: "saved", note: "for the days that need something soft" },
    { title: "mood", note: "Pinterest would understand" },
  ];

  moodboardGrid.innerHTML = "";
  const mixedCards = [...memories, ...noteCards].sort((a, b) =>
    (a.title || "").localeCompare(b.title || "")
  );

  mixedCards.forEach((item, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = item.imageUrl
      ? `pin-card photo-pin size-${(index % 3) + 1}`
      : `pin-card text-pin tone-${(index % 4) + 1}`;

    if (item.imageUrl) {
      card.innerHTML = `
        <img src="${item.imageUrl}" alt="${item.title}">
        <span>${item.vibe || "pretty moment"}</span>
        <strong>${item.title}</strong>
      `;
      card.addEventListener("click", () => openMemory(item));
    } else {
      card.innerHTML = `<span>${item.title}</span><strong>${item.note}</strong>`;
    }

    moodboardGrid.appendChild(card);
  });
}

function renderFlowers(memories) {
  const flowers = Object.entries(flowerNotes);
  flowerGrid.innerHTML = "";

  flowers.forEach(([flower, note], index) => {
    const memory = memories.find((item) => item.flower === flower) || memories[index % memories.length];
    const card = document.createElement("button");
    card.type = "button";
    card.className = "flower-card";
    card.innerHTML = `
      <span class="flower-shape" aria-hidden="true"></span>
      <small>${flower}</small>
      <strong>${note}</strong>
    `;
    card.addEventListener("click", () => openMemory(memory));
    flowerGrid.appendChild(card);
  });
}

function renderCompliments() {
  complimentGrid.innerHTML = staticCompliments
    .map(
      ([title, note]) => `
        <article class="flip-card" tabindex="0">
          <div>
            <span>${title}</span>
            <p>${note}</p>
          </div>
        </article>
      `
    )
    .join("");
}

function renderScrapbook(memories) {
  scrapbookGrid.innerHTML = "";

  memories.slice(0, 8).forEach((memory, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `scrap-card rotate-${(index % 4) + 1}`;
    card.innerHTML = `
      <img src="${memory.imageUrl}" alt="${memory.title}">
      <span>${memory.title}</span>
    `;
    card.addEventListener("click", () => openMemory(memory));
    scrapbookGrid.appendChild(card);
  });
}

document.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

loadMemories().then((memories) => {
  renderMoodboard(memories);
  renderFlowers(memories);
  renderCompliments();
  renderScrapbook(memories);
});
