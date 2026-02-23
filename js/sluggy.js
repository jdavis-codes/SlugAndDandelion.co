(function () {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const sluggy = document.createElement("img");
  sluggy.src = "assets/sluggy.svg";
  sluggy.alt = "Sluggy";
  sluggy.className = "sluggy-runner";
  document.body.appendChild(sluggy);

  const hitbox = document.createElement("div");
  hitbox.className = "sluggy-hitbox";
  document.body.appendChild(hitbox);

  const bubble = document.createElement("div");
  bubble.className = "sluggy-bubble";
  bubble.setAttribute("aria-live", "polite");
  document.body.appendChild(bubble);

  const facts = [
    "Paper was invented in China around 105 CE.",
    "Most paper can be recycled 5 to 7 times before fibers get too short.",
    "The first paper mills in North America appeared in the late 1600s.",
    "Cardboard is made from layers of paper fiber for extra strength.",
    "Glossy paper uses a clay coating to make images look sharper.",
    "Acid-free paper lasts much longer for archives and books.",
    "A standard office ream usually means 500 sheets.",
    "Paper weight in gsm means grams per square meter.",
    "Early books were often handwritten on parchment, not paper.",
    "Modern tissue paper is engineered for softness and absorbency."
  ];

  let x = 18;
  let direction = 1;
  let speed = 0.4;

  let y = 0;
  let vy = 4.8;
  const gravity = 0.22;
  const bounceForce = 4.8;

  let squashPulse = 0;
  let slug_speed = 0.2;
  let slugWidth = 88;
  let slugHeight = 52;
  let paused = false;
  let lastFactIndex = -1;

  // ANIMATION MODE: Set to false to return to the bouncing behavior
  let isSlugMode = true; 
  let slugAngle = 0;
  
  // Transition state
  let isStopping = false;
  let stopFactor = 0;
  let popAnim = 0;
  let autoResumeTimer = null;
  let typeWriterInterval = null;

  function refreshSize() {
    const rect = sluggy.getBoundingClientRect();
    slugWidth = rect.width || 88;
    slugHeight = rect.height || 52;
    hitbox.style.width = `${slugWidth}px`;
  }

  function bubbleText() {
    if (facts.length === 1) {
      lastFactIndex = 0;
      return facts[0];
    }
    let idx = Math.floor(Math.random() * facts.length);
    while (idx === lastFactIndex) {
      idx = Math.floor(Math.random() * facts.length);
    }
    lastFactIndex = idx;
    return facts[idx];
  }

  function updateBubblePosition() {
    const bubbleWidth = bubble.offsetWidth || 260;
    const targetX = x + slugWidth / 2 - bubbleWidth / 2;
    const clampedX = Math.min(Math.max(8, targetX), window.innerWidth - bubbleWidth - 8);
    const bubbleBottom = 10 + slugHeight + y;

    bubble.style.left = `${clampedX}px`;
    bubble.style.bottom = `${bubbleBottom}px`;
  }

  function pauseWithFact() {
    paused = true;
    isStopping = false;
    y = 0;
    vy = 0;
    squashPulse = 0;
    
    const text = bubbleText();
    bubble.textContent = "";
    bubble.classList.add("show");
    
    if (typeWriterInterval) clearInterval(typeWriterInterval);
    if (autoResumeTimer) clearTimeout(autoResumeTimer);

    let charIndex = 0;
    // Typewriter effect
    typeWriterInterval = setInterval(() => {
      bubble.textContent += text.charAt(charIndex);
      charIndex++;
      updateBubblePosition(); // Recenter as width changes
      
      if (charIndex >= text.length) {
        clearInterval(typeWriterInterval);
        // Auto-resume after a delay (based on reading time)
        autoResumeTimer = setTimeout(resumeRun, 3000 + text.length * 30);
      }
    }, 25);
    
    updateBubblePosition();
  }

  function resumeRun() {
    paused = false;
    isStopping = false;
    bubble.classList.remove("show");
    vy = bounceForce * 0.75;
    
    if (typeWriterInterval) clearInterval(typeWriterInterval);
    if (autoResumeTimer) clearTimeout(autoResumeTimer);
  }

  function startStopping() {
    if (isStopping || paused) return;
    isStopping = true;
    stopFactor = 0.1;
    popAnim = 1.0;
  }

  function frame() {
    if (!paused) {
      const maxX = Math.max(0, window.innerWidth - slugWidth - 6);
      
      let effectiveSpeedScale = 1.0;
      if (isStopping) {
        stopFactor *= 0.95; // Decelerate
        popAnim *= 0.95;    // Fade pop effect
        effectiveSpeedScale = stopFactor;
        
        if (stopFactor < 0.02) {
            pauseWithFact();
            effectiveSpeedScale = 0;
        }
      }

      if (isSlugMode) {
        // SLUG MODE: Sinusoidal movement + Y-axis squash only
        // Slow down the cycle as we stop
        slugAngle += 0.15 * (slug_speed || 1) * effectiveSpeedScale; 
        
        // Cycle goes -1 to 1. We map this to a squash factor.
        // We want him to move when he is "stretching" out (getting flatter).
        const cycle = Math.sin(slugAngle);
        
        // sY oscillates between ~0.7 (flat) and 1.1 (tall)
        const sY = 0.9 - 0.2 * cycle; 
        
        // Move primarily when flattening (cycle increasing)
        // Using a clamped cosine to move only during one phase of the wiggle
        const movePhase = Math.cos(slugAngle);
        const moveSpeed = movePhase > 0 ? movePhase * (slug_speed || 1) * 2.2 * effectiveSpeedScale : 0;
        
        x += moveSpeed * direction;
        
        // Boundary check
        if (x <= 0) {
          x = 0;
          direction = 1;
        } else if (x >= maxX) {
          x = maxX;
          direction = -1;
        }
        
        y = 0; // Stay grounded
        
        const facingScale = direction > 0 ? 1 : -1;
        // Apply popAnim to scale: slightly wider and shorter when clicked (squish)
        const popScaleX = 1 + popAnim * 0.3;
        const popScaleY = 1 - popAnim * 0.2;
        
        sluggy.style.transform = `translate3d(${x}px, 0, 0) scale(${facingScale * popScaleX}, ${sY * popScaleY})`;
        
      } else {
        // BOUNCE MODE
        const currentMoveSpeed = speed * effectiveSpeedScale;
        x += currentMoveSpeed * direction;
        
        if (x <= 0) {
          x = 0;
          direction = 1;
          speed = 1.2 + Math.random() * 1.2;
        } else if (x >= maxX) {
          x = maxX;
          direction = -1;
          speed = 1.2 + Math.random() * 1.2;
        }

        y += vy;
        vy -= gravity;

        if (y <= 0) {
          y = 0;
          vy = bounceForce * (isStopping ? effectiveSpeedScale : 1.0); // Dampen bounce height if stopping
          squashPulse = 1;
        }
    startStopping();
        squashPulse *= 0.86;

        const airborneStretch = Math.min(0.18, y / 80);
        const squashX = 1 + 0.26 * squashPulse - airborneStretch * 0.3;
        const squashY = 1 - 0.22 * squashPulse + airborneStretch;
        const facingScale = direction > 0 ? 1 : -1;

        // Apply popAnim
        const popScaleX = 1 + popAnim * 0.3;
        const popScaleY = 1 - popAnim * 0.2;

        sluggy.style.transform = `translate3d(${x}px, ${-y}px, 0) scale(${facingScale * squashX * popScaleX}, ${squashY * popScaleY})`;
      }

      hitbox.style.transform = `translate3d(${x}px, 0, 0)`;
    }

    if (paused) {
      updateBubblePosition();
    }
    requestAnimationFrame(frame);
  }

  sluggy.addEventListener("load", refreshSize);
  window.addEventListener("resize", refreshSize);
  window.addEventListener("resize", updateBubblePosition);
  hitbox.addEventListener("click", () => {
    if (paused) {
      resumeRun();
      return;
    }
    startStopping();
  });

  refreshSize();
  requestAnimationFrame(frame);
})();
