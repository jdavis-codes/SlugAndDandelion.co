import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const counterEl = document.getElementById("visitor-counter");
if (!counterEl) {
  throw new Error("Missing visitor counter element.");
}

const cfg = window.SD_CONFIG || {};
const sessionKey = "sd_counter_counted";

renderCounter(0);

if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
  const localCount = Number(localStorage.getItem("sd_local_counter") || "0") + 1;
  localStorage.setItem("sd_local_counter", String(localCount));
  renderCounter(localCount);
} else {
  const supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  initCounter(supabase);
}

async function initCounter(supabase) {
  const hasCounted = sessionStorage.getItem(sessionKey) === "1";

  if (!hasCounted) {
    const { data, error } = await supabase.rpc("increment_site_counter");
    if (!error && typeof data === "number") {
      sessionStorage.setItem(sessionKey, "1");
      renderCounter(data);
      return;
    }
  }

  const { data } = await supabase.rpc("get_site_counter");
  if (typeof data === "number") {
    renderCounter(data);
  }
}

function renderCounter(value) {
  const safeValue = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  counterEl.textContent = String(safeValue).padStart(6, "0");
}
