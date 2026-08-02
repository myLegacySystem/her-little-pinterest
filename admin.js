const config = window.HLP_CONFIG || {};
const statusAuth = document.getElementById("auth-status");
const statusUpload = document.getElementById("upload-status");
const uploadForm = document.getElementById("upload-form");
const authForm = document.getElementById("auth-form");

const isConfigured =
  config.SUPABASE_URL &&
  config.SUPABASE_ANON_KEY &&
  !config.SUPABASE_URL.includes("PASTE_");

if (!isConfigured) {
  statusAuth.textContent = "Add your Supabase URL and anon key in config.js first.";
}

const client = isConfigured
  ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY)
  : null;

async function refreshSession() {
  if (!client) return;
  const { data } = await client.auth.getSession();
  uploadForm.classList.toggle("is-disabled", !data.session);
  if (data.session) {
    statusAuth.textContent = "You are signed in. Uploads are enabled.";
  }
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!client) return;

  const email = new FormData(authForm).get("email");
  statusAuth.textContent = "Sending login link...";

  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
    },
  });

  statusAuth.textContent = error
    ? error.message
    : "Check your email for the login link, then return here.";
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!client || uploadForm.classList.contains("is-disabled")) return;

  const form = new FormData(uploadForm);
  const file = form.get("photo");
  const title = form.get("title").trim();
  const note = form.get("note").trim();
  const flower = form.get("flower");
  const vibe = form.get("vibe");
  const isFeatured = form.get("is_featured") === "on";

  if (!file || !title || !note) return;

  statusUpload.textContent = "Uploading photo...";
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeName = `${crypto.randomUUID()}.${extension}`;
  const path = `memories/${safeName}`;

  const upload = await client.storage.from(config.PHOTO_BUCKET).upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
  });

  if (upload.error) {
    statusUpload.textContent = upload.error.message;
    return;
  }

  statusUpload.textContent = "Saving note...";
  const { error } = await client.from("memories").insert({
    title,
    note,
    flower,
    vibe,
    image_path: path,
    is_featured: isFeatured,
    is_published: true,
  });

  if (error) {
    statusUpload.textContent = error.message;
    return;
  }

  uploadForm.reset();
  statusUpload.textContent = "Added to the board.";
});

refreshSession();
