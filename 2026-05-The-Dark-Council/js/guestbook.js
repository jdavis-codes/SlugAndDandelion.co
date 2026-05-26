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

// ── Custom Rock Scrollbar ──────────────────────────────────────────────────
const scrollWrapper = document.getElementById("guestbook-scroller");
const scrollThumb = document.getElementById("rock-thumb");
const scrollContainer = document.getElementById("rock-scrollbar");

if (scrollWrapper && scrollThumb && scrollContainer) {
  let isDragging = false;
  let startY = 0;
  let startScrollTop = 0;

  const updateScrollbar = () => {
    const { scrollTop, scrollHeight, clientHeight } = scrollWrapper;
    if (scrollHeight <= clientHeight + 2) {
      scrollContainer.classList.remove("active");
      return;
    }
    scrollContainer.classList.add("active");
    
    const maxScroll = scrollHeight - clientHeight;
    const trackHeight = scrollContainer.clientHeight;
    const thumbHeight = scrollThumb.offsetHeight;
    const maxThumbTop = trackHeight - thumbHeight;
    
    // Prevent divide by zero
    if (maxScroll <= 0 || maxThumbTop <= 0) return;
    
    const scrollRatio = scrollTop / maxScroll;
    const thumbTop = scrollRatio * maxThumbTop;
    scrollThumb.style.top = `${thumbTop}px`;
  };

  scrollWrapper.addEventListener("scroll", () => {
    if (!isDragging) updateScrollbar();
  });

  const onDrag = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const deltaY = clientY - startY;
    
    const { scrollHeight, clientHeight } = scrollWrapper;
    const maxScroll = scrollHeight - clientHeight;
    const trackHeight = scrollContainer.clientHeight;
    const thumbHeight = scrollThumb.offsetHeight;
    const maxThumbTop = trackHeight - thumbHeight;
    
    if (maxScroll <= 0 || maxThumbTop <= 0) return;

    const newThumbTop = Math.min(Math.max(0, (startScrollTop / maxScroll * maxThumbTop) + deltaY), maxThumbTop);
    const scrollRatio = newThumbTop / maxThumbTop;
    
    scrollWrapper.scrollTop = scrollRatio * maxScroll;
  };

  const stopDrag = () => {
    isDragging = false;
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
    document.removeEventListener("touchmove", onDrag);
    document.removeEventListener("touchend", stopDrag);
    document.body.style.userSelect = ""; // Restore selection
  };

  const startDrag = (e) => {
    if (e.cancelable) e.preventDefault();
    isDragging = true;
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    startScrollTop = scrollWrapper.scrollTop;
    document.body.style.userSelect = "none"; // Prevent text selection while dragging
    
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", stopDrag);
    document.addEventListener("touchmove", onDrag, { passive: false });
    document.addEventListener("touchend", stopDrag);
  };

  scrollThumb.addEventListener("mousedown", startDrag);
  scrollThumb.addEventListener("touchstart", startDrag, { passive: false });

  window.addEventListener("resize", updateScrollbar);
  
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => updateScrollbar());
    ro.observe(scrollWrapper);
    const formBox = scrollWrapper.querySelector('.forms-container');
    if (formBox) ro.observe(formBox);
  }
}
