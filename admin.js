/* ==========================================================================
   Her Little Pinterest — private editor
   ========================================================================== */

const config = window.HLP_CONFIG || {};

const authForm = document.getElementById("auth-form");
const uploadForm = document.getElementById("upload-form");
const statusAuth = document.getElementById("auth-status");
const statusUpload = document.getElementById("upload-status");
const authSubmit = document.getElementById("auth-submit");
const uploadSubmit = document.getElementById("upload-submit");

const dropzone = document.getElementById("dropzone");
const photoInput = document.getElementById("photo");
const dzLabel = document.getElementById("dz-label");
const noteInput = document.getElementById("note");
const noteCount = document.getElementById("note-count");

const isConfigured =
  config.SUPABASE_URL &&
  config.SUPABASE_ANON_KEY &&
  !config.SUPABASE_URL.includes("PASTE_");

/* -- ui helpers ---------------------------------------------------------- */

function setStatus(node, text, state) {
  node.textContent = text;
  if (state) node.dataset.state = state;
  else delete node.dataset.state;
}

function setBusy(button, busy, busyLabel) {
  if (busy) {
    button.dataset.idleLabel = button.dataset.idleLabel || button.textContent;
    button.textContent = busyLabel || button.dataset.idleLabel;
    button.setAttribute("aria-busy", "true");
  } else {
    button.textContent = button.dataset.idleLabel || button.textContent;
    button.removeAttribute("aria-busy");
  }
}

function invalidate(field, isInvalid) {
  if (isInvalid) field.setAttribute("aria-invalid", "true");
  else field.removeAttribute("aria-invalid");
}

/* -- dropzone ------------------------------------------------------------ */

let previewUrl = null;

function showPreview(file) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);

  const existing = dropzone.querySelector("img.preview");
  if (existing) existing.remove();

  if (!file) {
    dzLabel.textContent = "Tap to choose a photo";
    previewUrl = null;
    return;
  }

  previewUrl = URL.createObjectURL(file);
  const img = document.createElement("img");
  img.className = "preview";
  img.src = previewUrl;
  img.alt = "";
  dropzone.insertBefore(img, dzLabel);

  const sizeMb = (file.size / 1024 / 1024).toFixed(1);
  dzLabel.textContent = `${file.name} · ${sizeMb} MB`;
}

if (dropzone && photoInput) {
  photoInput.addEventListener("change", () => {
    invalidate(photoInput, false);
    showPreview(photoInput.files[0] || null);
  });

  ["dragenter", "dragover"].forEach((type) =>
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragging");
    })
  );

  ["dragleave", "drop"].forEach((type) =>
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragging");
    })
  );

  dropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    photoInput.files = transfer.files;
    showPreview(file);
  });
}

if (noteInput && noteCount) {
  const sync = () => {
    noteCount.textContent = String(noteInput.value.length);
  };
  noteInput.addEventListener("input", sync);
  sync();
}

/* -- supabase ------------------------------------------------------------ */

if (!isConfigured) {
  setStatus(
    statusAuth,
    "Add your Supabase URL and anon key in config.js first.",
    "error"
  );
}

const client = isConfigured
  ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY)
  : null;

function setSignedIn(signedIn) {
  uploadForm.classList.toggle("is-disabled", !signedIn);
  uploadForm
    .querySelectorAll("input, textarea, select, button")
    .forEach((field) => {
      field.disabled = !signedIn;
    });
}

async function refreshSession() {
  if (!client) {
    setSignedIn(false);
    return;
  }
  const { data } = await client.auth.getSession();
  setSignedIn(Boolean(data.session));
  if (data.session) {
    setStatus(statusAuth, "You are signed in. Uploads are enabled.", "success");
  }
}

if (client) {
  client.auth.onAuthStateChange((_event, session) => {
    setSignedIn(Boolean(session));
    if (session) {
      setStatus(statusAuth, "You are signed in. Uploads are enabled.", "success");
    }
  });
}

/* -- sign in ------------------------------------------------------------- */

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!client) return;

  const emailField = document.getElementById("email");
  const email = emailField.value.trim();

  if (!email || !emailField.checkValidity()) {
    invalidate(emailField, true);
    emailField.focus();
    setStatus(statusAuth, "Enter a valid email address to continue.", "error");
    return;
  }
  invalidate(emailField, false);

  setBusy(authSubmit, true, "sending…");
  setStatus(statusAuth, "Sending login link…", "busy");

  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
    },
  });

  setBusy(authSubmit, false);
  setStatus(
    statusAuth,
    error ? error.message : "Check your email for the login link, then return here.",
    error ? "error" : "success"
  );
});

/* -- upload -------------------------------------------------------------- */

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!client || uploadForm.classList.contains("is-disabled")) return;

  const titleField = document.getElementById("title");
  const file = photoInput.files[0];
  const title = titleField.value.trim();
  const note = noteInput.value.trim();

  // Validate in visual order and focus the first field that fails.
  const problems = [
    [!file, photoInput, "Choose a photo to upload."],
    [!title, titleField, "Give the card a title."],
    [!note, noteInput, "Add a tiny note."],
  ];

  let blocked = false;
  problems.forEach(([failed, field, message]) => {
    invalidate(field, Boolean(failed));
    if (failed && !blocked) {
      blocked = true;
      field.focus();
      setStatus(statusUpload, message, "error");
    }
  });
  if (blocked) return;

  const flower = document.getElementById("flower").value;
  const vibe = document.getElementById("vibe").value;
  const isFeatured = uploadForm.querySelector('[name="is_featured"]').checked;

  setBusy(uploadSubmit, true, "uploading…");
  setStatus(statusUpload, "Uploading photo…", "busy");

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeName = `${crypto.randomUUID()}.${extension}`;
  const path = `memories/${safeName}`;

  const upload = await client.storage.from(config.PHOTO_BUCKET).upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
  });

  if (upload.error) {
    setBusy(uploadSubmit, false);
    setStatus(statusUpload, upload.error.message, "error");
    return;
  }

  setStatus(statusUpload, "Saving note…", "busy");

  const row = {
    title,
    note,
    flower,
    vibe,
    image_path: path,
    is_featured: isFeatured,
    is_published: true,
  };

  const poem = document.getElementById("poem")?.value.trim();
  if (poem) row.poem = poem;

  let { error } = await client.from("memories").insert(row);

  // The poem column is optional (supabase/002-add-poem.sql). If the database
  // has not been migrated yet, save the rest rather than losing the upload.
  if (error && poem && /poem/i.test(error.message || "")) {
    delete row.poem;
    ({ error } = await client.from("memories").insert(row));
    if (!error) {
      setStatus(
        statusUpload,
        "Added, but the poem was skipped — run supabase/002-add-poem.sql.",
        "error"
      );
      uploadForm.reset();
      showPreview(null);
      if (noteCount) noteCount.textContent = "0";
      setBusy(uploadSubmit, false);
      return;
    }
  }

  setBusy(uploadSubmit, false);

  if (error) {
    setStatus(statusUpload, error.message, "error");
    return;
  }

  uploadForm.reset();
  showPreview(null);
  if (noteCount) noteCount.textContent = "0";
  setStatus(statusUpload, "Added to the board. ✓", "success");
});

refreshSession();
