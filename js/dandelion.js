(async function () {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Generate or load persisted dandelion positions (percent across garden)
  const STORAGE_KEY = 'dandelion_positions_v1';
  const NUM_DANDELIONS = 8;
  let positions = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === NUM_DANDELIONS) {
        positions = parsed;
      }
    }
  } catch (e) {
    positions = [];
  }

  if (positions.length === 0) {
    // generate non-overlapping positions between 6% and 94%
    const min = 6;
    const max = 94;
    const minSpacing = 8; // percent
    while (positions.length < NUM_DANDELIONS) {
      const candidate = Math.round((min + Math.random() * (max - min)) * 100) / 100;
      if (!positions.some(p => Math.abs(p - candidate) < minSpacing)) positions.push(candidate);
    }
    positions.sort((a, b) => a - b);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(positions)); } catch (e) {}
  }

  // Persistence keys
  const RELEASE_KEY = 'dandelion_released_v2'; // v2 stores timestamps
  const TOTAL_KEY = 'dandelion_total_wishes_v1';
  const CAUGHT_KEY = 'dandelion_caught_wishes_v1';
  const WISHBOX_REVEAL_KEY = 'dandelion_wishbox_revealed_v1';

  // Tunable configuration for the dandelion animation
  const CONFIG = {
    FADE_DURATION_MS: 7000, // ms
    SWAY: {
      period: 1200, // ms (base period used in sway timing)
      speedFactorMin: 1.1, // unitless multiplier
      speedFactorMax: 2.1, // unitless multiplier
      amplitudeMin: 1, // px (local SVG units)
      amplitudeMax: 3, // px
      verticalAmplitudeMin: 1, // px
      verticalAmplitudeMax: 3, // px
      rotationAmplitudeMin: 6, // degrees
      rotationAmplitudeMax: 15 // degrees
    },
    SPRING: {
      STIFFNESS: 0.02, // unitless spring constant (per-frame integration)
      DAMPING: 0.86 // unitless damping multiplier
    },
    JOSTLE: {
      THRESHOLD: 50, // px (screen space)
      IMPULSE: 0.3 // unitless impulse multiplier
    },
    PETAL: {
      releaseVXRange: 0.01, // px per ms (horizontal velocity range magnitude)
      releaseVYBase: -0.012, // px per ms (vertical velocity base upward)
      releaseVYExtra: 0.006, // px per ms (additional random vertical component)
      gravity: 0.0000015, // px per ms^2
      spinBase: -0.008, // degrees per ms
      spinExtra: 0.01, // degrees per ms extra random
      SPRING_FACTOR: 0.9, // multiplier for per-petal spring stiffness
      DAMPING_FACTOR: 0.96 // multiplier for per-petal damping
    },
    CATCH: {
      HIT_RADIUS: 30,
      BOTTOM_BUFFER_PX: 120 // petals are catchable only when above (viewportHeight - BOTTOM_BUFFER_PX)
    }, // px (screen space)
    DEBUG: { SHOW_HITBOX: false } // show hit radius for detached petals
    ,
    FX: {
      SEED_FLY_MS: 1000, // ms for the seed flying animation when a wish is caught
      RIPPLE: {
        SIZE_PX: 44,       // px — initial diameter of the catch ripple ring
        DURATION_MS: 620,  // ms — expand + fade duration
        SCALE_END: 3.2,    // unitless — final scale multiplier
        COLOR: 'rgba(255, 252, 200, 0.92)' // ring border color
      }
    }
  };
  

    // Global registry of petal states for debug/hitbox visualization
    const ALL_PETAL_STATES = [];
    const WISH_SEED_ASSET = 'assets/single_dandelion_seed.svg';

    const wishBoxEl = document.getElementById('wish-box') || document.querySelector('.wish-box');
    const wishCountEl = document.getElementById('wish-count');
    const wishSeedRowEl = document.getElementById('wish-seed-row');
    let wasWishBoxVisible = false;

    function hasWishBoxRevealed() {
      try {
        return localStorage.getItem(WISHBOX_REVEAL_KEY) === '1';
      } catch (e) {
        return false;
      }
    }

    function setWishBoxRevealed() {
      try {
        localStorage.setItem(WISHBOX_REVEAL_KEY, '1');
      } catch (e) {}
    }

    function getCaughtCount() {
      try {
        return Math.max(0, Number(localStorage.getItem(CAUGHT_KEY) || 0));
      } catch (e) {
        return 0;
      }
    }

    function renderWishBox() {
      if (!wishBoxEl || !wishCountEl || !wishSeedRowEl) return;
      const count = getCaughtCount();
      const isVisible = count >= 1;
      wishBoxEl.hidden = !isVisible;

      if (isVisible && !wasWishBoxVisible && !hasWishBoxRevealed()) {
        wishBoxEl.classList.remove('reveal-bounce');
        void wishBoxEl.offsetWidth;
        wishBoxEl.classList.add('reveal-bounce');
        setWishBoxRevealed();
      }

      wasWishBoxVisible = isVisible;
      wishCountEl.textContent = String(count);

      wishSeedRowEl.innerHTML = '';
      const visualCount = Math.min(count, 140);
      for (let i = 0; i < visualCount; i++) {
        const seed = document.createElement('img');
        seed.src = WISH_SEED_ASSET;
        seed.alt = '';
        const rot = (Math.random() * 10) - 5;
        seed.style.transform = `rotate(${rot}deg)`;
        wishSeedRowEl.appendChild(seed);
      }
    }

    function animateSeedToWishBox(fromX, fromY) {
      if (!wishSeedRowEl) return;
      const targetRect = wishSeedRowEl.getBoundingClientRect();

      // If seed row has no visible layout yet, fall back to wish-box center.
      const fallbackRect = wishBoxEl ? wishBoxEl.getBoundingClientRect() : targetRect;
      const usableRect = (targetRect.width > 0 && targetRect.height > 0) ? targetRect : fallbackRect;
      const toX = usableRect.left + usableRect.width / 2;
      const toY = usableRect.top + usableRect.height / 2;

      const flyer = document.createElement('img');
      flyer.src = WISH_SEED_ASSET;
      flyer.alt = '';
      Object.assign(flyer.style, {
        position: 'fixed',
        left: `${fromX}px`,
        top: `${fromY}px`,
        width: '18px',
        height: 'auto',
        zIndex: '10001',
        pointerEvents: 'none',
        transform: `translate(-50%, -50%) rotate(${(Math.random() * 20) - 10}deg)`,
        transition: `left ${CONFIG.FX.SEED_FLY_MS}ms ease-in, top ${CONFIG.FX.SEED_FLY_MS}ms ease-in, opacity ${CONFIG.FX.SEED_FLY_MS}ms ease-in, transform ${CONFIG.FX.SEED_FLY_MS}ms ease-in`
      });
      document.body.appendChild(flyer);

      requestAnimationFrame(() => {
        flyer.style.left = `${toX}px`;
        flyer.style.top = `${toY}px`;
        flyer.style.opacity = '1.0';
        flyer.style.transform = 'translate(-50%, -50%) scale(0.7) rotate(45deg)';
      });

      setTimeout(() => {
        try { document.body.removeChild(flyer); } catch (e) {}
      }, CONFIG.FX.SEED_FLY_MS + 40);
    }

    // Hitbox overlay element (shared)
    let hitboxOverlay = null;
    if (CONFIG.DEBUG.SHOW_HITBOX) {
      hitboxOverlay = document.createElement('div');
      Object.assign(hitboxOverlay.style, {
        position: 'fixed',
        left: '0px',
        top: '0px',
        width: `${CONFIG.CATCH.HIT_RADIUS * 2}px`,
        height: `${CONFIG.CATCH.HIT_RADIUS * 2}px`,
        margin: '0',
        borderRadius: '50%',
        border: '2px solid rgba(255,0,0,0.9)',
        background: 'rgba(255,0,0,0.08)',
        pointerEvents: 'none',
        transform: 'translate(-50%,-50%)',
        transition: 'opacity 120ms ease',
        opacity: '0',
        zIndex: '9999'
      });
      document.body.appendChild(hitboxOverlay);

      document.addEventListener('mousemove', (ev) => {
        try {
          let nearest = null;
          let nearestDist = Infinity;
          for (const entry of ALL_PETAL_STATES) {
            const s = entry.state;
            // consider only released and visible petals
            if (!s.released || s.caught) continue;
            if (s.element.style.opacity === '0') continue;
            const center = getPetalCenterOnScreen(s.element);
            const catchMaxY = window.innerHeight - CONFIG.CATCH.BOTTOM_BUFFER_PX;
            if (center.y > catchMaxY) continue;
            const cx = center.x;
            const cy = center.y;
            const dx = cx - ev.clientX;
            const dy = cy - ev.clientY;
            const dist = Math.hypot(dx, dy);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearest = { cx, cy, dist };
            }
          }

          if (nearest && nearest.dist <= CONFIG.CATCH.HIT_RADIUS) {
            hitboxOverlay.style.width = `${CONFIG.CATCH.HIT_RADIUS * 2}px`;
            hitboxOverlay.style.height = `${CONFIG.CATCH.HIT_RADIUS * 2}px`;
            hitboxOverlay.style.left = `${nearest.cx}px`;
            hitboxOverlay.style.top = `${nearest.cy}px`;
            hitboxOverlay.style.opacity = '1';
          } else {
            hitboxOverlay.style.opacity = '0';
          }
        } catch (e) {}
      });
    }

  // Prefer garden-inner if available
  const garden = document.querySelector('#garden-inner') || document.querySelector('#garden-box') || document.body;

  // Fetch SVG once and clone for each instance
  let svgText;
  try {
    const response = await fetch('assets/dandelion_dried_seed_head.svg');
    if (!response.ok) throw new Error('SVG not found');
    svgText = await response.text();
  } catch (err) {
    console.error('Failed to load dandelion SVG', err);
    return;
  }

  // Load persisted release map (array of arrays of timestamps)
  let releaseMap = [];
  try {
    const raw = localStorage.getItem(RELEASE_KEY);
    if (raw) releaseMap = JSON.parse(raw) || [];
  } catch (e) { releaseMap = []; }

  // Spawn an expanding-ring ripple at a screen position to confirm a catch
  function spawnCatchRipple(cx, cy) {
    try {
      const { SIZE_PX, DURATION_MS, SCALE_END, COLOR } = CONFIG.FX.RIPPLE;
      const ripple = document.createElement('div');
      ripple.className = 'catch-ripple';
      Object.assign(ripple.style, {
        left: (cx - SIZE_PX / 2) + 'px',
        top:  (cy - SIZE_PX / 2) + 'px',
        width:  SIZE_PX + 'px',
        height: SIZE_PX + 'px',
        animationDuration: DURATION_MS + 'ms',
        borderColor: COLOR
      });
      ripple.style.setProperty('--ripple-scale-end', SCALE_END);
      document.body.appendChild(ripple);
      setTimeout(() => { try { ripple.remove(); } catch (e) {} }, DURATION_MS + 80);
    } catch (e) {}
  }

  function getPetalCenterOnScreen(petalElement) {
    const rect = petalElement.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  function catchDetachedPetal(entry) {
    const state = entry.state;
    if (!state.released || state.caught) return false;
    if (state.element.style.opacity === '0') return false;

    let centerX = 0;
    let centerY = 0;
    try {
      const center = getPetalCenterOnScreen(state.element);
      centerX = center.x;
      centerY = center.y;
    } catch (e) {}

    state.caught = true;
    state.velocityX = 0;
    state.velocityY = 0;
    state.gravity = 0;
    state.spin = 0;
    state.springVelX = 0;
    state.springVelY = 0;
    state.element.style.opacity = '0';

    try {
      const cur = Number(localStorage.getItem(CAUGHT_KEY) || 0);
      const next = cur + 1;
      localStorage.setItem(CAUGHT_KEY, String(next));
      spawnCatchRipple(centerX, centerY);
      renderWishBox();
      // wait one frame so layout reflects newly shown wish box on first catch
      requestAnimationFrame(() => {
        animateSeedToWishBox(centerX, centerY);
      });
    } catch (e) {}

    return true;
  }

  function tryCatchPetalAt(clientX, clientY) {
    let nearestEntry = null;
    let nearestDist = Infinity;

    for (const entry of ALL_PETAL_STATES) {
      const state = entry.state;
      if (!state.released || state.caught) continue;
      if (state.element.style.opacity === '0') continue;

      const center = getPetalCenterOnScreen(state.element);
      const catchMaxY = window.innerHeight - CONFIG.CATCH.BOTTOM_BUFFER_PX;
      if (center.y > catchMaxY) continue;
      const dist = Math.hypot(center.x - clientX, center.y - clientY);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestEntry = entry;
      }
    }

    if (nearestEntry && nearestDist <= CONFIG.CATCH.HIT_RADIUS) {
      return catchDetachedPetal(nearestEntry);
    }
    return false;
  }

  // Capture clicks globally so hit-radius catching works even when clicking
  // just outside the exact SVG geometry, and prevent releasing a new petal.
  document.addEventListener('click', (ev) => {
    try {
      const didCatch = tryCatchPetalAt(ev.clientX, ev.clientY);
      if (!didCatch) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (hitboxOverlay) hitboxOverlay.style.opacity = '0';
    } catch (e) {}
  }, true);

  // Legacy migration: if user already has caught wishes, don't replay first-catch bounce.
  if (getCaughtCount() > 0 && !hasWishBoxRevealed()) {
    setWishBoxRevealed();
  }

  renderWishBox();

  // Create instances
  // global mouse for jostle
  const mousePos = { x: -9999, y: -9999, t: 0 };
  document.addEventListener('mousemove', (e) => { mousePos.x = e.clientX; mousePos.y = e.clientY; mousePos.t = performance.now(); });

  positions.forEach((pos, idx) => {
    const container = document.createElement('div');
    container.className = 'dandelion-container';
    container.style.position = 'absolute';
    container.style.left = pos + '%';
    container.style.right = 'auto';
    container.style.bottom = '0px';
    container.style.transform = 'translateX(-50%)';
    container.style.cursor = 'pointer';
    container.title = 'Make a wish';
    container.innerHTML = svgText;
    garden.appendChild(container);
    initDandelion(container, idx, releaseMap[idx] || []);
  });

  function initDandelion(container, idx, persistedTimestamps = []) {
    // fade duration (ms)
    // uses CONFIG.FADE_DURATION_MS

    try {
      const svg = container.querySelector('svg');
      if (!svg) return;

      // Render sizing
      svg.setAttribute('width', '120px');
      svg.style.height = 'auto';
      svg.style.overflow = 'visible';
      // Rotate around the base (bottom center) for natural sway
      svg.style.transformOrigin = '50% 100%';
      svg.style.willChange = 'transform';

      // Find elements inside this svg instance
      const stemGroup = svg.querySelector('[id="stem"]') || svg.querySelector('#stem');
      const stem = stemGroup ? stemGroup.querySelector('path') : null;
      const petals = Array.from(svg.querySelectorAll('[inkscape\\:label="petal"]'));

      // Seed head element (should move with attached seeds)
      const seedHead = svg.querySelector('[inkscape\\:label="seed_head"]') || svg.querySelector('#seed_head');
      const seedHeadBaseTransform = seedHead ? seedHead.getAttribute('transform') || '' : '';

      if (!stemGroup || !stem || petals.length === 0) {
        console.error('Could not find stem or petals in SVG instance');
        return;
      }

      // Move stem layer to back within this SVG instance
      const stemLayer = stemGroup.closest('[inkscape\\:groupmode="layer"]') || stemGroup;
      if (stemLayer.parentNode) stemLayer.parentNode.prepend(stemLayer);

      // Safe matrix extraction
      const cons = stemGroup.transform && stemGroup.transform.baseVal && stemGroup.transform.baseVal.consolidate ? stemGroup.transform.baseVal.consolidate() : null;
      const matrix = cons ? cons.matrix : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      const { a, b, c, d } = matrix;

      // Per-instance sway configuration (gives each dandelion unique motion)
      const swayConfig = {
        speedFactor: CONFIG.SWAY.speedFactorMin + Math.random() * (CONFIG.SWAY.speedFactorMax - CONFIG.SWAY.speedFactorMin),
        amplitude: CONFIG.SWAY.amplitudeMin + Math.random() * (CONFIG.SWAY.amplitudeMax - CONFIG.SWAY.amplitudeMin),
        verticalAmplitude: CONFIG.SWAY.verticalAmplitudeMin + Math.random() * (CONFIG.SWAY.verticalAmplitudeMax - CONFIG.SWAY.verticalAmplitudeMin),
        phase: Math.random() * Math.PI * 2,
        rotationAmplitude: CONFIG.SWAY.rotationAmplitudeMin + Math.random() * (CONFIG.SWAY.rotationAmplitudeMax - CONFIG.SWAY.rotationAmplitudeMin)
      };

      // Parse stem path
      const originalD = stem.getAttribute('d') || '';
      const pathData = originalD.split(/[ ,c]+/);
      if (pathData.length < 9) {
        console.error('Unexpected stem path format');
        return;
      }

      // Start point (tip/head in local space)
      const startX = parseFloat(pathData[1]);
      const startY = parseFloat(pathData[2]);

      // Relative curve offsets
      const relC1X = parseFloat(pathData[3]);
      const relC1Y = parseFloat(pathData[4]);
      const relC2X = parseFloat(pathData[5]);
      const relC2Y = parseFloat(pathData[6]);
      const relEndX = parseFloat(pathData[7]);
      const relEndY = parseFloat(pathData[8]);

      // Per-petal state
      const petalStates = petals.map(petal => ({
        element: petal,
        baseTransform: petal.getAttribute('transform') || '',
        released: false,
        caught: false,
        releasedAt: 0,
        anchorX: 0,
        anchorY: 0,
        velocityX: 0,
        velocityY: 0,
        gravity: 0,
        spin: 0,
        phase: Math.random() * Math.PI * 2,
        // per-petal spring state so released petals jostle independently
        springX: 0,
        springY: 0,
        springVelX: 0,
        springVelY: 0,
        springInitialized: false
      }));

      // register petal states globally for debug/hitbox visualization
      for (const st of petalStates) {
        ALL_PETAL_STATES.push({ state: st, container, svg });
      }

      petalStates.forEach(state => {
        try {
          state.element.style.cursor = 'pointer';
        } catch (e) {}
      });

      // If we have persisted release timestamps for this instance, apply them
      if (Array.isArray(persistedTimestamps) && persistedTimestamps.length) {
        const now = Date.now();
        for (let i = 0; i < petalStates.length && i < persistedTimestamps.length; i++) {
          const releaseTime = persistedTimestamps[i];
          if (releaseTime > 0) {
            const age = now - releaseTime;
            const st = petalStates[i];

            if (age > CONFIG.FADE_DURATION_MS) {
              // Petal is old and fully faded, just hide it
              st.element.style.opacity = '0';
              st.released = true; // Mark as released so it doesn't get re-attached
            } else {
              // Petal was released recently, resume its animation
              st.released = true;
              st.releasedAt = performance.now() - age; // Set animation start time in the past
              st.anchorX = 0; // Can't know original anchor, start from center
              st.anchorY = 0;
              st.springX = 0;
              st.springY = 0;
              st.springVelX = 0;
              st.springVelY = 0;
              st.springInitialized = false;
              st.velocityX = (Math.random() - 0.5) * CONFIG.PETAL.releaseVXRange;
              st.velocityY = CONFIG.PETAL.releaseVYBase - Math.random() * CONFIG.PETAL.releaseVYExtra;
              st.gravity = CONFIG.PETAL.gravity;
              st.spin = CONFIG.PETAL.spinBase - Math.random() * CONFIG.PETAL.spinExtra; // Your updated spin logic
            }
          }
        }
      }

      let lastAttachedDX = 0;
      let lastAttachedDY = 0;
      let frozenTargetX = 0;
      let frozenTargetY = 0;

      // Spring state for seed-head jostle
      let springX = 0;
      let springY = 0;
      let springVelX = 0;
      let springVelY = 0;

      function releaseOnePetal() {
        for (let i = petalStates.length - 1; i >= 0; i -= 1) {
          const state = petalStates[i];
          if (!state.released) {
            state.released = true;
            state.releasedAt = performance.now();
            const releaseTime = Date.now();
            
            // record the springed head position as the anchor so released petals keep current offset
            state.anchorX = (typeof springX === 'number' && !isNaN(springX)) ? springX : lastAttachedDX;
            state.anchorY = (typeof springY === 'number' && !isNaN(springY)) ? springY : lastAttachedDY;
            // initialize per-petal spring at release
            state.springX = state.anchorX;
            state.springY = state.anchorY;
            state.springVelX = 0;
            state.springVelY = 0;
            state.springInitialized = true;
            // gentle left/right drift
            state.velocityX = (Math.random() - 0.5) * CONFIG.PETAL.releaseVXRange;
            // always upward drift
            state.velocityY = CONFIG.PETAL.releaseVYBase - Math.random() * CONFIG.PETAL.releaseVYExtra;
            // nearly zero gravity so they keep floating up
            state.gravity = CONFIG.PETAL.gravity;
            // Your updated spin logic
            state.spin = CONFIG.PETAL.spinBase - Math.random() * CONFIG.PETAL.spinExtra;

            // Persist this release timestamp in localStorage
            try {
              const raw = localStorage.getItem(RELEASE_KEY);
              const map = raw ? JSON.parse(raw) : [];
              map[idx] = map[idx] || Array(petalStates.length).fill(0);
              map[idx][i] = releaseTime;
              localStorage.setItem(RELEASE_KEY, JSON.stringify(map));
            } catch (e) {}

            // Increment total wishes and persist
            try {
              const cur = Number(localStorage.getItem(TOTAL_KEY) || 0);
              localStorage.setItem(TOTAL_KEY, String(cur + 1));
            } catch (e) {}

            // If that was the last attached petal, freeze the last head position
            if (petalStates.every(s => s.released)) {
              frozenTargetX = lastAttachedDX;
              frozenTargetY = lastAttachedDY;
            }

            return;
          }
        }
      }
      
      container.addEventListener('click', releaseOnePetal);

      function animate(time) {
        const swayAngle = time / (CONFIG.SWAY.period * swayConfig.speedFactor) + swayConfig.phase;

        // Local sway displacement (per-instance)
        const dX = Math.sin(swayAngle) * swayConfig.amplitude;
        const dY = (Math.cos(swayAngle * 2) - 1) * swayConfig.verticalAmplitude;

        // Convert the spring displacement (in document/screen space) back into
        // the stem's local coordinate space so we can bend the path without
        // moving the SVG root. Use the inverse of the 2x2 matrix [a c; b d].
        const det = a * d - b * c;
        let springLocalX = 0;
        let springLocalY = 0;
        if (det !== 0) {
          springLocalX = (d * springX - c * springY) / det;
          springLocalY = (-b * springX + a * springY) / det;
        }

        // total local displacement applied to the stem start (sway + spring)
        const totalLocalX = dX + springLocalX;
        const totalLocalY = dY + springLocalY;

        const currentStartX = startX + totalLocalX;
        const currentStartY = startY + totalLocalY;

        // Keep root fixed by inverting the relative end using the same total offset
        const currentRelEndX = relEndX - totalLocalX;
        const currentRelEndY = relEndY - totalLocalY;

        // Control points adjusted for natural bend; scale with amplitude
        const currentRelC1X = relC1X - totalLocalX * 0.7;
        const currentRelC1Y = relC1Y - totalLocalY * 0.8;
        const currentRelC2X = relC2X - totalLocalX * 0.35;
        const currentRelC2Y = relC2Y - totalLocalY * 0.25;

        const newD = `m ${currentStartX},${currentStartY} c ${currentRelC1X},${currentRelC1Y} ${currentRelC2X},${currentRelC2Y} ${currentRelEndX},${currentRelEndY}`;
        stem.setAttribute('d', newD);

        // Apply a gentle back-and-forth rotation to the whole SVG
        const rotationDeg = Math.sin(swayAngle) * swayConfig.rotationAmplitude;
        svg.style.transform = `rotate(${rotationDeg}deg)`;

        // Map local displacement into SVG/document coordinate space for petals
        const transformedDX = a * dX + c * dY;
        const transformedDY = b * dX + d * dY;
        lastAttachedDX = transformedDX;
        lastAttachedDY = transformedDY;


        const targetX = transformedDX
        const targetY = transformedDY

        // Initialize spring on first frame
        if (springX === 0 && springY === 0) {
          springX = targetX;
          springY = targetY;
        }

        // Jostle from recent mouse movement near the head
        if (seedHead) {
          try {
            const bbox = seedHead.getBBox();
            const pt = svg.createSVGPoint();
            pt.x = bbox.x + bbox.width / 2;
            pt.y = bbox.y + bbox.height / 2;
            const screenPt = pt.matrixTransform(seedHead.getScreenCTM());
            const dxMouse = screenPt.x - mousePos.x;
            const dyMouse = screenPt.y - mousePos.y;
            const dist = Math.hypot(dxMouse, dyMouse);
            if (dist > 0 && mousePos.t && (performance.now() - mousePos.t) < 250 && dist < CONFIG.JOSTLE.THRESHOLD) {
              const strength = (1 - dist / CONFIG.JOSTLE.THRESHOLD) * CONFIG.JOSTLE.IMPULSE;
              // impulse away from cursor
              springVelX += (dxMouse / dist) * strength;
              springVelY += (dyMouse / dist) * strength;
            }
          } catch (e) {}
        }

        // Spring integration for the seed head
        const dxSpring = targetX - springX;
        const dySpring = targetY - springY;
        springVelX += dxSpring * CONFIG.SPRING.STIFFNESS;
        springVelY += dySpring * CONFIG.SPRING.STIFFNESS;
        springVelX *= CONFIG.SPRING.DAMPING;
        springVelY *= CONFIG.SPRING.DAMPING;
        springX += springVelX;
        springY += springVelY;

        // Move the seed head using springed values so it can jostle
        if (seedHead) {
          seedHead.setAttribute('transform', `${seedHeadBaseTransform} translate(${springX}, ${springY})`);
        }

        petalStates.forEach(state => {
          if (!state.released) {
            state.element.style.opacity = '1';
            // attached petals follow the springed head so they jostle together
            state.element.setAttribute('transform', `${state.baseTransform} translate(${springX}, ${springY})`);
            return;
          }

          // caught petals remain at their current transform and stop moving
          if (state.caught) {
            return;
          }

          // Don't re-animate petals that were hidden on load
          if (state.element.style.opacity === '0') return;

          const elapsed = time - state.releasedAt;
          const driftX = state.velocityX * elapsed + Math.sin(elapsed / 400 + state.phase) * 1;
          const driftY = state.velocityY * elapsed + state.gravity * elapsed * elapsed;
          const rotation = state.spin * elapsed;
          const opacity = Math.max(0, 1 - elapsed / CONFIG.FADE_DURATION_MS);

          // target for this released petal (anchor + its own drift)
          const petalTargetX = state.anchorX + driftX;
          const petalTargetY = state.anchorY + driftY;

          // initialize per-petal spring if needed
          if (!state.springInitialized) {
            state.springX = petalTargetX;
            state.springY = petalTargetY;
            state.springInitialized = true;
          }

          // per-petal jostle from mouse
          try {
            const pbbox = state.element.getBBox();
            const ppt = svg.createSVGPoint();
            ppt.x = pbbox.x + pbbox.width / 2;
            ppt.y = pbbox.y + pbbox.height / 2;
            const pscreen = ppt.matrixTransform(state.element.getScreenCTM());
            const mdx = pscreen.x - mousePos.x;
            const mdy = pscreen.y - mousePos.y;
            const pdist = Math.hypot(mdx, mdy);
            if (pdist > 0 && mousePos.t && (performance.now() - mousePos.t) < 250 && pdist < CONFIG.JOSTLE.THRESHOLD) {
              const pstrength = (1 - pdist / CONFIG.JOSTLE.THRESHOLD) * CONFIG.JOSTLE.IMPULSE;
              state.springVelX += (mdx / pdist) * pstrength;
              state.springVelY += (mdy / pdist) * pstrength;
            }
          } catch (e) {}

          // per-petal spring integration
          const pdx = petalTargetX - state.springX;
          const pdy = petalTargetY - state.springY;
          state.springVelX += pdx * (CONFIG.SPRING.STIFFNESS * CONFIG.PETAL.SPRING_FACTOR);
          state.springVelY += pdy * (CONFIG.SPRING.STIFFNESS * CONFIG.PETAL.SPRING_FACTOR);
          state.springVelX *= (CONFIG.SPRING.DAMPING * CONFIG.PETAL.DAMPING_FACTOR);
          state.springVelY *= (CONFIG.SPRING.DAMPING * CONFIG.PETAL.DAMPING_FACTOR);
          state.springX += state.springVelX;
          state.springY += state.springVelY;

          state.element.style.opacity = String(opacity);
          state.element.setAttribute(
            'transform',
            `${state.baseTransform} translate(${state.springX}, ${state.springY}) rotate(${rotation})`
          );
        });

        requestAnimationFrame(animate);
      }
      
      requestAnimationFrame(animate);
    } catch (err) {
      console.error('Dandelion instance init failed', err);
    }
  }
})();
