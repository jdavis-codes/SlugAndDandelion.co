import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const RSVP_PASS = "darkness";

const cfg = window.SD_CONFIG || {};

function makeClient() {
  return createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-portal-password": RSVP_PASS } }
  });
}

const commentForm   = document.getElementById("comment-form");
const commentStatus = document.getElementById("comment-status");
const commentList   = document.getElementById("comment-list");

// ── Load comments on page load ───────────────────────────────────────────────
async function loadComments() {
  if (!cfg.supabaseUrl) {
    if (commentList) commentList.innerHTML = "<li style=\"color:#666;\">Config missing.</li>";
    return;
  }
  const sb = makeClient();
  const { data, error } = await sb
    .from("comments")
    .select("name, comment, wishes_caught")
    .order("wishes_caught", { ascending: false })
    .order("created_at",    { ascending: false })
    .limit(100);

  if (!commentList) return;
  if (error) { commentList.innerHTML = `<li style="color:#666;">Could not load: ${error.message}</li>`; return; }
  if (!data.length) { commentList.innerHTML = "<li style=\"color:#666;\">. . . </li>"; return; }

  commentList.innerHTML = "";
  data.forEach(row => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="comment-name engraved-text">${escapeHtml(row.name)}:</span> <span class="comment-body engraved-text">${escapeHtml(row.comment)}</span>`;
    commentList.appendChild(li);
  });
}

loadComments();

// ── Comment submit ─────────────────────────────────────────────────────────
if (commentForm) {
  commentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (commentStatus) commentStatus.textContent = "Posting...";

    const fd = new FormData(commentForm);
    const payload = {
      name:    String(fd.get("name")    || "").trim(),
      comment: String(fd.get("comment") || "").trim(),
    };

    if (!payload.name || !payload.comment) {
      if (commentStatus) commentStatus.textContent = "Name and comment are required.";
      return;
    }

    try {
      payload.wishes_released = Number(localStorage.getItem("dandelion_total_wishes_v1") || 0);
      payload.wishes_caught   = Number(localStorage.getItem("dandelion_caught_wishes_v1") || 0);
    } catch (_) {}

    const sb = makeClient();
    const { error } = await sb.from("comments").insert(payload);

    if (error) {
      if (commentStatus) commentStatus.textContent = `Error: ${error.message}`;
    } else {
      commentForm.reset();
      if (commentStatus) commentStatus.textContent = "Engraved for all time...";
      await loadComments();
    }
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
