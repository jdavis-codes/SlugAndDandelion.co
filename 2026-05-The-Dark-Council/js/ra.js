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
let lastFetchedRows = [];
let lastObservedWidth = 0;

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

function escapeSvgText(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatBbsStamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${day},${hour}:${minute}`;
}

function wrapForSvg(text, maxCharsPerLine = 46) {
  const lines = [];
  const paragraphs = String(text || "")
    .replace(/\t/g, "    ")
    .split(/\r?\n/);

  for (const paragraph of paragraphs) {
    const normalized = paragraph.replace(/\s+/g, " ").trim();
    if (!normalized) {
      lines.push("");
      continue;
    }

    let start = 0;
    while (start < normalized.length) {
      let end = Math.min(start + maxCharsPerLine, normalized.length);
      if (end < normalized.length) {
        const breakAt = normalized.lastIndexOf(" ", end);
        if (breakAt > start + Math.floor(maxCharsPerLine * 0.45)) {
          end = breakAt;
        }
      }

      const chunk = normalized.slice(start, end).trim();
      if (chunk) lines.push(chunk);

      start = end;
      while (normalized[start] === " ") start += 1;
    }
  }

  return lines.length ? lines : [""];
}

function buildKnockoutMessageSvg(row, index, containerWidth) {
  const width = containerWidth;
  const left = 12;
  const fontSize = 15;
  // IBM Plex Mono at 17px: ~10.2px glyph + 0.5 letter-spacing = ~10.7px per char
  const maxCharsPerLine = Math.max(20, Math.floor((width - left - 32) / 8.7));

  const stamp = formatBbsStamp(row.created_at);
  const safeName = String(row.name || "Unknown").replace(/\s+/g, " ").trim() || "Unknown";
  const safeMessage = String(row.message || "").replace(/\s+/g, " ").trim();
  const bbsLine = `${stamp ? `${stamp}, ` : ""}${safeName} > ${safeMessage}`.trim();
  const ariaLabel = escapeSvgText(bbsLine);

  const lines = wrapForSvg(bbsLine, maxCharsPerLine);
  const lineParts = [];
  const lineStep = fontSize * 1.35;
  const minHeight = fontSize * 3;
  const verticalPadding = fontSize * 0.9;
  const contentHeight = Math.max(0, (lines.length - 1) * lineStep);
  const height = Math.max(minHeight, (verticalPadding * 2) + contentHeight);
  const centerY = height / 2;

  for (let i = 0; i < lines.length; i += 1) {
    const offset = (i - ((lines.length - 1) / 2)) * lineStep;
    const y = centerY + offset;
    lineParts.push(`<text x="${left}" y="${y}" dominant-baseline="middle" font-size="${fontSize}" font-family="IBM Plex Mono, SFMono-Regular, Menlo, Consolas, Liberation Mono, monospace" letter-spacing="0.5">${escapeSvgText(lines[i] || " ")}</text>`);
  }

  const maskId = `ra-msg-mask-${row.id || "x"}-${index}`;

  return `
    <svg class="ra-message-knockout" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${ariaLabel}">
      <defs>
        <mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">
          <rect x="0" y="0" width="${width}" height="${height}" fill="#fff"></rect>
          <g fill="#000">${lineParts.join("")}</g>
        </mask>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" fill="#020202" fill-opacity="0.87" mask="url(#${maskId})"></rect>
    </svg>
  `.trim();
}

function renderMessages(rows) {
  if (!messageList) return;

  lastFetchedRows = rows;
  const orderedRows = [...rows].reverse();
  const containerWidth = messageList.offsetWidth || 980;

  if (!rows.length) {
    lastRenderedSignature = "empty";
    messageList.innerHTML = '<li class="ra-empty">No whispers yet. Be the first to signal the sun.</li>';
    return;
  }

  const signature = `${containerWidth}:` + orderedRows.map((row) => `${row.id}:${row.created_at}`).join("|");
  if (signature === lastRenderedSignature) return;
  lastRenderedSignature = signature;

  messageList.innerHTML = orderedRows.map((row, index) => `
    <li class="ra-message-item">
      ${buildKnockoutMessageSvg(row, index, containerWidth)}
    </li>
  `).join("");

  messageList.scrollTop = messageList.scrollHeight;
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
      if (boardStatus) boardStatus.textContent = "Name + message required.";
      return;
    }

    if (boardStatus) boardStatus.textContent = "Sending to Ra...";

    const client = makeClient(password);
    const { error } = await client.from("ra_messages").insert(payload);

    if (error) {
      if (boardStatus) boardStatus.textContent = `Ra cannot process: ${error.message}`;
      return;
    }

    boardForm.reset();
    if (boardStatus) boardStatus.textContent = "Ra has reflected your signal.";
    await loadMessages({ silent: true });
  });
}

loadMessages();
startPolling();

if (messageList && window.ResizeObserver) {
  new ResizeObserver((entries) => {
    const newWidth = Math.round(entries[0].contentRect.width);
    if (Math.abs(newWidth - lastObservedWidth) > 4) {
      lastObservedWidth = newWidth;
      lastRenderedSignature = "";
      if (lastFetchedRows.length) renderMessages(lastFetchedRows);
    }
  }).observe(messageList);
}
