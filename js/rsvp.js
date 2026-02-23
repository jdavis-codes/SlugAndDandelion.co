import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const rsvpForm = document.getElementById("rsvp-form");
const commentForm = document.getElementById("comment-form");
const attendeeList = document.getElementById("attendee-list");
const commentList = document.getElementById("comment-list");
const rsvpStatus = document.getElementById("rsvp-status");
const commentStatus = document.getElementById("comment-status");
const loginGate = document.getElementById("login-gate");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const portalContent = document.getElementById("portal-content");
const logoutLink = document.getElementById("portal-logout");

const cfg = window.SD_CONFIG || {};
let supabase = null;
let handlersWired = false;

if (logoutLink) {
  logoutLink.addEventListener("click", (event) => {
    event.preventDefault();
    sessionStorage.removeItem("sd_portal_pass");
    window.location.reload();
  });
}

// On load, check if we already have the password in session
const savedPass = sessionStorage.getItem("sd_portal_pass");
if (savedPass) {
  initPortal(savedPass);
}

if (loginForm) {
  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const passInput = document.getElementById("portal-password");
    const pass = passInput ? passInput.value : "";
    initPortal(pass);
  });
}

async function initPortal(pass) {
  const normalizedPass = String(pass || "").trim();

  if (!normalizedPass) {
    if (loginError) loginError.textContent = "Enter the authorization code.";
    return;
  }

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    if (loginError) loginError.textContent = "Supabase config missing.";
    return;
  }

  if (loginError) loginError.textContent = "Verifying...";

  // Create client with the password in a custom header
  supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    global: {
      headers: { "x-portal-password": normalizedPass }
    }
  });

  // Verify the password by trying to fetch one row
  const { error } = await supabase.from("rsvps").select("id").limit(1);
  
  if (error) {
    if (loginError) loginError.textContent = "INVALID AUTHORIZATION CODE.";
    sessionStorage.removeItem("sd_portal_pass");
  } else {
    // Success! Show content and save pass
    sessionStorage.setItem("sd_portal_pass", normalizedPass);
    if (loginGate) loginGate.style.display = "none";
    if (portalContent) portalContent.style.display = "table";
    if (loginError) loginError.textContent = "";
    wireHandlers(supabase);
    refreshAll(supabase);
  }
}

function wireHandlers(supabase) {
  if (handlersWired) return;
  handlersWired = true;

  if (!rsvpForm || !commentForm || !rsvpStatus || !commentStatus) {
    return;
  }

  rsvpForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    rsvpStatus.textContent = "Submitting RSVP...";

    const formData = new FormData(rsvpForm);
    const payload = {
      name: String(formData.get("name") || "").trim(),
      email: normalizeOptional(formData.get("email")),
      attending: String(formData.get("attending") || "maybe"),
      guests: Math.min(Number(formData.get("guests") || 0), 1),
      message: normalizeOptional(formData.get("message"))
    };
    // Include number of wishes (detached petals) the user has cast this session
    try {
      const wishes = Number(localStorage.getItem('dandelion_total_wishes_v1') || 0);
      payload.wishes = wishes;
    } catch (e) { /* ignore */ }

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
    .select("name, attending, guests, message, wishes")
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

    const info = document.createElement('span');
    info.className = 'attendee-info';
    info.textContent = `${row.name} (${row.attending}, +${row.guests})${messageSuffix}`;

    // Seed line for wishes: one horizontal packed row of seed svgs
    const seedLine = document.createElement('span');
    seedLine.className = 'seed-line';

    // seed head image (stays behind when seeds are gone)
    const head = document.createElement('img');
    head.className = 'seed-head';
    head.src = 'assets/dandelion_dried_seed_head.svg';
    head.alt = '';
    seedLine.appendChild(head);

    const wishes = Number(row.wishes || 0);
    const count = Math.max(0, wishes);
    const seedSrc = 'assets/single_dandelion_seed.svg';

    // Append info + seed container first so we can measure available width
    item.appendChild(info);
    item.appendChild(seedLine);
    attendeeList.appendChild(item);

    if (count <= 0) {
      // no seeds — mark head as released and leave it visible
      head.classList.remove('swaying');
      head.classList.add('released');
      continue;
    }

    // Measure available width for the seed row (fall back to 120px)
    const lineWidth = Math.max(0, seedLine.getBoundingClientRect().width || item.clientWidth || 120);

    // Compute a seed height that aims to be roughly twice the previous visual size,
    // but allow it to shrink when there are many seeds so they still fit horizontally.
    const computedHeight = Math.floor((lineWidth / Math.max(1, count)) * 0.9);
    const seedHeight = Math.max(28, Math.min(80, computedHeight)); // enforce min height ~28px

    // size the head proportionally (about twice the seed height)
    head.style.height = `${Math.min(160, Math.max(40, Math.floor(seedHeight * 1.9)))}px`;
    head.style.width = 'auto';
    head.classList.remove('released');
    head.classList.add('swaying');

    for (let i = 0; i < count; i++) {
      const img = document.createElement('img');
      img.src = seedSrc;
      img.alt = '';
      img.className = 'seed';
      // enforce a consistent height for all seeds so they line up; width auto preserves aspect ratio
      img.style.height = `${seedHeight}px`;
      img.style.width = 'auto';

      // Slight rotation variance
      const rot = (Math.random() * 10) - 5; // -20..+20deg
      const verticalOffset = Math.random() * 8 - 4; // -2..+2px
      img.style.marginTop = `${verticalOffset}px`;
      img.style.transform = `rotate(${rot}deg)`;
      seedLine.appendChild(img);
    }
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
