import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const rsvpForm = document.getElementById("rsvp-form");
const commentForm = document.getElementById("comment-form");
const attendeeList = document.getElementById("attendee-list");
const commentList = document.getElementById("comment-list");
const rsvpStatus = document.getElementById("rsvp-status");
const commentStatus = document.getElementById("comment-status");

const cfg = window.SD_CONFIG || {};

if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
  rsvpStatus.textContent = "Set js/config.js with your Supabase URL + anon key.";
  commentStatus.textContent = "Database connection not configured.";
  attendeeList.innerHTML = "<li>Configuration needed.</li>";
  commentList.innerHTML = "<li>Configuration needed.</li>";
} else {
  const supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  wireHandlers(supabase);
  refreshAll(supabase);
}

function wireHandlers(supabase) {
  rsvpForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    rsvpStatus.textContent = "Submitting RSVP...";

    const formData = new FormData(rsvpForm);
    const payload = {
      name: String(formData.get("name") || "").trim(),
      email: normalizeOptional(formData.get("email")),
      attending: String(formData.get("attending") || "maybe"),
      guests: Number(formData.get("guests") || 0),
      message: normalizeOptional(formData.get("message"))
    };

    const { error } = await supabase.from("rsvps").insert(payload);
    if (error) {
      rsvpStatus.textContent = `Could not submit RSVP: ${error.message}`;
      return;
    }

    rsvpForm.reset();
    rsvpStatus.textContent = "RSVP submitted!";
    await refreshAttendees(supabase);
  });

  commentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    commentStatus.textContent = "Posting comment...";

    const formData = new FormData(commentForm);
    const payload = {
      name: String(formData.get("name") || "").trim(),
      comment: String(formData.get("comment") || "").trim()
    };

    const { error } = await supabase.from("comments").insert(payload);
    if (error) {
      commentStatus.textContent = `Could not post comment: ${error.message}`;
      return;
    }

    commentForm.reset();
    commentStatus.textContent = "Comment posted!";
    await refreshComments(supabase);
  });
}

async function refreshAll(supabase) {
  await Promise.all([refreshAttendees(supabase), refreshComments(supabase)]);
}

async function refreshAttendees(supabase) {
  attendeeList.innerHTML = "<li>Loading...</li>";
  const { data, error } = await supabase
    .from("rsvps")
    .select("name, attending, guests, message")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    attendeeList.innerHTML = `<li>Could not load attendees: ${error.message}</li>`;
    return;
  }

  if (!data.length) {
    attendeeList.innerHTML = "<li>No responses yet.</li>";
    return;
  }

  attendeeList.innerHTML = "";
  data.forEach((row) => {
    const item = document.createElement("li");
    const messageSuffix = row.message ? ` — \"${row.message}\"` : "";
    item.textContent = `${row.name} (${row.attending}, +${row.guests})${messageSuffix}`;
    attendeeList.appendChild(item);
  });
}

async function refreshComments(supabase) {
  commentList.innerHTML = "<li>Loading...</li>";
  const { data, error } = await supabase
    .from("comments")
    .select("name, comment")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    commentList.innerHTML = `<li>Could not load comments: ${error.message}</li>`;
    return;
  }

  if (!data.length) {
    commentList.innerHTML = "<li>No comments yet.</li>";
    return;
  }

  commentList.innerHTML = "";
  data.forEach((row) => {
    const item = document.createElement("li");
    item.textContent = `${row.name}: ${row.comment}`;
    commentList.appendChild(item);
  });
}

function normalizeOptional(value) {
  const text = String(value || "").trim();
  return text.length ? text : null;
}
