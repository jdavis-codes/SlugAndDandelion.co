const keyEl = document.getElementById('movable-key');
const keyholeEl = document.getElementById('keyhole');

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
  initialX = currentX;
  initialY = currentY;
  isDragging = false;
  keyEl.style.cursor = 'grab';
  document.body.classList.remove('grabbing-mode');
  if (keyholeEl) keyholeEl.style.filter = "drop-shadow(2px 4px 6px rgba(0, 0, 0, 0.5))";
}

function animate() {
  // Spring physics constants
  const stiffness = 0.06;
  const damping = 0.85;

  // Restoring force to pull it back to 0 degrees
  rotationVelocity -= rotation * stiffness;
  
  // Friction/Damping
  rotationVelocity *= damping;
  
  // Apply velocity
  rotation += rotationVelocity;

  keyEl.style.transform = `translate3d(${xOffset}px, ${yOffset}px, 0) rotate(${rotation}deg)`;
  
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
    const pulse = 0.8 + 0.2 * Math.sin(Date.now() * 0.005);
    
    const spread = 10 + 60 * intensity * pulse;
    const alpha = 0.4 + 0.6 * intensity * pulse;
    
    keyholeEl.style.filter = `drop-shadow(0 0 ${spread}px rgba(255, 230, 255, ${alpha})) drop-shadow(2px 4px 6px rgba(0, 0, 0, 0.5))`;
  }

  requestAnimationFrame(animate);
}

// Start animation loop
animate();

// Click interaction
keyEl.addEventListener('click', () => {
//   console.log("Key clicked!");
});