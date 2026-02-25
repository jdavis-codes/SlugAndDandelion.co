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
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
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
    // Include wishes released (total petals blown) and caught this session
    try {
      payload.wishes_released = Number(localStorage.getItem('dandelion_total_wishes_v1') || 0);
      payload.wishes_caught    = Number(localStorage.getItem('dandelion_caught_wishes_v1')  || 0);
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
      name:    String(formData.get("name")    || "").trim(),
      comment: String(formData.get("comment") || "").trim()
    };
    // Log wishes released and caught at time of guestbook submission
    try {
      payload.wishes_released = Number(localStorage.getItem('dandelion_total_wishes_v1') || 0);
      payload.wishes_caught   = Number(localStorage.getItem('dandelion_caught_wishes_v1')  || 0);
    } catch (e) { /* ignore */ }

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
    .select("name, attending, guests, message, wishes_released, wishes_caught")
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
    const messageSuffix = row.message ? ` — "${row.message}"` : "";
    item.textContent = `${row.name} (${row.attending}, +${row.guests})${messageSuffix}`;
    attendeeList.appendChild(item);
  });
}

async function refreshComments(supabase) {
  commentList.innerHTML = "<li>Loading...</li>";
  const { data, error } = await supabase
    .from("comments")
    .select("name, comment, wishes_caught")
    .order("wishes_caught", { ascending: false })
    .order("created_at",   { ascending: false })
    .limit(100);

  if (error) {
    commentList.innerHTML = `<li>Could not load comments: ${error.message}</li>`;
    return;
  }

  if (!data.length) {
    commentList.innerHTML = "<li>No comments yet.</li>";
    return;
  }

  const seedSrc = 'assets/single_dandelion_seed.svg';

  commentList.innerHTML = "";
  data.forEach((row, index) => {
    const item = document.createElement("li");

    const info = document.createElement('span');
    info.className = 'attendee-info';
    const rank = index + 1;
    info.textContent = `#${rank} ${row.name}: ${row.comment}`;
    item.appendChild(info);

    // Seed row showing number of wishes caught
    const caught = Math.max(0, Number(row.wishes_caught || 0));
    if (caught > 0) {
      const seedLine = document.createElement('span');
      seedLine.className = 'seed-line';
      item.appendChild(seedLine);
      commentList.appendChild(item);

      // const lineWidth = Math.max(0, seedLine.getBoundingClientRect().width || item.clientWidth || 120);
      // const computedHeight = Math.floor((lineWidth / Math.max(1, caught)) * 0.1);
      const seedHeight = 21;

      for (let i = 0; i < caught; i++) {
        const img = document.createElement('img');
        img.src = seedSrc;
        img.alt = '';
        img.className = 'seed';
        img.style.height = `${seedHeight}px`;
        img.style.width = 'auto';
        const rot = (Math.random() * 10) - 5;
        const verticalOffset = Math.random() * 8 - 4;
        img.style.marginTop = `${verticalOffset}px`;
        img.style.transform = `rotate(${rot}deg)`;
        seedLine.appendChild(img);
      }
    } else {
      commentList.appendChild(item);
    }
  });
}

function normalizeOptional(value) {
  const text = String(value || "").trim();
  return text.length ? text : null;
}
