import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';

let scene, camera, renderer, eyeGroup;
let eyeSurfaceEl;
let lastSurfaceWidth = 0;
let lastSurfaceHeight = 0;

function initEye() {
    const container = document.getElementById('eye-surface');
    if (!container) return;
    eyeSurfaceEl = container;

    // Set up scene, camera, and renderer
    scene = new THREE.Scene();
    
    // We want a camera that looks at the scene
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.z = 5;

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    lastSurfaceWidth = Math.round(w);
    lastSurfaceHeight = Math.round(h);

    // Create the eye group
    eyeGroup = new THREE.Group();
    scene.add(eyeGroup);

    const textureLoader = new THREE.TextureLoader();
    const pupilTexture = textureLoader.load('assets/pupil_texure.png');
    const veinTexture = textureLoader.load('assets/wrinkle-texture.png'); // Use existing wrinkle as veiny noise
    // veinTexture.wrapS = THREE.RepeatWrapping;
    // veinTexture.wrapT = THREE.RepeatWrapping;
    veinTexture.repeat.set(1.2, 1.2); // Tile the texture for finer, denser veins

    // Stretch the texture vertically to counteract sphere mapping squashing
    pupilTexture.repeat.set(1, 0.7);
    pupilTexture.offset.set(0, 0.15);



    // Sclera base (solid white, glossy, slightly veiny)
    const scleraGeo = new THREE.SphereGeometry(1.5, 32, 32);
    scleraGeo.rotateY(-Math.PI / 2); 
    
    const scleraMat = new THREE.MeshPhongMaterial({ 
        color: 0xffffff,
        bumpMap: veinTexture,
        bumpScale: 0.12, // stronger veins
        shininess: 150, // very shiny and wet
        specular: 0xffffff
    });
    const scleraBase = new THREE.Mesh(scleraGeo, scleraMat);
    eyeGroup.add(scleraBase);

    // Sclera pupil overlay (same shape, transparent background)
    // We add this over the solid base so the white parts still get glossy highlights
    const pupilMat = new THREE.MeshPhongMaterial({ 
        map: pupilTexture,
        transparent: true,
        bumpMap: veinTexture,
        bumpScale: 0.12,
        shininess: 150,
        specular: 0xffffff
    });
    const scleraPupil = new THREE.Mesh(scleraGeo, pupilMat);
    scleraPupil.scale.setScalar(1.001); // Slightly larger to avoid z-fighting
    eyeGroup.add(scleraPupil);

    /*
    // Old Black Pupil
    const pupilGeo = new THREE.SphereGeometry(0.5, 32, 32);
    // Flatten it so it looks like a disc on the surface
    pupilGeo.scale(1, 1, 0.2); 
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    
    // Position the pupil at the front of the eye
    // pupil.position.z = 2.0;
    // eyeGroup.add(pupil);
    */

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 3); // slightly dimmer ambient...
    scene.add(ambientLight);
    
    // ...so the directional light gives a strong, glossy highlight
    const dirLight = new THREE.DirectionalLight(0xffffff, 2, 50);
    dirLight.position.set(7, 5, 2);
    scene.add(dirLight);

    // const pointLight = new THREE.PointLight(0xffffff, 2, 50);
    // pointLight.position.set(-2, 2, 5);
    // scene.add(pointLight);

    // Handle resize
    window.addEventListener('resize', onWindowResize, false);
    
    // Track mouse
    document.addEventListener('mousemove', onDocumentMouseMove, false);
    document.addEventListener('touchmove', onDocumentTouchMove, { passive: true });

    animate();
}

let mouseX = 0;
let mouseY = 0;
let targetX = 0;
let targetY = 0;
let twitchX = 0;
let twitchY = 0;
let twitchTargetX = 0;
let twitchTargetY = 0;
let twitchIsDwelling = false;
let twitchDwellUntil = 0;

function onDocumentTouchMove(event) {
    const touch = event.touches[0];
    if (!touch) return;
    const windowHalfX = window.innerWidth / 2;
    const windowHalfY = window.innerHeight / 2;
    const normalizedX = (touch.clientX - windowHalfX) / windowHalfX;
    const normalizedY = (touch.clientY - windowHalfY) / windowHalfY;
    const maxRotY = 0.3;
    const maxRotX = 0.15;
    mouseX = normalizedX * maxRotY;
    mouseY = normalizedY * maxRotX;
}

function onDocumentMouseMove(event) {
    const windowHalfX = window.innerWidth / 2;
    const windowHalfY = window.innerHeight / 2;
    
    // Normalize cursor position to range [-1, 1]
    const normalizedX = (event.clientX - windowHalfX) / windowHalfX;
    const normalizedY = (event.clientY - windowHalfY) / windowHalfY;
    
    // Apply rotation limits (in radians)
    const maxRotY = 0.5; // limit for left/right
    const maxRotX = 0.15; // limit for up/down
    
    mouseX = normalizedX * maxRotY;
    mouseY = normalizedY * maxRotX;
}

function onWindowResize() {
    if (!camera || !renderer) return;
    const container = eyeSurfaceEl || document.getElementById('eye-surface');
    if (!container) return;
    const w = Math.round(container.clientWidth);
    const h = Math.round(container.clientHeight);
    if (w < 2 || h < 2) return;
    if (w === lastSurfaceWidth && h === lastSurfaceHeight) return;

    lastSurfaceWidth = w;
    lastSurfaceHeight = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
}

function animate() {
    requestAnimationFrame(animate);

    // Keep camera and drawing buffer in lockstep with CSS-driven eye size changes.
    onWindowResize();

    targetX = mouseX;
    targetY = mouseY;

    // Smooth rotation towards cursor using linear interpolation
    // Notice that a negative rotation around X points the eye up/down correctly
    // And negative around Y points left/right
    if (eyeGroup) {
        if (document.body.classList.contains('chamber-denied')) {
            const time = Date.now() * 0.004;
            // rapid rotation on one axis
            eyeGroup.rotation.x = (eyeGroup.rotation.x + 0.15) % (Math.PI * 2);
            // shift that axis slowly
            eyeGroup.rotation.y = (eyeGroup.rotation.y - Math.sin(time) * 0.05) % (Math.PI * 2);
            // eyeGroup.rotation.z = (eyeGroup.rotation.z + Math.cos(time * 0.7) * 0.05) % (Math.PI * 2);
        } else {
            // Fast lerp for cursor tracking
            eyeGroup.rotation.y += (targetX - eyeGroup.rotation.y) * 0.9;
            eyeGroup.rotation.x += (targetY - eyeGroup.rotation.x) * 0.9;
            eyeGroup.rotation.z += (0 - eyeGroup.rotation.z) * 0.1;

            // Occasionally fire a twitch impulse
            if (Math.random() < 0.004) {
                twitchTargetX += (Math.random() - 0.5) * 1.78;
                twitchTargetY += (Math.random() - 0.5) * 1.74;
                twitchIsDwelling = false;
                twitchDwellUntil = 0;
                // twitchTargetX = THREE.MathUtils.clamp(twitchTargetX, -0.24, 0.24);
                // twitchTargetY = THREE.MathUtils.clamp(twitchTargetY, -0.2, 0.2);
            }

            // Smoothly ease the twitch up toward its target, pause briefly, then back down to rest
            twitchX += (twitchTargetX - twitchX) * 0.16;
            twitchY += (twitchTargetY - twitchY) * 0.16;

            const hasTwitchTarget = Math.abs(twitchTargetX) > 0.001 || Math.abs(twitchTargetY) > 0.001;
            const reachedTwitchTarget = Math.abs(twitchTargetX - twitchX) < 0.01 && Math.abs(twitchTargetY - twitchY) < 0.01;

            if (!twitchIsDwelling && hasTwitchTarget && reachedTwitchTarget) {
                twitchIsDwelling = true;
                twitchDwellUntil = performance.now() + 80 + Math.random() * 320;
            }

            if (twitchIsDwelling) {
                if (performance.now() >= twitchDwellUntil) {
                    twitchIsDwelling = false;
                }
            }

            if (!twitchIsDwelling) {
                twitchTargetX += (0 - twitchTargetX) * 0.12;
                twitchTargetY += (0 - twitchTargetY) * 0.12;
            }

            eyeGroup.rotation.y += twitchX;
            eyeGroup.rotation.x += twitchY;
        }
    }

    renderer.render(scene, camera);
}

document.addEventListener('DOMContentLoaded', () => {
    initEye();

    // ── Scroll-to-compact: shrink eye when user scrolls the inner container ──
    const scrollEl = document.querySelector('.rsvp-main, .guestbook-main, .chamber-main');
    const content  = document.querySelector('.content');
    const eyeWidget = document.querySelector('.eye-widget');

    if (scrollEl && content && eyeWidget) {
        scrollEl.addEventListener('scroll', () => {
            content.classList.toggle('eye-compact', scrollEl.scrollTop > 10);
        }, { passive: true });

        // Re-fit the Three.js canvas after the CSS transition completes
        eyeWidget.addEventListener('transitionend', (e) => {
            if (e.propertyName === 'height' || e.propertyName === 'width') {
                onWindowResize();
            }
        });
    }
});
