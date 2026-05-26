/**
 * ==========================================================================================
 *  THE DARK COUNCIL - VORONOI WEBGL SHADER BACKGROUND
 * ==========================================================================================
 * 
 * This file generates a dynamic, interactive WebGL background using a Voronoi + FBM noise 
 * algorithm. It is heavily configurable via HTML `data-*` attributes on the <body> tag,
 * as well as through global window functions called by interaction scripts.
 * 
 * ------------------------------------------------------------------------------------------
 * 1. HTML DATA ATTRIBUTES (Adjust these on your <body> tag)
 * ------------------------------------------------------------------------------------------
 * data-shader-tint   : The base color tint (Standard CSS Hex like #ff0000).
 *                      e.g., data-shader-tint="#c43b0f"
 * 
 * data-shader-scale  : Float. Multiplies the base zoom. < 1 zooms in (larger cells), 
 *                      > 1 zooms out (smaller cells). Default: 1.0
 * 
 * data-shader-steps  : Float. Number of posterization steps (color bands). Lower numbers 
 *                      give sharp, stepped contrast. Higher numbers are smoother. Default: 3.0
 * 
 * data-shader-cull   : Float. Threshold (0.0 - 1.0) for removing outer bands of the stripe.
 *                      The higher the cull, the thinner the stripes. Default: 0.0
 * 
 * data-shader-origin-x / y : Float (0.0 - 1.0). Starting normalized screen coordinates 
 *                            for the wave origin / zoom keyhole. Default: (0.5, 0.2)
 * 
 * ------------------------------------------------------------------------------------------
 * 2. DYNAMIC STATE VARIABLES (Triggered by interaction.js during unlock events)
 * ------------------------------------------------------------------------------------------
 * window.bgSetWave(pos, intensity) : Sets origin dict {x, y} and wave strength prior to unlock.
 * window.bgSetTransition(val)      : Transition 0.0 -> 1.0. Applies heavy domain warping, 
 *                                    extreme zoom, and eventually fades entirely to black.
 * 
 * ------------------------------------------------------------------------------------------
 * 3. INTERNAL SHADER UNIFORMS (Passed to glSL fragment shader)
 * ------------------------------------------------------------------------------------------
 * u_resolution    : Screen dimensions in pixels (prevents stretching).
 * u_time          : Elapsed execution time. Drives cell movement and FBM noise warping.
 * u_mouse         : Current mouse (x, y) coordinates. Creates a large cell repelling others.
 * u_tint          : Bound to data-shader-tint.
 * u_scale         : Bound to data-shader-scale.
 * u_steps         : Bound to data-shader-steps.
 * u_cull          : Bound to data-shader-cull.
 * u_keyholePos    : The dynamic origin coordinates for waves and transition zooming.
 * u_wavePhase     : The animated outward expansion phase of the ripples.
 * u_waveIntensity : Visibility/opacity of unlocking ripples (0 up to 1+).
 * u_transition    : Drives the final zoom-in / wipe transition state.
 * ==========================================================================================
 */

const canvas = document.getElementById('bg-canvas');
const gl = canvas.getContext('webgl');

const vsSource = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fsSource = `
  precision highp float;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec2 u_mouse;
  uniform vec3 u_tint;
  uniform vec2 u_keyholePos;    // normalized screen coords, y flipped for GL
  uniform float u_wavePhase;    // advances over time during unlock
  uniform float u_waveIntensity; // 0 = off, 1 = full
  uniform float u_transition;
  uniform float u_scale;
  uniform float u_steps;
  uniform float u_cull;

  vec3 hash3(vec2 p) {
    vec3 q = vec3(dot(p, vec2(127.1, 311.7)), 
                  dot(p, vec2(269.5, 183.3)), 
                  dot(p, vec2(419.2, 371.9)));
    return fract(sin(q) * 43758.5453);
  }

  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }

  float hash12(vec2 p) {
    vec3 p3  = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float snoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i + vec2(0.0, 0.0)), hash12(i + vec2(1.0, 0.0)), u.x),
               mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  float fbm(vec2 p) {
    float f = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      f += amp * snoise(p);
      p *= 2.0;
      amp *= 0.5;
    }
    return f;
  }

  vec2 voronoi(vec2 x, vec2 mw) {
    vec2 n = floor(x);
    vec2 f = fract(x);
    
    float mF1 = 8.0;
    float mF2 = 8.0;
    
    // Extended search window to [-2, 2] to prevent artifacts when cells sizes vary a lot
    for (int j = -2; j <= 2; j++) {
      for (int i = -2; i <= 2; i++) {
        vec2 g = vec2(float(i), float(j));
        vec3 h = hash3(n + g);
        vec2 o = h.xy;
        float weight = h.z; // Use a random weight for the cell size
        
        // Slow animation
        o = 0.5 + 0.5 * sin(u_time * 0.01 + 6.2831 * o);
        vec2 r = g + o - f;
        
        // Manhattan distance
        // float d = abs(r.x) + abs(r.y);
        
        // euclidain distance (uncomment if you want more circular cells, but it will be more expensive)
        float d = length(r);
        
        // Subtracting weight makes the cell effectively reach further (larger droplet)
        d += weight * 15.1; // 0.7 gives a solid variance in sizing
        
        if (d < mF1) {
          mF2 = mF1;
          mF1 = d;
        } else if (d < mF2) {
          mF2 = d;
        }
      }
    }
    
    // Inject the mouse point with a negative weight to create a large clear cell
    float dMouse = abs(mw.x - x.x) + abs(mw.y - x.y) + 0.0; // Subtracting effectively expands the cell
    
    if (dMouse < mF1) {
      mF2 = mF1;
      mF1 = dMouse;
    } else if (dMouse < mF2) {
      mF2 = dMouse;
    }
    
    return vec2(mF1, mF2);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    uv.y *= u_resolution.y / u_resolution.x;
    
    vec2 holeUV = vec2(u_keyholePos.x, u_keyholePos.y * u_resolution.y / u_resolution.x);
    
    // Decrease base zoom scale on narrower screens so cells don't appear too small on mobile
    // Using step and mix avoids WebGL 1 float comparison branching bugs on iOS Safari
    float isDesktop = step(768.0, u_resolution.x);
    float baseZoom = mix(8.0, 15.0, isDesktop) * u_scale;
    float targetZoom = mix(0.1, 1.0, isDesktop); // Zoom in much deeper on mobile to guarantee a dramatic warp

    // Domain warping configuration: zoom in extremely far and crank distortion as transition increases
    float zoomScale = mix(baseZoom, targetZoom, u_transition);
    float timeScaleX = 0.1;
    float timeScaleY = 0.05;
    vec2 phaseOffset = vec2(5.2, 1.3);
    float distortion = mix(2.0, 10.0, u_transition);

    // Zoom from the keyhole center
    vec2 p = (uv - holeUV) * zoomScale + holeUV;
    
    // Domain warping with fbm
    vec2 q = vec2(fbm(p + u_time * timeScaleX), fbm(p + phaseOffset - u_time * timeScaleY));
    vec2 warped = p + distortion * q;
    
    // Calculate mouse point in warped space, zooming from the same origin
    vec2 mouse_uv = u_mouse / u_resolution.xy;
    mouse_uv.y *= u_resolution.y / u_resolution.x;
    vec2 mp = (mouse_uv - holeUV) * zoomScale + holeUV;
    vec2 mq = vec2(fbm(mp + u_time * timeScaleX), fbm(mp + phaseOffset - u_time * timeScaleY));
    vec2 mouse_warped = mp + distortion * mq;
    
    vec2 v = voronoi(warped, mouse_warped);
    
    // Use difference for edges to get cells
    float val = v.y - v.x;   
    
    // Posterize to n levels
    float steps = u_steps;
    val = floor(val * steps + 0.1) / steps;
    
    // Higher cull = thinner stripes by removing outer opacity bands
    if ((1.0 - val) < u_cull) {
      val = 1.0;
    }
    
    // Clamp it
    val = clamp(val, 0.0, 1.0);

    // Radial wave rings from keyhole — inserted after voronoi, before noise,
    // so waves share the same visual texture layer as the cells.
    if (u_waveIntensity > 0.001) {
      float waveDist = length(uv - holeUV);
      float waveRing = sin(waveDist * 22.0 - u_wavePhase) * 0.5 + 0.5;
      float waveFade = exp(-waveDist * 2.5);
      val += waveRing * waveFade * u_waveIntensity * 0.7;
    }

        // Enhance contrast inside cells somewhat and add base noise mapping
    val = pow(val, 0.6) + snoise(warped * 2.0) * 0.3;
    
    // Make the entire overlay transparent: white is clear, black is black.
    float alpha = 1.0 - val;
    
    // Fade to solid black smoothly during the second half of the transition
    float fadeOut = smoothstep(0.5, 1.0, u_transition);
    alpha = mix(alpha, 1.0, fadeOut);
    
    gl_FragColor = vec4(u_tint, alpha);
  }
`;

function parseColorToVec3(value, fallback) {
  if (!value) return fallback;
  let str = value.trim();
  
  // Try Hex
  if (str.startsWith('#') || /^[0-9A-Fa-f]{3,6}$/.test(str)) {
    let hex = str.startsWith('#') ? str.slice(1) : str;
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) return [r, g, b];
    }
  }

  // Fallback to comma-separated floats
  const parts = str.split(',').map((part) => Number(part.trim()));
  if (parts.length === 3 && !parts.some((part) => Number.isNaN(part))) return parts;
  
  return fallback;
}

function parseNormalized(value, fallback) {
  const num = Number(value);
  if (Number.isNaN(num)) return fallback;
  return Math.max(0, Math.min(1, num));
}

const pageTheme = document.body?.dataset || {};
const shaderTint = parseColorToVec3(pageTheme.shaderTint, [0, 0, 0]);
const shaderScale = parseFloat(pageTheme.shaderScale) || 1.0;
const shaderSteps = parseFloat(pageTheme.shaderSteps) || 3.0;
const shaderCull = parseFloat(pageTheme.shaderCull) || 0.0;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);

const program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);
gl.useProgram(program);

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
const positions = [
  -1, -1,
   1, -1,
  -1,  1,
  -1,  1,
   1, -1,
   1,  1,
];
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

const positionAttributeLocation = gl.getAttribLocation(program, "position");
gl.enableVertexAttribArray(positionAttributeLocation);
gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
const timeLocation = gl.getUniformLocation(program, "u_time");
const mouseLocation = gl.getUniformLocation(program, "u_mouse");
const tintLocation = gl.getUniformLocation(program, "u_tint");
const keyholePosLocation = gl.getUniformLocation(program, "u_keyholePos");
const wavePhaseLocation = gl.getUniformLocation(program, "u_wavePhase");
const waveIntensityLocation = gl.getUniformLocation(program, "u_waveIntensity");
const transitionLocation = gl.getUniformLocation(program, "u_transition");
const scaleLocation = gl.getUniformLocation(program, "u_scale");
const stepsLocation = gl.getUniformLocation(program, "u_steps");
const cullLocation = gl.getUniformLocation(program, "u_cull");

// Wave state — written from interaction.js via window.bgSetWave()
// Initialized to match the CSS starting position of the keyhole (50vw, 80vh)
let _keyholePos = {
  x: parseNormalized(pageTheme.shaderOriginX, 0.5),
  y: parseNormalized(pageTheme.shaderOriginY, 0.2),
};
let _waveIntensity = 0;
let _wavePhase = 0;
let _transition = 0;

// Call this from interaction.js to drive the radial waves.
// keyholePos: { x, y } normalized screen coords (y flipped: 0=bottom, 1=top).
window.bgSetWave = function(keyholePos, intensity) {
  _keyholePos = keyholePos;
  _waveIntensity = intensity;
};

// Drive page transition
window.bgSetTransition = function(val) {
  _transition = val;
};

let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;

window.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
resize();

function render(time) {
  if (_waveIntensity > 0) _wavePhase += 0.055; // advance rings outward
  gl.uniform1f(timeLocation, time * 0.001);
  gl.uniform2f(mouseLocation, mouseX, canvas.height - mouseY);
  gl.uniform3f(tintLocation, shaderTint[0], shaderTint[1], shaderTint[2]);
  gl.uniform2f(keyholePosLocation, _keyholePos.x, _keyholePos.y);
  gl.uniform1f(wavePhaseLocation, _wavePhase);
  gl.uniform1f(waveIntensityLocation, _waveIntensity);
  gl.uniform1f(transitionLocation, _transition);
  gl.uniform1f(scaleLocation, shaderScale);
  gl.uniform1f(stepsLocation, shaderSteps);
  gl.uniform1f(cullLocation, shaderCull);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);