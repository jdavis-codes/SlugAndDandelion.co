// Stadium favicon background scroller settings.
const ICON_URL = "assets/stadium_favicon.png";
const ROW_HEIGHT_PX = 100;
const ROW_SPACING_PX = 18;
const ICON_HORIZONTAL_SPACING_PX = 100;
const BASE_SPEED_PX_PER_SEC = 20;
const SPEED_STEP_PX_PER_SEC = 4;
const LAYER_OPACITY = 0.16;

async function createPaddedTileDataUrl(iconUrl, horizontalSpacingPx) {
  if (!Number.isFinite(horizontalSpacingPx) || horizontalSpacingPx <= 0) {
    return iconUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth + Math.round(horizontalSpacingPx);
        canvas.height = img.naturalHeight;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(iconUrl);
          return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch (_) {
        resolve(iconUrl);
      }
    };

    img.onerror = () => resolve(iconUrl);
    img.src = iconUrl;
  });
}

(async () => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tileImageUrl = await createPaddedTileDataUrl(ICON_URL, ICON_HORIZONTAL_SPACING_PX);

  const layer = document.createElement("div");
  layer.id = "stadium-favicon-bg";
  layer.setAttribute("aria-hidden", "true");
  layer.style.opacity = String(LAYER_OPACITY);
  document.body.prepend(layer);

  const rows = [];
  const stride = () => ROW_HEIGHT_PX + ROW_SPACING_PX;

  function buildRows() {
    rows.length = 0;
    layer.innerHTML = "";

    const total = Math.ceil(window.innerHeight / stride()) + 2;
    for (let i = 0; i < total; i += 1) {
      const row = document.createElement("div");
      row.className = "stadium-favicon-row";
      row.style.top = `${i * stride()}px`;
      row.style.height = `${ROW_HEIGHT_PX}px`;
      row.style.backgroundImage = `url("${tileImageUrl}")`;
      row.style.backgroundSize = `auto ${ROW_HEIGHT_PX}px`;

      layer.appendChild(row);

      rows.push({
        element: row,
        offset: 0,
        direction: i % 2 === 0 ? -1 : 1,
        speed: BASE_SPEED_PX_PER_SEC + ((i % 3) * SPEED_STEP_PX_PER_SEC),
      });
    }
  }

  buildRows();

  let previousTs = null;

  function animate(ts) {
    if (prefersReducedMotion) return;

    if (previousTs == null) {
      previousTs = ts;
      requestAnimationFrame(animate);
      return;
    }

    const deltaSeconds = (ts - previousTs) / 1000;
    previousTs = ts;

    for (const row of rows) {
      row.offset += row.direction * row.speed * deltaSeconds;
      row.element.style.backgroundPositionX = `${row.offset}px`;
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      previousTs = null;
      buildRows();
    }, 100);
  });
})();
