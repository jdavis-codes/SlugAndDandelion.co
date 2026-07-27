import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { initFoamFingerEffects } from "./foam-fingers.js";

const rsvpForm = document.getElementById("rsvp-form");
const jerseyInput = document.getElementById("jersey-number");
const reserveBtn = document.querySelector('.reserve-btn[form="rsvp-form"]');
const confettiLayer = document.getElementById("confetti");

const sectionInput = rsvpForm?.querySelector('[name="section"]');
const rowInput = rsvpForm?.querySelector('[name="box"]');
const seatInput = rsvpForm?.querySelector('[name="seat"]');
const crowdMessageInput = rsvpForm?.querySelector('[name="crowd_message"]');

const seatDisplaySection = document.getElementById("seat-display-section");
const seatDisplayRow = document.getElementById("seat-display-row");
const seatDisplaySeat = document.getElementById("seat-display-seat");

const seatPickerModal = document.getElementById("seat-picker-modal");
const seatPickerGrid = document.getElementById("seat-picker-grid");
const bleachersBoardGrid = document.getElementById("bleachers-board-grid");
const seatPickerOpeners = document.querySelectorAll("[data-open-seat-picker]");
const seatPickerClosers = document.querySelectorAll("[data-close-seat-picker]");

const DRAFT_KEY = "sd_sports_rsvp_draft_v2";
const SUBMITTED_KEY = "sd_sports_rsvp_submitted_v1";
const RESERVATION_ID_KEY = "sd_sports_rsvp_id_v1";

const SECTION_VALUES = ["L", "M", "R"];
const ROW_VALUES = ["A", "B", "C", "D"];
const ROW_RENDER_ORDER = ["D", "C", "B", "A"];
const SEAT_VALUES = ["1", "2", "3", "4"];
const CROWD_MESSAGE_MAX = 32;
const TEAM_CLICK_COUNTER_RPC = "increment_toasters_poppers_clicks";
const REGISTER_VISITOR_RPC = "register_site_visitor";
const SITE_VISITOR_ID_KEY = "sd_sports_site_visitor_id_v1";

let defaultButtonText = reserveBtn?.textContent?.trim() || "Reserve your spot";
let loadingTimer = null;
let resetTimer = null;
let supabaseClient = null;
let activeConfig = null;
let seatReservations = new Map();
let teamClickCounterUnsupported = false;
let siteVisitorTrackingUnsupported = false;

initFoamFingerEffects({
  launchConfetti,
  onTeamClick: trackTeamClick
});
void trackUniqueVisitor();

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
  if (hasSubmittedReservation()) {
    defaultButtonText = "Edit reservation";
    if (reserveBtn) reserveBtn.textContent = defaultButtonText;
  }

  hydrateDraft();
  ensureValidSeatSelection();
  renderAllSeatViews();
  wireSeatPickerInteractions();

  rsvpForm.addEventListener("input", persistDraft);
  if (jerseyInput) jerseyInput.addEventListener("input", persistDraft);
  rsvpForm.addEventListener("submit", onSubmit);

  void refreshSeatReservations();
}

function hasSubmittedReservation() {
  try {
    return localStorage.getItem(SUBMITTED_KEY) === "1";
  } catch (_) {
    return false;
  }
}

function getStoredReservationId() {
  try {
    const raw = localStorage.getItem(RESERVATION_ID_KEY);
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) return null;
    return value;
  } catch (_) {
    return null;
  }
}

function setStoredReservationId(id) {
  const value = Number(id);
  if (!Number.isInteger(value) || value <= 0) return;

  try {
    localStorage.setItem(RESERVATION_ID_KEY, String(value));
  } catch (_) {
    // Ignore storage failures.
  }
}

function clearStoredReservationId() {
  try {
    localStorage.removeItem(RESERVATION_ID_KEY);
  } catch (_) {
    // Ignore storage failures.
  }
}

function markSubmittedReservation() {
  try {
    localStorage.setItem(SUBMITTED_KEY, "1");
  } catch (_) {
    // Ignore storage failures.
  }

  defaultButtonText = "Edit reservation";
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

  const fieldNames = ["name", "guests", "phone", "email", "message", "crowd_message", "section", "box", "seat"];
  for (const fieldName of fieldNames) {
    const input = rsvpForm.querySelector(`[name="${fieldName}"]`);
    if (!input || typeof draft[fieldName] !== "string") continue;
    input.value = draft[fieldName];
  }

  if (jerseyInput && typeof draft.jersey_number === "string") {
    jerseyInput.value = draft.jersey_number;
  }

  if (crowdMessageInput) {
    crowdMessageInput.value = normalizeCrowdMessage(crowdMessageInput.value) || "";
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
    crowd_message: normalizeCrowdMessage(crowdMessageInput?.value) || "",
    section: String(sectionInput?.value || "L"),
    box: String(rowInput?.value || "A"),
    seat: String(seatInput?.value || "1"),
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
    setButtonState("", defaultButtonText);
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

function launchConfetti(options = {}) {
  if (!confettiLayer) return;

  const defaultColors = ["#f26522", "#1e88e5", "#ffffff", "#ffd166"];
  const palette = Array.isArray(options.colors) && options.colors.length > 0
    ? options.colors
    : defaultColors;
  const isMobile = window.matchMedia("(max-width: 820px)").matches;
  const count = Number.isFinite(options.count)
    ? Math.max(1, Math.floor(options.count))
    : (isMobile ? 90 : 140);
  const centerVw = Number.isFinite(options.centerVw) ? options.centerVw : null;
  const spreadVw = Number.isFinite(options.spreadVw)
    ? Math.max(2, options.spreadVw)
    : 80;
  const startTopVh = Number.isFinite(options.startTopVh)
    ? options.startTopVh
    : -12;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    const left = centerVw == null
      ? 10 + Math.random() * 80
      : clamp(centerVw + ((Math.random() - 0.5) * spreadVw), 1, 99);

    piece.style.left = `${left}vw`;
    piece.style.top = `${startTopVh}vh`;
    piece.style.backgroundColor = palette[i % palette.length];
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

async function trackTeamClick(team) {
  if (teamClickCounterUnsupported) return;

  const normalizedTeam = String(team || "").trim().toLowerCase();
  if (normalizedTeam !== "toasters" && normalizedTeam !== "poppers") return;

  const cfg = await getActiveConfig();
  if (!cfg) return;

  const supabase = getSupabaseClient(cfg);
  const { error } = await supabase.rpc(TEAM_CLICK_COUNTER_RPC, { p_team: normalizedTeam });

  if (!error) return;

  const code = String(error.code || "").trim();
  const message = String(error.message || "");
  if (code === "42883" || /increment_toasters_poppers_clicks|does not exist/i.test(message)) {
    teamClickCounterUnsupported = true;
  }
}

function createSiteVisitorId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    }
  } catch (_) {
    // Ignore runtime crypto availability issues.
  }

  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${timestamp}${random}`.slice(0, 16);
}

function getOrCreateSiteVisitorId() {
  try {
    const existing = String(localStorage.getItem(SITE_VISITOR_ID_KEY) || "").trim();
    if (existing) return existing;

    const nextId = createSiteVisitorId();
    if (!nextId) return null;

    localStorage.setItem(SITE_VISITOR_ID_KEY, nextId);
    return nextId;
  } catch (_) {
    return null;
  }
}

async function trackUniqueVisitor() {
  if (siteVisitorTrackingUnsupported) return;

  const visitorId = getOrCreateSiteVisitorId();
  if (!visitorId) return;

  const cfg = await getActiveConfig();
  if (!cfg) return;

  const supabase = getSupabaseClient(cfg);
  const { error } = await supabase.rpc(REGISTER_VISITOR_RPC, { p_visitor_id: visitorId });

  if (!error) return;

  const code = String(error.code || "").trim();
  const message = String(error.message || "");
  if (code === "42883" || /register_site_visitor|does not exist/i.test(message)) {
    siteVisitorTrackingUnsupported = true;
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

async function getActiveConfig() {
  if (activeConfig?.supabaseUrl && activeConfig?.supabaseAnonKey) {
    return activeConfig;
  }

  let cfg = getConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    cfg = await loadConfigFromFile();
  }

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
  activeConfig = cfg;
  return cfg;
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

function normalizeCrowdMessage(rawValue) {
  return normalizeOptional(rawValue, CROWD_MESSAGE_MAX);
}

function normalizeJersey() {
  const digits = String(jerseyInput?.value || "").replace(/\D+/g, "");
  const numeric = Math.max(0, Math.min(99, Number(digits || 0)));
  const normalized = String(numeric).padStart(2, "0");

  if (jerseyInput) jerseyInput.value = normalized;
  return normalized;
}

function isSeatConflictError(error) {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "");
  return code === "23505" || /duplicate|unique/i.test(message);
}

function normalizeSeatSelection(section, row, seat) {
  const safeSection = String(section || "").trim().toUpperCase();
  const safeRow = String(row || "").trim().toUpperCase();
  const safeSeat = String(seat || "").trim();

  return {
    section: SECTION_VALUES.includes(safeSection) ? safeSection : "L",
    row: ROW_VALUES.includes(safeRow) ? safeRow : "A",
    seat: SEAT_VALUES.includes(safeSeat) ? safeSeat : "1"
  };
}

function getCurrentSeatSelection() {
  return normalizeSeatSelection(sectionInput?.value, rowInput?.value, seatInput?.value);
}

function getSeatKey(section, row, seat) {
  return `${section}-${row}-${seat}`;
}

function applySeatSelection(selection) {
  const normalized = normalizeSeatSelection(selection.section, selection.row, selection.seat);

  if (sectionInput) sectionInput.value = normalized.section;
  if (rowInput) rowInput.value = normalized.row;
  if (seatInput) seatInput.value = normalized.seat;

  if (seatDisplaySection) seatDisplaySection.textContent = normalized.section;
  if (seatDisplayRow) seatDisplayRow.textContent = normalized.row;
  if (seatDisplaySeat) seatDisplaySeat.textContent = normalized.seat;

  persistDraft();
  renderAllSeatViews();
}

function ensureValidSeatSelection() {
  applySeatSelection(getCurrentSeatSelection());
}

function openSeatPicker() {
  if (!seatPickerModal) return;
  seatPickerModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("seat-picker-open");
}

function closeSeatPicker() {
  if (!seatPickerModal) return;
  seatPickerModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("seat-picker-open");
}

function wireSeatPickerInteractions() {
  for (const opener of seatPickerOpeners) {
    opener.addEventListener("click", openSeatPicker);
    opener.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openSeatPicker();
    });
  }

  for (const closer of seatPickerClosers) {
    closer.addEventListener("click", closeSeatPicker);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (seatPickerModal?.getAttribute("aria-hidden") !== "false") return;
    closeSeatPicker();
  });

  seatPickerGrid?.addEventListener("click", (event) => {
    const btn = event.target.closest("button.bleacher-seat");
    if (!btn || btn.disabled) return;

    applySeatSelection({
      section: btn.dataset.section,
      row: btn.dataset.row,
      seat: btn.dataset.seat
    });

    closeSeatPicker();
  });
}

function getSeatReservation(section, row, seat) {
  return seatReservations.get(getSeatKey(section, row, seat)) || null;
}

function renderAllSeatViews() {
  renderBleachersGrid(seatPickerGrid, true);
  renderBleachersGrid(bleachersBoardGrid, false);
}

function renderBleachersGrid(container, interactive) {
  if (!container) return;

  const selected = getCurrentSeatSelection();
  const selectedKey = getSeatKey(selected.section, selected.row, selected.seat);
  container.textContent = "";

  for (const section of SECTION_VALUES) {
    const sectionCard = document.createElement("section");
    sectionCard.className = "bleacher-section";

    const sectionTitle = document.createElement("h4");
    sectionTitle.className = "bleacher-section-title";
    sectionTitle.textContent = `Section ${section}`;
    sectionCard.appendChild(sectionTitle);

    for (const row of ROW_RENDER_ORDER) {
      const rowEl = document.createElement("div");
      rowEl.className = "bleacher-row";

      const rowLabel = document.createElement("span");
      rowLabel.className = "bleacher-row-label";
      rowLabel.textContent = row;
      rowEl.appendChild(rowLabel);

      for (const seat of SEAT_VALUES) {
        const key = getSeatKey(section, row, seat);
        const reservation = getSeatReservation(section, row, seat);
        const isSelected = key === selectedKey;
        const crowdMsg = reservation?.crowdMessage || "";

        const seatEl = document.createElement(interactive ? "button" : "div");
        seatEl.className = "bleacher-seat";

        if (interactive) {
          seatEl.type = "button";
          seatEl.dataset.section = section;
          seatEl.dataset.row = row;
          seatEl.dataset.seat = seat;
        }

        const statusLabel = reservation ? reservation.name : "Open";
        const msgLabel = crowdMsg ? `. Message to the crowd: ${crowdMsg}` : "";
        seatEl.setAttribute("aria-label", `${section}${row}-${seat} ${statusLabel}${msgLabel}`);

        if (reservation) seatEl.classList.add("is-reserved");
        if (isSelected) seatEl.classList.add("is-selected");

        if (interactive && reservation) {
          seatEl.disabled = true;
        }

        const seatName = document.createElement("span");
        seatName.className = "bleacher-seat-name";
        seatName.textContent = reservation ? reservation.name : "Open";
        seatEl.appendChild(seatName);

        if (!interactive && reservation && crowdMsg) {
          const bubble = document.createElement("div");
          bubble.className = "bleacher-seat-bubble";
          bubble.textContent = crowdMsg;
          seatEl.appendChild(bubble);
        }

        rowEl.appendChild(seatEl);
      }

      sectionCard.appendChild(rowEl);
    }

    container.appendChild(sectionCard);
  }
}

async function fetchSeatRows(supabase) {
  const fullSelect = "id,name,section,box,seat,crowd_message,message,created_at";
  const baseSelect = "id,name,section,box,seat,message,created_at";

  let query = supabase
    .from("sports_rsvps")
    .select(fullSelect)
    .order("created_at", { ascending: false });

  let { data, error } = await query;
  if (!error) return { rows: data || [] };

  if (!/crowd_message/i.test(String(error.message || ""))) {
    return { rows: null, error };
  }

  query = supabase
    .from("sports_rsvps")
    .select(baseSelect)
    .order("created_at", { ascending: false });

  ({ data, error } = await query);
  if (error) return { rows: null, error };
  return { rows: data || [] };
}

function rehydrateSeatReservations(rows) {
  const map = new Map();

  for (const row of rows) {
    const section = String(row.section || "").trim().toUpperCase();
    const seatRow = String(row.box || "").trim().toUpperCase();
    const seat = String(row.seat || "").trim();

    const normalized = normalizeSeatSelection(section, seatRow, seat);
    const isValid = normalized.section === section && normalized.row === seatRow && normalized.seat === seat;
    if (!isValid) continue;

    const key = getSeatKey(normalized.section, normalized.row, normalized.seat);
    if (map.has(key)) continue;

    const reservationId = Number(row.id);
    const name = String(row.name || "Reserved").trim().slice(0, 80) || "Reserved";
    const crowdMessage = normalizeCrowdMessage(row.crowd_message ?? row.message) || "";

    map.set(key, {
      id: Number.isInteger(reservationId) && reservationId > 0 ? reservationId : null,
      name,
      crowdMessage
    });
  }

  seatReservations = map;
}

async function refreshSeatReservations() {
  const cfg = await getActiveConfig();
  if (!cfg) {
    renderAllSeatViews();
    return;
  }

  const supabase = getSupabaseClient(cfg);
  const { rows, error } = await fetchSeatRows(supabase);

  if (error || !rows) {
    renderAllSeatViews();
    return;
  }

  rehydrateSeatReservations(rows);
  renderAllSeatViews();
}

async function insertReservationRow(supabase, payload) {
  let response = await supabase
    .from("sports_rsvps")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (response.error && /crowd_message/i.test(String(response.error.message || ""))) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.crowd_message;
    response = await supabase
      .from("sports_rsvps")
      .insert(fallbackPayload)
      .select("id")
      .maybeSingle();
  }

  const insertedId = Number(response.data?.id);
  return {
    error: response.error,
    id: Number.isInteger(insertedId) && insertedId > 0 ? insertedId : null
  };
}

async function updateReservationRow(supabase, payload, reservationId) {
  let response = await supabase
    .from("sports_rsvps")
    .update(payload)
    .eq("id", reservationId)
    .select("id");

  if (response.error && /crowd_message/i.test(String(response.error.message || ""))) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.crowd_message;
    response = await supabase
      .from("sports_rsvps")
      .update(fallbackPayload)
      .eq("id", reservationId)
      .select("id");
  }

  const notFound = !response.error && Array.isArray(response.data) && response.data.length === 0;
  return { error: response.error, notFound };
}

async function findLikelyReservationId(supabase, payload) {
  let query = supabase
    .from("sports_rsvps")
    .select("id,name,email,phone,jersey_number,created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  if (payload.email) {
    query = query.eq("email", payload.email);
  } else if (payload.phone) {
    query = query.eq("phone", payload.phone);
  } else {
    query = query
      .eq("name", payload.name)
      .eq("jersey_number", payload.jersey_number);
  }

  const { data, error } = await query;
  if (error || !data || data.length === 0) return null;

  const normalizedName = payload.name.toLowerCase();
  const exactName = data.find((row) => String(row.name || "").trim().toLowerCase() === normalizedName);
  const candidate = exactName || data[0];
  const id = Number(candidate.id);

  return Number.isInteger(id) && id > 0 ? id : null;
}

async function onSubmit(event) {
  event.preventDefault();
  const wasSubmittedBefore = hasSubmittedReservation();

  const cfg = await getActiveConfig();
  if (!cfg) {
    showButtonMessage("error", "Config missing");
    return;
  }

  const formData = new FormData(rsvpForm);
  const name = String(formData.get("name") || "").trim().slice(0, 80);

  if (!name) {
    showButtonMessage("error", "Name required");
    return;
  }

  const selection = getCurrentSeatSelection();
  const seatKey = getSeatKey(selection.section, selection.row, selection.seat);
  let reservationId = getStoredReservationId();

  startLoadingAnimation();

  await refreshSeatReservations();

  const guests = clampGuests(formData.get("guests"));
  const payload = {
    name,
    guests,
    phone: normalizeOptional(formData.get("phone"), 30),
    email: normalizeOptional(formData.get("email"), 120),
    message: normalizeOptional(formData.get("message"), 280),
    crowd_message: normalizeCrowdMessage(formData.get("crowd_message")),
    section: selection.section,
    box: selection.row,
    seat: selection.seat,
    jersey_number: normalizeJersey()
  };

  const supabase = getSupabaseClient(cfg);

  if (!reservationId && wasSubmittedBefore) {
    const selectedReservation = seatReservations.get(seatKey);
    if (
      selectedReservation?.id &&
      String(selectedReservation.name || "").trim().toLowerCase() === name.toLowerCase()
    ) {
      reservationId = selectedReservation.id;
      setStoredReservationId(reservationId);
    }
  }

  if (!reservationId && wasSubmittedBefore) {
    reservationId = await findLikelyReservationId(supabase, payload);
    if (reservationId) setStoredReservationId(reservationId);
  }

  const selectedReservation = seatReservations.get(seatKey);
  if (selectedReservation) {
    const isCurrentReservation = reservationId && selectedReservation.id === reservationId;
    if (!isCurrentReservation) {
      showButtonMessage("error", "Seat already reserved");
      return;
    }
  }

  let error = null;
  if (reservationId) {
    const updateResult = await updateReservationRow(supabase, payload, reservationId);
    error = updateResult.error;

    if (updateResult.notFound) {
      clearStoredReservationId();
      reservationId = null;
    }
  }

  if (!reservationId) {
    const insertResult = await insertReservationRow(supabase, payload);
    error = insertResult.error;

    if (!error && insertResult.id) {
      reservationId = insertResult.id;
      setStoredReservationId(insertResult.id);
    }
  } else if (!error) {
    setStoredReservationId(reservationId);
  }

  if (error) {
    if (isSeatConflictError(error)) {
      await refreshSeatReservations();
      showButtonMessage("error", "Seat already reserved");
      return;
    }

    showButtonMessage("error", "Try again");
    return;
  }

  persistDraft();
  markSubmittedReservation();

  await refreshSeatReservations();

  launchConfetti();
  showButtonMessage("success", wasSubmittedBefore ? "Reservation updated" : "Reservation secured");
}