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
    const FADE_DURATION_MS = 7000;

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
        speedFactor: 1.1 + Math.random() * 1.0, // slower or faster
        amplitude: 1 + Math.random() * 2, // horizontal sway magnitude
        verticalAmplitude: 1 + Math.random() * 2, // vertical sway magnitude
        phase: Math.random() * Math.PI * 2,
        rotationAmplitude: 10 + Math.random() * 5 // degrees for back-and-forth rotation
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

      // If we have persisted release timestamps for this instance, apply them
      if (Array.isArray(persistedTimestamps) && persistedTimestamps.length) {
        const now = Date.now();
        for (let i = 0; i < petalStates.length && i < persistedTimestamps.length; i++) {
          const releaseTime = persistedTimestamps[i];
          if (releaseTime > 0) {
            const age = now - releaseTime;
            const st = petalStates[i];

            if (age > FADE_DURATION_MS) {
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
              st.velocityX = (Math.random() - 0.5) * 0.01;
              st.velocityY = -0.012 - Math.random() * 0.006;
              st.gravity = 0.0000015;
              st.spin = -0.008 - Math.random() * 0.01; // Your updated spin logic
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
      const SPRING_STIFFNESS = 0.02;
      const SPRING_DAMPING = 0.86;
      const JOSTLE_THRESHOLD = 100; // pixels
      const JOSTLE_IMPULSE = 0.9;

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
            state.velocityX = (Math.random() - 0.5) * 0.01;
            // always upward drift
            state.velocityY = -0.012 - Math.random() * 0.006;
            // nearly zero gravity so they keep floating up
            state.gravity = 0.0000015;
            // Your updated spin logic
            state.spin = -0.008 - Math.random() * 0.01;

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
        const swayAngle = time / (1200 * swayConfig.speedFactor) + swayConfig.phase;

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
            if (dist > 0 && mousePos.t && (performance.now() - mousePos.t) < 250 && dist < JOSTLE_THRESHOLD) {
              const strength = (1 - dist / JOSTLE_THRESHOLD) * JOSTLE_IMPULSE;
              // impulse away from cursor
              springVelX += (dxMouse / dist) * strength;
              springVelY += (dyMouse / dist) * strength;
            }
          } catch (e) {}
        }

        // Spring integration for the seed head
        const dxSpring = targetX - springX;
        const dySpring = targetY - springY;
        springVelX += dxSpring * SPRING_STIFFNESS;
        springVelY += dySpring * SPRING_STIFFNESS;
        springVelX *= SPRING_DAMPING;
        springVelY *= SPRING_DAMPING;
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

          // Don't re-animate petals that were hidden on load
          if (state.element.style.opacity === '0') return;

          const elapsed = time - state.releasedAt;
          const driftX = state.velocityX * elapsed + Math.sin(elapsed / 400 + state.phase) * 1;
          const driftY = state.velocityY * elapsed + state.gravity * elapsed * elapsed;
          const rotation = state.spin * elapsed;
          const opacity = Math.max(0, 1 - elapsed / FADE_DURATION_MS);

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
            if (pdist > 0 && mousePos.t && (performance.now() - mousePos.t) < 250 && pdist < JOSTLE_THRESHOLD) {
              const pstrength = (1 - pdist / JOSTLE_THRESHOLD) * JOSTLE_IMPULSE;
              state.springVelX += (mdx / pdist) * pstrength;
              state.springVelY += (mdy / pdist) * pstrength;
            }
          } catch (e) {}

          // per-petal spring integration
          const pdx = petalTargetX - state.springX;
          const pdy = petalTargetY - state.springY;
          state.springVelX += pdx * (SPRING_STIFFNESS * 0.9);
          state.springVelY += pdy * (SPRING_STIFFNESS * 0.9);
          state.springVelX *= (SPRING_DAMPING * 0.96);
          state.springVelY *= (SPRING_DAMPING * 0.96);
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
