import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const ACCESS_KEY_STORAGE = "dark_council_chamber_key";
const ACCESS_PASS_STORAGE = "dark_council_chamber_pass";
const REQUIRED_KEY = "sun";
const POLL_INTERVAL_MS = 7000;

const cfg = window.SD_CONFIG || {};

const boardForm = document.getElementById("ra-board-form");
const boardStatus = document.getElementById("ra-board-status");
const messageList = document.getElementById("ra-message-list");

let lastRenderedSignature = "";
let pollingTimer = null;

function getAccessPassword() {
  try {
    const keyName = sessionStorage.getItem(ACCESS_KEY_STORAGE);
    const password = sessionStorage.getItem(ACCESS_PASS_STORAGE);
    if (keyName !== REQUIRED_KEY || !password) return null;
    return password;
  } catch (_) {
    return null;
  }
}

function makeClient(password) {
  return createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-portal-password": password } }
  });
}

function redirectToRsvp() {
  window.location.replace("rsvp.html");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function renderMessages(rows) {
  if (!messageList) return;

  if (!rows.length) {
    lastRenderedSignature = "empty";
    messageList.innerHTML = '<li class="ra-empty">No whispers yet. Be the first to signal the sun.</li>';
    return;
  }

  const signature = rows.map((row) => `${row.id}:${row.created_at}`).join("|");
  if (signature === lastRenderedSignature) return;
  lastRenderedSignature = signature;

  messageList.innerHTML = rows.map((row) => `
    <li>
      <div class="ra-message-name engraved-text">${escapeHtml(row.name)}</div>
      <div class="ra-message-body">${escapeHtml(row.message)}</div>
      <div class="ra-message-time">${escapeHtml(formatTime(row.created_at))}</div>
    </li>
  `).join("");
}

async function loadMessages({ silent = false } = {}) {
  const password = getAccessPassword();
  if (!password || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    if (!silent && boardStatus) boardStatus.textContent = "Sun access required.";
    redirectToRsvp();
    return;
  }

  const client = makeClient(password);
  const { data: accessOk, error: accessError } = await client.rpc("check_auth_key", { key_name: REQUIRED_KEY });
  if (accessError || accessOk !== true) {
    if (!silent && boardStatus) boardStatus.textContent = "Sun access required.";
    redirectToRsvp();
    return;
  }

  const { data, error } = await client
    .from("ra_messages")
    .select("id, created_at, name, message")
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    if (!silent && boardStatus) boardStatus.textContent = `Could not load: ${error.message}`;
    return;
  }

  renderMessages(data || []);
  if (!silent && boardStatus) boardStatus.textContent = "";
}

function startPolling() {
  if (pollingTimer) window.clearInterval(pollingTimer);
  pollingTimer = window.setInterval(() => {
    loadMessages({ silent: true });
  }, POLL_INTERVAL_MS);
}

if (boardForm) {
  boardForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const password = getAccessPassword();
    if (!password) {
      if (boardStatus) boardStatus.textContent = "Sun access required.";
      redirectToRsvp();
      return;
    }

    const formData = new FormData(boardForm);
    const payload = {
      name: String(formData.get("name") || "").trim(),
      message: String(formData.get("message") || "").trim(),
    };

    if (!payload.name || !payload.message) {
      if (boardStatus) boardStatus.textContent = "Name and message are required.";
      return;
    }

    if (boardStatus) boardStatus.textContent = "Sending to Ra...";

    const client = makeClient(password);
    const { error } = await client.from("ra_messages").insert(payload);

    if (error) {
      if (boardStatus) boardStatus.textContent = `Error: ${error.message}`;
      return;
    }

    boardForm.reset();
    if (boardStatus) boardStatus.textContent = "The sun has received your signal.";
    await loadMessages({ silent: true });
  });
}

loadMessages();
startPolling();
