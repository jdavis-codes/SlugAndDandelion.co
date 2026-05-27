import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const cfg = window.SD_CONFIG || {};

const form = document.getElementById("chamber-form");
const input = document.getElementById("chamber-pass");
const err = document.getElementById("chamber-err");
const body = document.body;

const CHAMBER_DESTINATIONS = [
  { keyName: "sun", destination: "ra.html" },
  { keyName: "sacrifice", destination: "maat.html" },
];

let denyTimer = null;

function makeClient(password) {
  return createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-portal-password": password } }
  });
}

function clearDenialState() {
  if (!body) return;
  body.classList.remove("chamber-denied");
  if (input) input.readOnly = false;
}

function triggerDenialState(originalText) {
  if (!body) return;

  clearTimeout(denyTimer);
  body.classList.remove("chamber-denied");
  void body.offsetWidth;
  body.classList.add("chamber-denied");

  if (input) {
    input.value = "𓂀 the chamber denies you";
    input.readOnly = true;
  }

  denyTimer = window.setTimeout(() => {
    clearDenialState();
    if (input) {
      input.value = originalText || "";
      input.focus();
    }
  }, 2800);
}

async function resolveChamberDestination(password) {
  const trimmedPassword = String(password || "").trim();
  if (!trimmedPassword || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;

  const client = makeClient(trimmedPassword);

  for (const chamber of CHAMBER_DESTINATIONS) {
    const { data, error } = await client.rpc("check_auth_key", { key_name: chamber.keyName });
    if (!error && data === true) {
      return chamber;
    }
  }

  return null;
}

if (form && input) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (body && body.classList.contains("chamber-denied")) {
      return;
    }

    const password = String(input.value || "").trim().toLowerCase();
    if (!password) {
      if (err) err.textContent = "";
      triggerDenialState("");
      return;
    }

    if (err) err.textContent = "listening at the threshold...";

    const chamber = await resolveChamberDestination(password);

    if (chamber) {
      try {
        sessionStorage.setItem("dark_council_chamber_key", chamber.keyName);
        sessionStorage.setItem("dark_council_chamber_pass", password);
      } catch (_) {}

      window.location.href = chamber.destination;
      return;
    }

    if (err) err.textContent = "";
    triggerDenialState(password);
  });

  input.addEventListener("input", () => {
    if (err) err.textContent = "";
    clearDenialState();
  });
}
