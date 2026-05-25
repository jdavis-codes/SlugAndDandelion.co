const keyEl = document.getElementById('movable-key');
const keyholeEl = document.getElementById('keyhole');

// Create several offset clones to fake a thicker edge when the key turns into the slot.
const keyThicknessLayers = Array.from({ length: 10 }, (_, index) => {
  const layer = keyEl.cloneNode(true);
  layer.removeAttribute('id');
  layer.style.cssText = keyEl.style.cssText;
  layer.style.width = getComputedStyle(keyEl).width;
  layer.style.position = 'absolute';
  layer.style.top = getComputedStyle(keyEl).top;
  layer.style.left = getComputedStyle(keyEl).left;
  layer.style.zIndex = String(5 + index);
  layer.style.pointerEvents = 'none';
  layer.style.filter = 'brightness(0.18)';
  layer.style.transformOrigin = '50% 10%';
  layer.style.display = 'none';
  keyEl.parentNode.insertBefore(layer, keyEl);
  return layer;
});

// Front-face proxy: shown head-on when the key is fully inserted.
const keyFrontEl = document.createElement('img');
keyFrontEl.src = 'assets/key_front.svg';
keyFrontEl.style.position = 'absolute';
keyFrontEl.style.height = '140px';
keyFrontEl.style.top = '50vh';
keyFrontEl.style.left = '50vw';
keyFrontEl.style.transformOrigin = '50% 50%';
keyFrontEl.style.zIndex = '20';
keyFrontEl.style.pointerEvents = 'none';
keyFrontEl.style.opacity = '0';
keyFrontEl.style.transition = 'opacity 0.35s ease';
keyFrontEl.draggable = false;
keyEl.parentNode.appendChild(keyFrontEl);

// Unlock state
let insertHeldStart = null;
let unlocking = false;
let unlockStartTime = null;
let unlocked = false;
let frontRotation = 0;

let transitioning = false;
let transitionStartTime = null;
let hasRedirected = false;
const TRANSITION_DURATION = 3000; // ms — page transition duration

const HOLD_BEFORE_UNLOCK = 1800; // ms — hold fully inserted before turning starts
const UNLOCK_DURATION    = 5000; // ms — time to rotate 180°

let isDragging = false;
let currentX;
let currentY;
let initialX;
let initialY;
let xOffset = 0;
let yOffset = 0;

let rotation = 0;
let rotationVelocity = 0;
let lastX = 0;
let insertDepth = 0;  // 0 = normal, 1 = fully inserted (rotated into keyhole)
let insertTarget = 0;

keyEl.addEventListener('mousedown', dragStart);
document.addEventListener('mousemove', drag);
document.addEventListener('mouseup', dragEnd);

// Touch support
keyEl.addEventListener('touchstart', dragStart, { passive: false });
document.addEventListener('touchmove', drag, { passive: false });
document.addEventListener('touchend', dragEnd);

function dragStart(e) {
  if (e.type === 'touchstart') {
    initialX = e.touches[0].clientX - xOffset;
    initialY = e.touches[0].clientY - yOffset;
    lastX = e.touches[0].clientX;
  } else {
    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;
    lastX = e.clientX;
  }

  if (e.target === keyEl) {
    isDragging = true;
    keyEl.style.cursor = 'grabbing';
    keyEl.classList.add('grabbed');
    document.body.classList.add('grabbing-mode');
  }
}

function drag(e) {
  if (isDragging) {
    e.preventDefault();
    let clientX;
    let clientY;

    if (e.type === 'touchmove') {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    let deltaX = clientX - lastX;
    lastX = clientX;
    
    // Add velocity proportional to horizontal movement (simulate inertia)
    rotationVelocity += deltaX * 0.04;

    currentX = clientX - initialX;
    currentY = clientY - initialY;
    xOffset = currentX;
    yOffset = currentY;
  }
}

function dragEnd() {
  if (unlocking) {
    isDragging = false;
    return;
  }
  initialX = currentX;
  initialY = currentY;
  isDragging = false;
  insertTarget = 0;
  keyEl.style.cursor = 'grab';
  keyEl.classList.remove('grabbed');
  document.body.classList.remove('grabbing-mode');
  if (keyholeEl) keyholeEl.style.filter = "drop-shadow(2px 4px 6px rgba(0, 0, 0, 0.5))";
}

function animateFrontProxy() {
  const fullyInserted = insertDepth > 0.92;

  // Track keyhole position (20% above its center)
  if (keyholeEl) {
    const khRect = keyholeEl.getBoundingClientRect();
    keyFrontEl.style.top = `${khRect.top + khRect.height / 2 - khRect.height * 0.2}px`;
    keyFrontEl.style.left = `${khRect.left + khRect.width / 2}px`;
  }

  // Fade front proxy in/out based on insert depth (range 0.80 → 1.0)
  if (!transitioning) {
    const frontOpacity = Math.max(0, Math.min(1, (insertDepth - 0.80) / 0.2));
    keyFrontEl.style.opacity = String(frontOpacity);
  }

  if (fullyInserted && isDragging) {
    if (!insertHeldStart) insertHeldStart = performance.now();
    const heldMs = performance.now() - insertHeldStart;

    if (!unlocking && heldMs >= HOLD_BEFORE_UNLOCK) {
      unlocking = true;
      unlockStartTime = performance.now();
    }
  } else if (!unlocking) {
    // Reset hold timer if the key leaves insert zone before unlock starts
    insertHeldStart = null;
  }

  if (unlocking && !unlocked) {
    const progress = Math.min(1, (performance.now() - unlockStartTime) / UNLOCK_DURATION);
    // Ease in-out for a satisfying turn
    const eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    frontRotation = eased * 180;
    if (progress >= 1) {
      unlocked = true;
      document.body.classList.add('unlocked-mode');
      
      // Start page transition
      transitioning = true;
      transitionStartTime = performance.now();
      
      // Fade out interactables
      keyEl.style.transition = 'opacity 2s ease, transform 2s ease';
      keyEl.style.opacity = '0';
      keyholeEl.style.transition = 'opacity 2s ease, transform 2s ease';
      keyholeEl.style.opacity = '0';
      keyFrontEl.style.transition = 'opacity 2s ease, transform 2s ease';
      keyFrontEl.style.opacity = '0';
      keyThicknessLayers.forEach(layer => {
         layer.style.transition = 'opacity 2s ease';
         layer.style.opacity = '0';
      });
    }
  }

  if (!transitioning) {
    keyFrontEl.style.transform = `translate(-50%, -50%) rotateZ(${frontRotation}deg)`;
  }

  // Handle post-unlock transition
  if (transitioning) {
    const p = Math.min(1, (performance.now() - transitionStartTime) / TRANSITION_DURATION);
    const eased = p * p * (3 - 2 * p);
    if (typeof window.bgSetTransition === 'function') {
      window.bgSetTransition(eased);
    }
    if (p >= 1) {
      if (!hasRedirected) {
        hasRedirected = true;
        window.location.href = 'rsvp.html';
      }
      return; // prevent further frames
    }
  }

  // Drive shader radial waves and zoom center
  if (typeof window.bgSetWave === 'function' && keyholeEl) {
    const rect = keyholeEl.getBoundingClientRect();
    const cx = (rect.left + rect.width  / 2) / window.innerWidth;
    const cy = 1 - (rect.top + rect.height / 2 - rect.height * 0.2) / window.innerHeight; // flip for GL
    const intensity = unlocking ? (unlocked ? 1 : Math.min(1, (performance.now() - unlockStartTime) / UNLOCK_DURATION)) : 0;
    window.bgSetWave({ x: cx, y: cy }, intensity);
  }
}

function animateKey() {
  // Spring physics constants
  const stiffness = 0.06;
  const damping = 0.85;

  // Restoring force to pull it back to 0 degrees
  rotationVelocity -= rotation * stiffness;
  
  // Friction/Damping
  rotationVelocity *= damping;
  
  // Apply velocity
  rotation += rotationVelocity;

  // Once unlocking starts, we gently snap the key's position to the keyhole center
  if (unlocking) {
      // Calculate where the key should be to align with the hole
      // Since everything is relative to the screen, we can just lerp the offsets
      // toward a centered state.
      const holeRect = keyholeEl.getBoundingClientRect();
      const keyRect = keyEl.getBoundingClientRect();
      
      // We want to align the key's horizontal center with hole's horizontal center
      const targetXOffset = xOffset + (holeRect.left + holeRect.width/2) - (keyRect.left + keyRect.width/2);
      // And the key's bit (near the bottom) with the hole center
      const targetYOffset = yOffset + (holeRect.top + holeRect.height/2) - (keyRect.top + keyRect.height * 0.8);
      
      xOffset += (targetXOffset - xOffset) * 0.1;
      yOffset += (targetYOffset - yOffset) * 0.1;
  }

  // Lerp insertDepth towards target
  insertDepth += (insertTarget - insertDepth) * 0.07;

  const rotY = insertDepth * 90;
  const rotZ = insertDepth * 90;
  const transform = `translate3d(${xOffset}px, ${yOffset}px, 0) rotate(${rotation}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)`;
  
  if (!transitioning) {
    keyEl.style.transform = transform;
  }

  // Only reveal the side layers once the key is meaningfully inserted.
  // Use a fixed screen-space offset stack so the thickness stays visible.
  const thicknessVisibility = Math.max(0, Math.min(1, (insertDepth - 0.72) / 0.2));
  
  if (!transitioning) {
    keyThicknessLayers.forEach((layer, index) => {
      const depthStep = index + 1;
      const thicknessOffsetX = depthStep * 0.7 * thicknessVisibility;
      const thicknessOffsetY = depthStep * 0.35 * thicknessVisibility;
      layer.style.display = thicknessVisibility > 0.01 ? 'block' : 'none';
      layer.style.transform = `translate3d(${xOffset + thicknessOffsetX}px, ${yOffset}px, 0) rotate(${rotation}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)`;
    });
  }
}

let pulsePhase = 0;

function animateKeyhole() {
  if (isDragging && keyholeEl) {
    const keyRect = keyEl.getBoundingClientRect();
    const holeRect = keyholeEl.getBoundingClientRect();
    
    const kx = keyRect.left + keyRect.width / 2;
    const ky = keyRect.top + keyRect.height / 2;
    const hx = holeRect.left + holeRect.width / 2;
    const hy = holeRect.top + holeRect.height / 2;
    
    const dist = Math.hypot(kx - hx, ky - hy);
    const maxDist = Math.hypot(window.innerWidth, window.innerHeight) * 0.4;
    
    const intensity = Math.max(0, 1 - (dist / maxDist));
    
    // Accumulate phase incrementally. 
    // If you multiply time * frequency where frequency varies, you get massive phase jumps.
    // By adding a small delta each frame, the frequency scales smoothly.
    const baseSpeed = 0.05;
    const speedRamp = 0.25;
    pulsePhase += baseSpeed + (speedRamp * intensity);
    
    const pulse = 0.8 + 0.2 * Math.sin(pulsePhase);
    
    const spread = 10 + 60 * intensity * pulse;
    const alpha = 0.4 + 0.6 * intensity * pulse;
    
    if (!transitioning) {
      keyholeEl.style.filter = `drop-shadow(0 0 ${spread}px rgba(255, 230, 255, ${alpha})) drop-shadow(2px 4px 6px rgba(0, 0, 0, 0.5))`;
    }

    // Hysteresis: snap in at 0.8, don't release until 0.6 — prevents threshold stutter
    if (unlocking) {
      insertTarget = 1;
    } else {
      if (intensity > 0.8) insertTarget = 1;
      else if (intensity < 0.6) insertTarget = 0;
    }
  }
}

function animate() {
  animateKey();
  animateKeyhole();
  animateFrontProxy();
  requestAnimationFrame(animate);
}

// Start animation loop
animate();

// Click interaction
keyEl.addEventListener('click', () => {
//   console.log("Key clicked!");
});