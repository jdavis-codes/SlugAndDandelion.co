import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Hard-coded credential — no user-facing password entry needed
const RSVP_PASS = "darkness";

const cfg = window.SD_CONFIG || {};

function makeClient() {
  return createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-portal-password": RSVP_PASS } }
  });
}

const rsvpForm    = document.getElementById("rsvp-form");
const rsvpStatus  = document.getElementById("rsvp-status");
const attendeeList = document.getElementById("attendee-list");

// ── Load attendees on page load ───────────────────────────────────────────────
async function loadAttendees() {
  if (!cfg.supabaseUrl) {
    if (attendeeList) attendeeList.innerHTML = "<li style=\"color:#666;\">Config missing.</li>";
    return;
  }
  const sb = makeClient();
  const { data, error } = await sb
    .from("rsvps")
    .select("name, attending, guests, message")
    .in("attending", ["yes", "maybe"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (!attendeeList) return;
  if (error) { attendeeList.innerHTML = `<li style="color:#666;">Could not load: ${error.message}</li>`; return; }
  if (!data.length) { attendeeList.innerHTML = "<li style=\"color:#666;\">. . .</li>"; return; }

  attendeeList.innerHTML = "";
  data.forEach(row => {
    const li = document.createElement("li");
    const guests = row.guests > 0 ? ` +${row.guests}` : "";
    const msg    = row.message ? ` — "${row.message}"` : "";
    li.textContent = `${row.name}${guests}${msg}`;
    attendeeList.appendChild(li);
  });
}

loadAttendees();

// ── RSVP submit ───────────────────────────────────────────────────────────────
if (rsvpForm) {
  rsvpForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (rsvpStatus) rsvpStatus.textContent = "Submitting...";

    const fd = new FormData(rsvpForm);
    const guestCount = Math.max(0, Math.min(2, Number(fd.get("guests") || 0) || 0));
    const payload = {
      name:            String(fd.get("name")            || "").trim(),
      attending:       String(fd.get("attending")       || "maybe"),
      guests:          guestCount,
      message:         String(fd.get("message")         || "").trim() || null,
      private_message: String(fd.get("private_message") || "").trim() || null,
    };

    if (!payload.name) { if (rsvpStatus) rsvpStatus.textContent = "Name is required."; return; }

    try {
      payload.wishes_released = Number(localStorage.getItem("dandelion_total_wishes_v1") || 0);
      payload.wishes_caught   = Number(localStorage.getItem("dandelion_caught_wishes_v1") || 0);
    } catch (_) {}

    const sb = makeClient();
    const { error } = await sb.from("rsvps").insert(payload);

    if (error) {
      if (rsvpStatus) rsvpStatus.textContent = `Error: ${error.message}`;
    } else {
      rsvpForm.reset();
      if (rsvpStatus) rsvpStatus.textContent = "RSVP submitted!";
      await loadAttendees();
    }
  });
}
