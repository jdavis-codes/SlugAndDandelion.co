import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const rsvpForm = document.getElementById("rsvp-form");
const jerseyInput = document.getElementById("jersey-number");
const reserveBtn = document.querySelector('.reserve-btn[form="rsvp-form"]');
const confettiLayer = document.getElementById("confetti");
const DRAFT_KEY = "sd_sports_rsvp_draft_v1";

const DEFAULT_BUTTON_TEXT = reserveBtn?.textContent?.trim() || "Reserve your spot";
let loadingTimer = null;
let resetTimer = null;
let supabaseClient = null;

function getConfig() {
  const cfg = window.SD_CONFIG || globalThis.SD_CONFIG || {};
  return {
    supabaseUrl: String(cfg.supabaseUrl || "").trim(),
    supabaseAnonKey: String(cfg.supabaseAnonKey || "").trim()
  };
}

async function loadConfigFromFile() {
  try {
    const resp = await fetch(`js/config.js?v=${Date.now()}`, { cache: "no-store" });
    if (!resp.ok) return { supabaseUrl: "", supabaseAnonKey: "" };

    const source = await resp.text();
    const urlMatch = source.match(/supabaseUrl\s*:\s*["']([^"']+)["']/);
    const keyMatch = source.match(/supabaseAnonKey\s*:\s*["']([^"']+)["']/);

    const cfg = {
      supabaseUrl: (urlMatch?.[1] || "").trim(),
      supabaseAnonKey: (keyMatch?.[1] || "").trim()
    };

    if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
      window.SD_CONFIG = cfg;
    }

    return cfg;
  } catch (_) {
    return { supabaseUrl: "", supabaseAnonKey: "" };
  }
}

if (rsvpForm) {
  hydrateDraft();
  rsvpForm.addEventListener("input", persistDraft);
  if (jerseyInput) jerseyInput.addEventListener("input", persistDraft);
  rsvpForm.addEventListener("submit", onSubmit);
}

function readDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function hydrateDraft() {
  const draft = readDraft();
  if (!draft || !rsvpForm) return;

  const fieldNames = ["name", "guests", "phone", "email", "message"];
  for (const fieldName of fieldNames) {
    const input = rsvpForm.querySelector(`[name="${fieldName}"]`);
    if (!input || typeof draft[fieldName] !== "string") continue;
    input.value = draft[fieldName];
  }

  if (jerseyInput && typeof draft.jersey_number === "string") {
    jerseyInput.value = draft.jersey_number;
  }
}

function persistDraft() {
  if (!rsvpForm) return;

  const draft = {
    name: String(rsvpForm.querySelector('[name="name"]')?.value || ""),
    guests: String(rsvpForm.querySelector('[name="guests"]')?.value || "0"),
    phone: String(rsvpForm.querySelector('[name="phone"]')?.value || ""),
    email: String(rsvpForm.querySelector('[name="email"]')?.value || ""),
    message: String(rsvpForm.querySelector('[name="message"]')?.value || ""),
    jersey_number: String(jerseyInput?.value || "00")
  };

  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch (_) {
    // Ignore storage failures (private mode, quota, blocked storage).
  }
}

function setButtonState(state, label) {
  if (!reserveBtn) return;

  reserveBtn.classList.remove("is-loading", "is-success", "is-error");
  if (state) reserveBtn.classList.add(`is-${state}`);
  reserveBtn.textContent = label;
  reserveBtn.disabled = state === "loading";
}

function clearLoadingAnimation() {
  if (loadingTimer) {
    clearInterval(loadingTimer);
    loadingTimer = null;
  }
}

function scheduleReset() {
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = setTimeout(() => {
    setButtonState("", DEFAULT_BUTTON_TEXT);
  }, 2600);
}

function startLoadingAnimation() {
  clearLoadingAnimation();

  const phases = [
    "Checking roster",
    "Warming up the stadium",
    "Waiting on the whistle"
  ];
  let tick = 0;

  loadingTimer = setInterval(() => {
    const phase = phases[tick % phases.length];
    const dots = ".".repeat((tick % 3) + 1);
    setButtonState("loading", `${phase}${dots}`);
    tick += 1;
  }, 320);

  setButtonState("loading", `${phases[0]}.`);
}

function showButtonMessage(state, label) {
  clearLoadingAnimation();
  setButtonState(state, label);
  if (state !== "loading") scheduleReset();
}

function launchConfetti() {
  if (!confettiLayer) return;

  const colors = ["#f26522", "#1e88e5", "#ffffff", "#ffd166"];
  const count = window.matchMedia("(max-width: 820px)").matches ? 90 : 140;

  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${10 + Math.random() * 80}vw`;
    piece.style.backgroundColor = colors[i % colors.length];
    piece.style.setProperty("--dx", `${-180 + Math.random() * 360}px`);
    piece.style.setProperty("--rot", `${180 + Math.random() * 960}deg`);
    piece.style.setProperty("--dur", `${1500 + Math.random() * 1200}ms`);
    piece.style.setProperty("--delay", `${Math.random() * 220}ms`);
    confettiLayer.appendChild(piece);

    setTimeout(() => {
      piece.remove();
    }, 3200);
  }
}

function getSupabaseClient(cfg) {
  if (supabaseClient) return supabaseClient;

  supabaseClient = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  return supabaseClient;
}

function clampGuests(rawValue) {
  const n = Number(rawValue || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function normalizeOptional(rawValue, maxLength) {
  const value = String(rawValue || "").trim();
  if (!value) return null;
  return value.slice(0, maxLength);
}

function normalizeJersey() {
  const digits = String(jerseyInput?.value || "").replace(/\D+/g, "");
  const numeric = Math.max(0, Math.min(99, Number(digits || 0)));
  const normalized = String(numeric).padStart(2, "0");

  if (jerseyInput) jerseyInput.value = normalized;
  return normalized;
}

async function onSubmit(event) {
  event.preventDefault();

  let cfg = getConfig();

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    cfg = await loadConfigFromFile();
  }

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    showButtonMessage("error", "Config missing");
    return;
  }

  const formData = new FormData(rsvpForm);
  const name = String(formData.get("name") || "").trim().slice(0, 80);

  if (!name) {
    showButtonMessage("error", "Name required");
    return;
  }

  const guests = clampGuests(formData.get("guests"));
  const payload = {
    name,
    guests,
    phone: normalizeOptional(formData.get("phone"), 30),
    email: normalizeOptional(formData.get("email"), 120),
    message: normalizeOptional(formData.get("message"), 280),
    section: String(formData.get("section") || "SB").trim().slice(0, 10),
    box: String(formData.get("box") || "9").trim().slice(0, 10),
    seat: String(formData.get("seat") || "69").trim().slice(0, 10),
    jersey_number: normalizeJersey()
  };

  startLoadingAnimation();

  const supabase = getSupabaseClient(cfg);

  const { error } = await supabase.from("sports_rsvps").insert(payload);

  if (error) {
    showButtonMessage("error", "Try again");
    return;
  }

  persistDraft();

  launchConfetti();
  showButtonMessage("success", "Reservation secured");
}
