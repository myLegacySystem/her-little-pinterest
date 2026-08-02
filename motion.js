/* ==========================================================================
   Her Little Pinterest — motion layer
   Deliberately dependency-light. Reveals, parallax and the petal field are
   hand-rolled so the critical path has zero external requests; Lenis is the
   one optional import and it is loaded last, so a CDN failure can never
   block anything above it.
   ========================================================================== */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

/* -- 1. curtain ---------------------------------------------------------- */

function dropCurtain() {
  clearTimeout(window.__hlpFallback);
  const curtain = document.getElementById("curtain");
  if (curtain) curtain.classList.add("is-gone");
}

if (document.readyState === "complete") {
  dropCurtain();
} else {
  window.addEventListener("load", dropCurtain, { once: true });
  // Never let a slow font or image hold the page hostage.
  setTimeout(dropCurtain, 1800);
}

/* -- 2. reveal on scroll ------------------------------------------------- */

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-revealed");
      revealObserver.unobserve(entry.target);
    });
  },
  { threshold: 0.08, rootMargin: "0px 0px -6% 0px" }
);

function observeReveals() {
  document
    .querySelectorAll("[data-reveal]:not(.is-revealed)")
    .forEach((node) => revealObserver.observe(node));
}

observeReveals();

// app.js renders asynchronously, and as a classic script it can finish either
// before or after this deferred module evaluates. Relying on its event alone
// loses the race whenever the data resolves fast (cache hit, offline, demo
// fallback), leaving every generated card stuck at opacity 0. Watching the DOM
// makes insertion order irrelevant.
document.addEventListener("hlp:rendered", observeReveals);

const revealMutations = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches("[data-reveal]") || node.querySelector("[data-reveal]")) {
        observeReveals();
        return;
      }
    }
  }
});

revealMutations.observe(document.body, { childList: true, subtree: true });

/* -- 3. parallax --------------------------------------------------------- */

const parallaxNodes = [];

function registerParallax(selector, factor) {
  const node = document.querySelector(selector);
  if (node) parallaxNodes.push({ node, factor });
}

registerParallax(".hero-stage", 0.16);
registerParallax(".finale-parallax", 0.09);

let parallaxTicking = false;

function updateParallax() {
  parallaxTicking = false;
  if (reduceMotion.matches) return;

  const viewportH = window.innerHeight;

  parallaxNodes.forEach(({ node, factor }) => {
    const rect = node.getBoundingClientRect();
    // Skip anything off-screen — no work, no paint.
    if (rect.bottom < -200 || rect.top > viewportH + 200) return;
    // Progress relative to the element's own centre, so motion is local and
    // bounded rather than growing with total page scroll.
    const centreOffset = rect.top + rect.height / 2 - viewportH / 2;
    node.style.setProperty("--py", `${(-centreOffset * factor).toFixed(2)}px`);
  });
}

function onScroll() {
  if (!parallaxTicking) {
    parallaxTicking = true;
    requestAnimationFrame(updateParallax);
  }
}

window.addEventListener("scroll", onScroll, { passive: true });
window.addEventListener("resize", onScroll, { passive: true });
updateParallax();

/* -- 4. sticky header + active section ----------------------------------- */

const header = document.getElementById("site-header");

if (header) {
  const sentinel = () => {
    header.classList.toggle("is-stuck", window.scrollY > 24);
  };
  window.addEventListener("scroll", sentinel, { passive: true });
  sentinel();
}

const navLinks = Array.from(document.querySelectorAll(".site-nav a"));
const sectionsById = new Map();

navLinks.forEach((link) => {
  const id = link.getAttribute("href").slice(1);
  const section = document.getElementById(id);
  if (section) sectionsById.set(section, link);
});

if (sectionsById.size) {
  const navObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const link = sectionsById.get(entry.target);
        if (!link) return;
        if (entry.isIntersecting) {
          navLinks.forEach((other) => other.removeAttribute("aria-current"));
          link.setAttribute("aria-current", "true");
        }
      });
    },
    { rootMargin: "-45% 0px -45% 0px" }
  );
  sectionsById.forEach((_link, section) => navObserver.observe(section));
}

/* -- 5. petal field ------------------------------------------------------ */

const canvas = document.getElementById("petals");

function startPetals() {
  if (!canvas || reduceMotion.matches) return null;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;

  const COLORS = ["#f6cbd1", "#f0a8b4", "#f7ead9", "#e5c97a"];
  const SPRITE = 72;
  const NEAR = 0.62; // depth above which a petal is treated as out of focus

  let width = 0;
  let height = 0;
  let dpr = 1;
  let petals = [];
  let rafId = null;
  let pointerX = 0;
  let wind = 0;
  let lastScrollY = window.scrollY;

  const sprites = { crisp: [], soft: [] };

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  /* Petals are pre-rendered once into sprite canvases and blitted with
     drawImage. Two variants per colour:

       crisp — a real petal silhouette, used for the sharp far/mid field
       soft  — a radial falloff standing in for a heavy defocus blur

     The soft variant is why there is no CSS `filter: blur()` anywhere here.
     Blurring a full-screen canvas every frame is one of the most expensive
     things you can ask a phone GPU to do, and an out-of-focus petal is not
     a blurred petal shape — it is a soft gradient smudge. Drawing that
     directly is both cheaper and closer to how real bokeh looks. */
  function buildSprites() {
    const h = SPRITE / 2;

    COLORS.forEach((hex) => {
      const crisp = document.createElement("canvas");
      crisp.width = crisp.height = SPRITE;
      const a = crisp.getContext("2d");
      a.fillStyle = hex;
      a.beginPath();
      a.moveTo(h, 3);
      a.quadraticCurveTo(SPRITE - 5, h - 9, h, SPRITE - 3);
      a.quadraticCurveTo(5, h - 9, h, 3);
      a.fill();
      // a little shading so it reads as a curved surface, not a flat chip
      const shade = a.createLinearGradient(0, 0, 0, SPRITE);
      shade.addColorStop(0, "rgba(255,255,255,0.38)");
      shade.addColorStop(0.55, "rgba(255,255,255,0)");
      shade.addColorStop(1, "rgba(70,20,40,0.22)");
      a.globalCompositeOperation = "source-atop";
      a.fillStyle = shade;
      a.fillRect(0, 0, SPRITE, SPRITE);
      sprites.crisp.push(crisp);

      const soft = document.createElement("canvas");
      soft.width = soft.height = SPRITE;
      const b = soft.getContext("2d");
      const glow = b.createRadialGradient(h, h, 0, h, h, h);
      glow.addColorStop(0, rgba(hex, 0.95));
      glow.addColorStop(0.4, rgba(hex, 0.6));
      glow.addColorStop(0.75, rgba(hex, 0.18));
      glow.addColorStop(1, rgba(hex, 0));
      b.fillStyle = glow;
      b.beginPath();
      b.arc(h, h, h, 0, Math.PI * 2);
      b.fill();
      sprites.soft.push(soft);
    });
  }

  /* z is depth: 0 = far up the avenue, 1 = right in front of the lens.
     Size, speed, opacity and focus all key off it, which is what produces
     the layered depth in the reference rather than one flat sheet. */
  function makePetal(seeded) {
    const z = Math.random();
    const eased = Math.pow(z, 1.7);

    return {
      z,
      sprite: (z > NEAR ? sprites.soft : sprites.crisp)[
        (Math.random() * COLORS.length) | 0
      ],
      x: Math.random() * width,
      y: seeded ? Math.random() * height : -90 - Math.random() * 160,
      size: 4 + eased * 30,
      speed: 0.14 + eased * 1.45,
      drift: (Math.random() - 0.5) * (0.18 + eased * 0.85),
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.005 + Math.random() * 0.011,
      tumble: Math.random() * Math.PI * 2,
      tumbleSpeed: 0.009 + Math.random() * 0.026,
      spin: (Math.random() - 0.5) * 0.014,
      angle: Math.random() * Math.PI * 2,
      // near petals are the most transparent, exactly as in the reference
      alpha: 0.36 - eased * 0.19,
      stretch: z > NEAR ? 1 + z * 0.5 : 1,
    };
  }

  function resize() {
    // Cap DPR at 2 — a 3x buffer on a phone triples fill cost for no gain.
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const target = Math.max(10, Math.min(30, Math.round((width * height) / 44000)));
    if (petals.length > target) {
      petals.length = target;
    } else {
      while (petals.length < target) petals.push(makePetal(true));
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    // Scrolling stirs the air; the gust decays on its own.
    const y = window.scrollY;
    wind += (y - lastScrollY) * 0.016;
    lastScrollY = y;
    wind *= 0.94;

    for (let i = 0; i < petals.length; i++) {
      const p = petals[i];

      p.sway += p.swaySpeed;
      p.tumble += p.tumbleSpeed;
      p.angle += p.spin;
      p.y += p.speed;
      p.x += p.drift + Math.sin(p.sway) * 0.3 + wind * p.z;

      if (p.y > height + 90) {
        petals[i] = makePetal(false);
        continue;
      }
      if (p.x < -90) p.x = width + 60;
      if (p.x > width + 90) p.x = -60;

      // grows as it falls toward the viewer
      const grow = 1 + (p.y / height) * 0.28;
      const s = p.size * grow;
      // tumbling: the petal turns edge-on and back, so its width breathes
      const face = 0.22 + 0.78 * Math.abs(Math.cos(p.tumble));

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x + pointerX * p.z * 34, p.y);
      ctx.rotate(p.angle);
      ctx.drawImage(
        p.sprite,
        (-s * face) / 2,
        (-s * p.stretch) / 2,
        s * face,
        s * p.stretch
      );
      ctx.restore();
    }

    ctx.globalAlpha = 1;
    rafId = requestAnimationFrame(draw);
  }

  function play() {
    if (rafId === null) rafId = requestAnimationFrame(draw);
  }

  function pause() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  buildSprites();
  resize();
  play();
  canvas.classList.add("is-live");

  // Depth parallax: layers slide against each other as the cursor moves.
  // Pointer only — on touch, the wind-on-scroll above already supplies it.
  if (finePointer.matches) {
    window.addEventListener(
      "pointermove",
      (event) => {
        pointerX = (event.clientX / window.innerWidth) * 2 - 1;
      },
      { passive: true }
    );
  }

  let resizeTimer;
  window.addEventListener(
    "resize",
    () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 180);
    },
    { passive: true }
  );

  // Don't burn battery in a background tab.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
    else play();
  });

  return { pause, play };
}

let petalField = startPetals();

reduceMotion.addEventListener("change", () => {
  if (reduceMotion.matches) {
    if (petalField) petalField.pause();
    canvas?.classList.remove("is-live");
    document
      .querySelectorAll("[data-reveal]")
      .forEach((node) => node.classList.add("is-revealed"));
  } else if (!petalField) {
    petalField = startPetals();
  } else {
    petalField.play();
    canvas?.classList.add("is-live");
  }
});

/* -- 6. magnetic primary CTA (fine pointers only) ------------------------ */

if (finePointer.matches && !reduceMotion.matches) {
  document.querySelectorAll(".hero-actions .btn").forEach((btn) => {
    btn.addEventListener("pointermove", (event) => {
      const rect = btn.getBoundingClientRect();
      const mx = event.clientX - rect.left - rect.width / 2;
      const my = event.clientY - rect.top - rect.height / 2;
      btn.style.transform = `translate(${mx * 0.14}px, ${my * 0.2 - 2}px)`;
    });
    btn.addEventListener("pointerleave", () => {
      btn.style.transform = "";
    });
  });
}

/* -- 7. smooth scroll (optional enhancement, loaded last) ---------------- */

function nativeAnchorScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const id = link.getAttribute("href").slice(1);
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({
        behavior: reduceMotion.matches ? "auto" : "smooth",
        block: "start",
      });
    });
  });
}

if (reduceMotion.matches) {
  nativeAnchorScroll();
} else {
  try {
    const { default: Lenis } = await import("https://esm.sh/lenis@1.3.4");

    const lenis = new Lenis({
      lerp: 0.1,
      wheelMultiplier: 1,
      // Native touch scrolling stays native: syncing it costs frames on
      // mid-range phones and gains almost nothing visually.
      syncTouch: false,
    });

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    lenis.on("scroll", onScroll);

    document.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener("click", (event) => {
        const id = link.getAttribute("href").slice(1);
        const target = id ? document.getElementById(id) : null;
        if (!target) return;
        event.preventDefault();
        lenis.scrollTo(target, { offset: -80, duration: 1.15 });
      });
    });

    // Lenis must not fight the modal: lock it while the dialog is open.
    const dialog = document.getElementById("memory-dialog");
    if (dialog) {
      new MutationObserver(() => {
        if (dialog.open) lenis.stop();
        else lenis.start();
      }).observe(dialog, { attributes: true, attributeFilter: ["open"] });
    }
  } catch (err) {
    console.warn("Smooth scroll unavailable, falling back to native.", err);
    nativeAnchorScroll();
  }
}
