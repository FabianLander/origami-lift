/**
 * origami-lift — three steps of the inflation argument for eight-vertex paper tori, side by side:
 *
 *   1  the flattened torus Ψ: planar, flat, NOT embedded (its sheets coincide)
 *   2  the lift Ψ + t z: every vertex raised straight up to height t z_v. Embedded, NOT flat
 *   3  the corrected torus Ψ + t z + h(t): the same heights, the vertices moved horizontally
 *      until the torus is flat again with the modulus of Ψ. Embedded while t is small
 *
 * for the height t on the slider, for three tori (`src/data/`, written by `scripts/make-data.ts`).
 *
 * URL options, all optional (the address bar keeps them up to date):
 *   ?torus=regular|square|hex   ?t=0.1081   ?ui=0 (controls hidden)   ?lines=0   ?beads=0
 *   ?which=0,1,3                which vertices have a line
 *   ?railw=0.00065 ?beadw=0.0039 radii in diameters of Ψ
 *   ?captions=0   ?camera=ortho   ?tilt=20   ?bg=ffffff   ?texsize=4096
 */

import './style.css';
import * as THREE from 'three';
import { LiftModel, type TorusData } from './model.ts';
import { Row, type Panel, type LineState } from './panels.ts';
import regularData from './data/regular.json';
import squareData from './data/square.json';
import hexData from './data/hex.json';

const TORI: Record<string, TorusData> = {
  regular: regularData as unknown as TorusData,
  square: squareData as unknown as TorusData,
  hex: hexData as unknown as TorusData,
};
const SUBTITLE: Record<string, string> = {
  regular: 'T(46666677)',
  square: 'τ = i',
  hex: 'τ = ρ',
};

// ---- options from the URL ----
const url = new URLSearchParams(location.search);
const num = (k: string, d: number): number => {
  const s = url.get(k);
  if (s === null || s.trim() === '') return d;
  const x = Number(s.replace(',', '.'));
  return Number.isFinite(x) ? x : d;
};
const flag = (k: string, d: boolean): boolean => { const s = url.get(k); return s === null ? d : !(s === '0' || s === 'false' || s === 'off'); };

const coarse = matchMedia('(pointer: coarse)').matches;
const state = {
  torus: (url.get('torus') ?? 'regular') in TORI ? (url.get('torus') ?? 'regular') : 'regular',
  t: NaN,
  ui: flag('ui', true),
  captions: flag('captions', true),
  ortho: url.get('camera') === 'ortho',
  tilt: num('tilt', 20),
  zoom: 1,
};
const lines: LineState = {
  on: flag('lines', true),
  shown: [],
  beads: flag('beads', true),
  railRadius: Math.max(1e-5, num('railw', 0.00065)),
  beadRadius: Math.max(1e-5, num('beadw', 0.0039)),
};
const embedded = window.self !== window.top;

// ---- renderer, scene, light ----
const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;      // three 0.184 maps PCFSoft to this anyway
const TEX = Math.min(num('texsize', coarse ? 2048 : 4096), renderer.capabilities.maxTextureSize);
const DRAFT = Math.min(1024, TEX);

const scene = new THREE.Scene();
const bg = '#' + (url.get('bg') ?? 'ffffff').replace(/[^0-9a-f]/gi, '');
scene.background = new THREE.Color(bg);
document.documentElement.style.setProperty('--bg', bg);

/** The sky that lights the shadows: greys with the luminance of a blue sky and a cream floor. */
function gradientSky(top: number, bottom: number): THREE.DataTexture {
  const W = 64, H = 32, data = new Float32Array(W * H * 4);
  const lo = new THREE.Color(bottom), hi = new THREE.Color(top), c = new THREE.Color();
  for (let j = 0; j < H; j++) {
    const y = Math.sin(((j + 0.5) / H - 0.5) * Math.PI);           // row 0 is the bottom of the sphere
    c.lerpColors(lo, hi, (y * 0.5 + 0.5) ** 2);
    for (let i = 0; i < W; i++) { const o = 4 * (j * W + i); data[o] = c.r; data[o + 1] = c.g; data[o + 2] = c.b; data[o + 3] = 1; }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
scene.environment = gradientSky(0xb6b6b6, 0xe4e4e4);
scene.environmentIntensity = 0.9;
scene.add(new THREE.AmbientLight(0xffffff, 0.4));

// one soft spot from the front, a little left and above, as in the paper figures
const spot = new THREE.SpotLight(0xffffff, 4, 0, 1.3, 1.3, 0);
spot.castShadow = true;
spot.shadow.mapSize.set(2048, 2048);
spot.shadow.bias = -0.0002;
spot.shadow.radius = 4;
spot.shadow.normalBias = 0;          // folded-over faces have normals pointing away: a normal bias shadows them
scene.add(spot, spot.target);

const perspective = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
const orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
const camera = (): THREE.Camera & { updateProjectionMatrix(): void } => (state.ortho ? orthographic : perspective);

// the paper's grain
const grain = await new THREE.TextureLoader().loadAsync('./crease-rough.jpg').catch(() => null);
if (grain) { grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.colorSpace = THREE.NoColorSpace; grain.anisotropy = 8; }

// ---- the row ----
const GAP = 0.1;
const KEYS = ['fold', 'lift', 'corrected'] as const;
const CAPTION: Record<string, [string, string]> = {
  fold: ['flattened', 'Ψ'],
  lift: ['lifted', 'Ψ + t z'],
  corrected: ['corrected', 'Ψ + t z + h(t)'],
};
let model: LiftModel;
let row: Row;
let panels: Panel[] = [];
const world = new THREE.Group();
scene.add(world);

function homeQuaternion(): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (-state.tilt * Math.PI) / 180);
}

function load(key: string): void {
  for (const p of panels) { world.remove(p.object); p.dispose(); }
  row?.dispose();
  const data = TORI[key];
  state.torus = key;
  model = new LiftModel(data);
  lines.shown = model.z.map((_, v) => !(data.noLine ?? []).includes(v));
  const which = url.get('which');
  if (which !== null && key === initialTorus) {
    const on = new Set(which.split(',').map((s) => Number(s.trim())));
    lines.shown = lines.shown.map((_, v) => on.has(v));
  }
  if (!Number.isFinite(state.t) || key !== initialTorus || tFromUrlUsed) state.t = data.tOpen;
  if (key === initialTorus && !tFromUrlUsed) { state.t = clampT(num('t', data.tOpen)); tFromUrlUsed = true; }
  row = new Row(model, lines, grain, TEX, DRAFT);
  const lift = model.lift(state.t), cor = model.corrected(state.t);
  panels = [row.buildFold(), row.buildTorus('lift', state.t, lift), row.buildTorus('corrected', state.t, cor.positions)];
  panels.forEach((p, i) => {
    p.object.position.set((i - 1) * (1 + GAP), 0, 0);
    p.object.quaternion.copy(homeQuaternion());
    p.object.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    if (!lines.on) p.object.remove(p.rails.group);
    world.add(p.object);
  });
  selfTest(data);
  buildVertexButtons();
  syncControls();
  status(lift, cor);
  fit();
  writeUrl();
}
const initialTorus = state.torus;
let tFromUrlUsed = false;
const clampT = (t: number): number => Math.min(model.tEnd, Math.max(model.tEnd / 200, t));

/** At load, recompute the corrections the data script recorded, and say how closely they agree. */
function selfTest(data: TorusData): void {
  let worst = 0, n = 0;
  for (const q of data.path) {
    const h = model.correction(q.t);
    if (!h) continue;
    for (let i = 0; i < 16; i++) worst = Math.max(worst, Math.abs(h[i] - q.h[i]));
    n++;
  }
  console.log(`${data.key}: correction recomputed at ${n} recorded heights, largest difference ${worst.toExponential(1)} · ${n > 0 && worst < 1e-9 ? 'PASS' : 'FAIL'}`);
}

// ---- the height ----
let settle = 0;
function setT(t: number, final: boolean): void {
  state.t = clampT(t);
  const lift = model.lift(state.t), cor = model.corrected(state.t);
  panels[1].redraw!(state.t, lift);
  panels[2].redraw!(state.t, cor.positions);
  window.clearTimeout(settle);
  if (final) { panels[1].print!('final'); panels[2].print!('final'); }
  else {
    panels[1].print!('draft'); panels[2].print!('draft');
    settle = window.setTimeout(() => { panels[1].print!('final'); panels[2].print!('final'); }, 300);
  }
  status(lift, cor);
  tOut.value = state.t.toFixed(state.t < 0.02 ? 5 : 4);
  writeUrl();
}

const statusEl = document.getElementById('status')!;
function status(lift: Float64Array, cor: { positions: Float64Array; found: boolean; move: number }): void {
  const ml = model.measure(lift);
  const off = ml.coneDeficit >= 0.01 ? ml.coneDeficit.toFixed(2) : ml.coneDeficit.toExponential(1);
  const parts = [`lift: cone angles off by ${off}`];
  if (!cor.found) parts.push('<span class="bad">no correction found at this height</span>');
  else {
    const mc = model.measure(cor.positions);
    parts.push(`corrected: flat, ${mc.embedded ? 'embedded' : '<span class="bad">not embedded</span>'}, vertices moved ${(100 * cor.move).toFixed(1)}% of the diameter`);
  }
  statusEl.innerHTML = parts.join(' · ');
}

// ---- framing ----
const panelEl = document.getElementById('panel')!;
const capEls = KEYS.map((k) => {
  const el = document.createElement('div');
  el.className = 'cap';
  el.innerHTML = `<b>${CAPTION[k][0]}</b><span>${CAPTION[k][1]}</span>`;
  document.getElementById('captions')!.append(el);
  return el;
});
function fit(): void {
  const W = window.innerWidth, H = window.innerHeight;
  renderer.setSize(W, H, false);
  // the row at its home pose, tori only (the lines may run far)
  const saved = panels.map((p) => p.object.quaternion.clone());
  panels.forEach((p) => p.object.quaternion.copy(homeQuaternion()));
  world.updateMatrixWorld(true);
  const rowBox = new THREE.Box3();
  for (const p of panels) for (const o of p.pickables) rowBox.union(new THREE.Box3().setFromObject(o));
  panels.forEach((p, i) => p.object.quaternion.copy(saved[i]));
  world.updateMatrixWorld(true);
  const c = rowBox.getCenter(new THREE.Vector3()), size = rowBox.getSize(new THREE.Vector3());
  const capRoom = state.captions ? 46 : 0;
  const cover = state.ui ? panelEl.offsetHeight + 24 : 0;
  const avail = Math.max(H * 0.35, H - cover - capRoom - 24);
  const w = size.x / 2, h = size.y / 2;
  const need = Math.max(h / avail, w / (W - 32)) * H * 1.06;    // half heights, in units of the full view's half height
  const shift = (cover + capRoom) / 2;
  const cam = perspective;
  cam.aspect = W / H;
  const tan = Math.tan((cam.fov * Math.PI) / 360);
  const d = (need / tan) * state.zoom;
  cam.position.set(c.x, c.y, rowBox.max.z + d);
  cam.near = Math.max(0.01, d / 50); cam.far = d * 10 + 10;
  cam.lookAt(c.x, c.y, c.z);
  cam.setViewOffset(W, H, 0, shift, W, H);
  cam.updateProjectionMatrix();
  const half = need * state.zoom;
  orthographic.left = -half * W / H; orthographic.right = half * W / H; orthographic.top = half; orthographic.bottom = -half;
  orthographic.position.set(c.x, c.y, rowBox.max.z + 10);
  orthographic.near = 0.01; orthographic.far = 30;
  orthographic.lookAt(c.x, c.y, c.z);
  orthographic.setViewOffset(W, H, 0, shift, W, H);
  orthographic.updateProjectionMatrix();
  // the light: Figure 1's rule, distances in the row's half width
  const unit = Math.max(w, h);
  const dir = new THREE.Vector3(-0.25, 0.45, 1).normalize();
  const dist = unit * 6;
  spot.position.copy(c).addScaledVector(dir, dist);
  spot.target.position.copy(c);
  spot.target.updateMatrixWorld();
  spot.shadow.camera.near = Math.max(0.05, dist - unit * 1.5);
  spot.shadow.camera.far = dist + unit * 2;
  spot.shadow.focus = Math.min(1, Math.max(0.05, Math.atan((unit * 1.2 + 1) / dist) / spot.angle));
  placeCaptions();
}
/**
 * The captions stand under the row: one baseline, below the lowest corner of any torus as drawn
 * (the tilt brings the bottom of a torus toward the camera, so it is drawn lower than its
 * height says), each centred under its panel.
 */
const corner = new THREE.Vector3();
function placeCaptions(): void {
  const cam = camera();
  const W = window.innerWidth, H = window.innerHeight;
  let lowest = -Infinity;
  for (const p of panels) for (const o of p.pickables) {
    const pos = (o as THREE.Mesh).geometry.getAttribute('position');
    for (let k = 0; k < pos.count; k++) {
      corner.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld).project(cam);
      lowest = Math.max(lowest, ((1 - corner.y) / 2) * H);
    }
  }
  panels.forEach((p, i) => {
    const v = corner.setFromMatrixPosition(p.object.matrixWorld).project(cam);
    capEls[i].style.left = `${((v.x + 1) / 2) * W}px`;
    capEls[i].style.top = `${lowest + 10}px`;
  });
}
window.addEventListener('resize', fit);

// ---- turning ----
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let drag: { targets: THREE.Object3D[]; x: number; y: number } | null = null;
function pick(e: PointerEvent): Panel | null {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera());
  const hits = raycaster.intersectObjects(panels.flatMap((p) => p.pickables), false);
  if (!hits.length) return null;
  return panels.find((p) => p.pickables.includes(hits[0].object)) ?? null;
}
canvas.addEventListener('pointerdown', (e) => {
  const hit = pick(e);
  drag = { targets: hit && !e.shiftKey ? [hit.object] : panels.map((p) => p.object), x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = 'grabbing';
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) { canvas.style.cursor = pick(e) ? 'grab' : 'default'; return; }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const axis = new THREE.Vector3(dy, dx, 0).normalize().applyQuaternion(camera().quaternion);
  const q = new THREE.Quaternion().setFromAxisAngle(axis, len * 0.01);
  for (const o of drag.targets) o.quaternion.premultiply(q);
});
const endDrag = (e: PointerEvent): void => { if (drag) { drag = null; canvas.releasePointerCapture(e.pointerId); canvas.style.cursor = 'default'; } };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('dblclick', resetView);
canvas.addEventListener('wheel', (e) => {
  // inside a page, scrolling scrolls the page unless Ctrl or ⌘ is held
  if (embedded && !e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  state.zoom = Math.min(4, Math.max(0.3, state.zoom * Math.exp(e.deltaY * 0.0012)));
  fit();
}, { passive: false });
function resetView(): void {
  for (const p of panels) p.object.quaternion.copy(homeQuaternion());
  state.zoom = 1;
  fit();
}

// ---- controls ----
const toriEl = document.getElementById('tori')!;
for (const key of Object.keys(TORI)) {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('role', 'tab');
  b.dataset.key = key;
  b.title = TORI[key].source;
  b.innerHTML = `${TORI[key].title}<small>${SUBTITLE[key]}</small>`;
  b.addEventListener('click', () => { if (state.torus !== key) load(key); });
  toriEl.append(b);
}
const tIn = document.getElementById('t') as HTMLInputElement;
const tOut = document.getElementById('tval') as HTMLOutputElement;
tIn.addEventListener('input', () => setT(Number(tIn.value), false));
tIn.addEventListener('change', () => setT(Number(tIn.value), true));

const pressed = (id: string, on: boolean): void => { document.getElementById(id)!.setAttribute('aria-pressed', String(on)); };
function setLines(on: boolean): void {
  lines.on = on;
  for (const p of panels) { if (on) p.object.add(p.rails.group); else p.object.remove(p.rails.group); }
  syncControls(); writeUrl();
}
document.getElementById('lines')!.addEventListener('click', () => setLines(!lines.on));
document.getElementById('beads')!.addEventListener('click', () => { lines.beads = !lines.beads; for (const p of panels) p.rails.refresh(); syncControls(); writeUrl(); });
document.getElementById('captionsbtn')!.addEventListener('click', () => { state.captions = !state.captions; syncControls(); fit(); writeUrl(); });
document.getElementById('camera')!.addEventListener('click', () => { state.ortho = !state.ortho; syncControls(); fit(); writeUrl(); });
document.getElementById('reset')!.addEventListener('click', resetView);
document.getElementById('copy')!.addEventListener('click', async () => {
  const b = document.getElementById('copy')!;
  try { await navigator.clipboard.writeText(location.href); b.textContent = 'copied'; } catch { b.textContent = 'copy failed'; }
  window.setTimeout(() => { b.textContent = 'copy link'; }, 1400);
});
const moreBtn = document.getElementById('more')!, moreBox = document.getElementById('morebox')!;
moreBtn.addEventListener('click', () => {
  moreBox.hidden = !moreBox.hidden;
  moreBtn.setAttribute('aria-expanded', String(!moreBox.hidden));
  fit();
});

// line width and bead size, on log scales
const logSlider = (id: string, lo: number, hi: number, get: () => number, set: (x: number) => void): void => {
  const input = document.getElementById(id) as HTMLInputElement, out = document.getElementById(id + 'val') as HTMLOutputElement;
  const to = (x: number): number => Math.round((1000 * Math.log(x / lo)) / Math.log(hi / lo));
  const from = (s: number): number => lo * Math.exp((s / 1000) * Math.log(hi / lo));
  const show = (): void => { out.value = `${(200 * get()).toFixed(2)}%`; };
  input.value = String(to(get()));
  show();
  input.addEventListener('input', () => { set(from(Number(input.value))); for (const p of panels) p.rails.refresh(); show(); writeUrl(); });
};
logSlider('railw', 1e-4, 1e-2, () => lines.railRadius, (x) => { lines.railRadius = x; });
logSlider('beadw', 5e-4, 3e-2, () => lines.beadRadius, (x) => { lines.beadRadius = x; });

const verticesEl = document.getElementById('vertices')!;
function buildVertexButtons(): void {
  verticesEl.replaceChildren();
  const label = document.createElement('span');
  label.textContent = 'lines on'; label.style.color = 'var(--muted)'; label.style.marginRight = '4px';
  verticesEl.append(label);
  model.z.forEach((z, v) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pill vertex';
    b.textContent = `${v}${z > 0 ? '↑' : z < 0 ? '↓' : '·'}`;
    b.title = `vertex ${v}, height ${z.toFixed(3)} t`;
    b.disabled = Math.abs(z) < 1e-9;
    b.addEventListener('click', () => { lines.shown[v] = !lines.shown[v]; for (const p of panels) p.rails.refresh(); syncControls(); writeUrl(); });
    // pointing at a button colours that vertex's line, to tell which is which
    b.addEventListener('pointerenter', () => row.railMaterials[v].color.set('#c0392b'));
    b.addEventListener('pointerleave', () => row.railMaterials[v].color.set('#3c3c3c'));
    verticesEl.append(b);
  });
  const all = document.createElement('button');
  all.type = 'button'; all.className = 'pill quiet'; all.textContent = 'all';
  all.addEventListener('click', () => { const on = !lines.shown.every(Boolean); lines.shown = lines.shown.map(() => on); for (const p of panels) p.rails.refresh(); syncControls(); writeUrl(); });
  verticesEl.append(all);
}

function syncControls(): void {
  for (const b of toriEl.querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.key === state.torus));
  tIn.min = String(model.tEnd / 200); tIn.max = String(model.tEnd); tIn.step = String(model.tEnd / 2000);
  tIn.value = String(state.t);
  tOut.value = state.t.toFixed(state.t < 0.02 ? 5 : 4);
  tIn.title = `the height of the highest vertex, in diameters of Ψ. The corrected torus is embedded up to t = ${model.data.embeddedUntil.toFixed(model.data.embeddedUntil < 0.02 ? 5 : 4)}`;
  pressed('lines', lines.on); pressed('beads', lines.beads);
  pressed('captionsbtn', state.captions); pressed('camera', state.ortho);
  document.body.classList.toggle('nocaptions', !state.captions);
  verticesEl.querySelectorAll<HTMLButtonElement>('button.vertex').forEach((b, v) => b.setAttribute('aria-pressed', String(lines.shown[v])));
  document.getElementById('source')!.textContent = model.data.source;
}

// ---- show and hide ----
const hideBtn = document.getElementById('hide')!;
const ICON_DOWN = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 6l4.5 4.5L12.5 6"/></svg>';
const ICON_UP = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 5h11M2.5 8h11M2.5 11h11"/></svg>';
function setUi(on: boolean): void {
  state.ui = on;
  document.body.classList.toggle('ui-hidden', !on);
  hideBtn.innerHTML = on ? ICON_DOWN : ICON_UP;
  hideBtn.title = on ? 'hide the controls (H)' : 'show the controls (H)';
  hideBtn.setAttribute('aria-expanded', String(on));
  fit(); writeUrl(); poke();
}
hideBtn.addEventListener('click', () => setUi(!state.ui));
// while the controls are hidden the button fades after a moment without the pointer moving
let idle = 0;
function poke(): void {
  document.body.classList.remove('idle');
  window.clearTimeout(idle);
  idle = window.setTimeout(() => document.body.classList.add('idle'), 1800);
}
window.addEventListener('pointermove', poke);
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'h' || e.key === 'H') setUi(!state.ui);
  else if (e.key === 'r' || e.key === 'R') resetView();
  else if (e.key === 'l' || e.key === 'L') setLines(!lines.on);
});

// ---- the address bar ----
let urlTimer = 0;
function writeUrl(): void {
  window.clearTimeout(urlTimer);
  urlTimer = window.setTimeout(() => {
    const p = new URLSearchParams();
    p.set('torus', state.torus);
    p.set('t', state.t.toPrecision(4));
    if (!state.ui) p.set('ui', '0');
    if (!lines.on) p.set('lines', '0');
    if (!lines.beads) p.set('beads', '0');
    const which = lines.shown.map((on, v) => (on ? v : -1)).filter((v) => v >= 0);
    const def = model.z.map((_, v) => !(model.data.noLine ?? []).includes(v));
    if (lines.shown.some((on, v) => on !== def[v])) p.set('which', which.join(','));
    if (Math.abs(lines.railRadius - 0.00065) > 1e-9) p.set('railw', lines.railRadius.toPrecision(3));
    if (Math.abs(lines.beadRadius - 0.0039) > 1e-9) p.set('beadw', lines.beadRadius.toPrecision(3));
    if (!state.captions) p.set('captions', '0');
    if (state.ortho) p.set('camera', 'ortho');
    if (state.tilt !== 20) p.set('tilt', String(state.tilt));
    if (bg !== '#ffffff') p.set('bg', bg.slice(1));
    history.replaceState(null, '', `${location.pathname}?${p.toString()}`);
  }, 250);
}

// ---- go ----
load(state.torus);
setUi(state.ui);
renderer.setAnimationLoop(() => {
  placeCaptions();
  renderer.render(scene, camera());
});

// a handle for headless checks
(window as unknown as { __lift: unknown }).__lift = {
  state, lines, setT, load, setUi, fit,
  model: () => model, panels: () => panels, renderer, scene, camera,
};
