import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLACES, DAYS } from './data.js';

// ---------- 座標與地形 ----------
export const DAY_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#14b8a6', '#a855f7', '#f97316', '#ec4899'];

// 經緯度 → 世界座標（為了畫面好看，部分地點略微挪動）
const NUDGE = { ghibli: [2.4, 1.3], shinhotaka: [0.6, -1.2], furukawa: [-0.7, -0.9] };
export function proj(key) {
  const p = PLACES[key];
  const [nx, nz] = NUDGE[key] || [0, 0];
  return new THREE.Vector3((p.lon - 137.05) * 24 + nx, 0, -(p.lat - 35.72) * 19 + nz);
}

function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < 4; i++) { s += amp * vnoise(x * f, z * f); amp *= 0.5; f *= 2.03; }
  return s;
}
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const gauss = (x, z, cx, cz, rx, rz) => Math.exp(-(((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2));
const rand = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })(); // 固定亂數，每次畫面一致

const PLACE_POS = Object.keys(PLACES).map((k) => [k, proj(k)]);

function landSdf(x, z) {
  const dx = Math.abs(x - 1.5) / 15.5, dz = Math.abs(z) / 21;
  let d = (Math.pow(dx ** 4 + dz ** 4, 0.25) - 1) * 15 + (fbm(x * 0.25, z * 0.25) - 0.5) * 3;
  d = Math.max(d, 15 - Math.hypot(x + 22, z + 26)); // 日本海
  d = Math.max(d, 6 - Math.hypot(x + 6, z + 21));   // 伊勢灣
  const ap = proj('airport');
  d = Math.min(d, Math.hypot(x - ap.x, z - ap.z) - 1.7); // 中部機場人工島
  return d;
}

export function heightAt(x, z) {
  const sdf = landSdf(x, z);
  const land = smooth(0.25, -0.35, sdf); // 海岸陡一點，像模型台座的斷面
  let m = 0;
  m += 5.2 * gauss(x, z, 12.5, -7, 3.6, 9);    // 北阿爾卑斯
  m += 3.0 * gauss(x, z, -6, -6.5, 3.2, 3.5);  // 白山
  m += 1.6 * gauss(x, z, 2.5, -3, 6, 5);       // 飛驒高地
  m += 1.0 * gauss(x, z, -1, 4, 6, 4);         // 美濃丘陵
  let h = 0.45 + (fbm(x * 0.6, z * 0.6) - 0.4) * 0.35 + m * (0.55 + fbm(x * 0.45 + 9, z * 0.45) * 0.9);
  for (const [, p] of PLACE_POS) {
    const f = gauss(x, z, p.x, p.z, 1.9, 1.9);
    h = h * (1 - f) + 0.45 * f;
  }
  return -0.9 + (h + 0.9) * land;
}

// ---------- 材質與小模型 ----------
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });
const M = {
  snow: mat('#fbf8f3'), wall: mat('#f4ece0'), dark: mat('#4a4550'), wood: mat('#9a6644'), roofGreen: mat('#5f9a86'),
  gold: mat('#e2b13c', { metalness: 0.4, roughness: 0.4 }), thatch: mat('#a9845a'),
  glass: mat('#9cc6e6', { roughness: 0.2, metalness: 0.3, emissive: '#ffcf7a', emissiveIntensity: 0 }),
  red: mat('#d9534f'), tree: mat('#2f6b4f'), trunk: mat('#7a5638'), road: mat('#6b6f78'), water: mat('#5cc6dc', { roughness: 0.15 }),
  orange: mat('#ef8a4a'), concrete: mat('#d6d0c6'), stone: mat('#b9ab99'), plinth: mat('#cdb89f'), plinthTop: mat('#fbf8f3'),
  window: mat('#f6e6c0', { emissive: '#ffb347', emissiveIntensity: 0 }),
  lantern: mat('#fff1d0', { emissive: '#ffb347', emissiveIntensity: 0 }),
  coat: mat('#e8643c'), coat2: mat('#3b6fb6'), skin: mat('#f2d0b0'), black: mat('#2a2a2a'),
};
const GLOW = [M.window, M.lantern, M.glass];

function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y + h / 2, z); o.castShadow = o.receiveShadow = true; return o;
}
function prism(w, h, d, m, x = 0, y = 0, z = 0) { // 三角屋頂
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2);
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; return o;
}
function pyramid(w, h, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(new THREE.ConeGeometry(w * 0.72, h, 4), m);
  o.rotation.y = Math.PI / 4; o.position.set(x, y + h / 2, z); o.castShadow = true; return o;
}
function pine(x, z, s = 1) {
  const g = new THREE.Group();
  g.add(box(0.08 * s, 0.16 * s, 0.08 * s, M.trunk));
  [[0.3, 0.36, 0.3], [0.23, 0.3, 0.5], [0.15, 0.24, 0.68]].forEach(([r, h, y]) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r * s, h * s, 7), M.tree); c.position.y = y * s; g.add(c);
    const sc = new THREE.Mesh(new THREE.ConeGeometry(r * 0.6 * s, h * 0.45 * s, 7), M.snow); sc.position.y = (y + h * 0.3) * s; g.add(sc);
  });
  g.position.set(x, 0, z); g.traverse((o) => (o.castShadow = true)); return g;
}
function house(x, z, rot = 0, roof = M.dark, s = 1) {
  const g = new THREE.Group();
  g.add(box(0.5 * s, 0.32 * s, 0.4 * s, M.wall));
  g.add(box(0.12 * s, 0.1 * s, 0.02 * s, M.window, -0.1 * s, 0.13 * s, 0.205 * s));
  g.add(box(0.12 * s, 0.1 * s, 0.02 * s, M.window, 0.12 * s, 0.13 * s, 0.205 * s));
  g.add(prism(0.62 * s, 0.24 * s, 0.48 * s, roof, 0, 0.32 * s, 0));
  g.add(prism(0.5 * s, 0.12 * s, 0.5 * s, M.snow, 0, 0.44 * s, 0));
  g.position.set(x, 0, z); g.rotation.y = rot; return g;
}
function gassho(x, z, rot = 0) {
  const g = new THREE.Group();
  g.add(box(0.5, 0.22, 0.75, M.wood));
  g.add(box(0.14, 0.1, 0.02, M.window, 0, 0.07, 0.38));
  g.add(prism(0.62, 0.7, 0.8, M.thatch, 0, 0.22, 0));
  g.add(prism(0.48, 0.42, 0.82, M.snow, 0, 0.5, 0));
  g.position.set(x, 0, z); g.rotation.y = rot; return g;
}
function lantern(x, z) { // 石燈籠
  const g = new THREE.Group();
  g.add(box(0.12, 0.04, 0.12, M.stone)); g.add(box(0.05, 0.16, 0.05, M.stone, 0, 0.04));
  g.add(box(0.1, 0.08, 0.1, M.lantern, 0, 0.2)); g.add(pyramid(0.18, 0.08, M.stone, 0, 0.28)); g.add(box(0.12, 0.02, 0.12, M.snow, 0, 0.35));
  g.position.set(x, 0, z); return g;
}
function snowman(x, z) {
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), M.snow); a.position.y = 0.1; g.add(a);
  const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 1), M.snow); b.position.y = 0.26; g.add(b);
  g.add(box(0.1, 0.06, 0.1, M.red, 0, 0.32));
  g.position.set(x, 0, z); g.traverse((o) => (o.castShadow = true)); return g;
}
function person(x, z, coat = M.coat) {
  const g = new THREE.Group();
  g.add(box(0.07, 0.12, 0.05, coat)); g.add(box(0.05, 0.05, 0.05, M.skin, 0, 0.12)); g.add(box(0.06, 0.02, 0.06, M.black, 0, 0.17));
  g.position.set(x, 0, z); g.rotation.y = rand() * 6; return g;
}
function torii(x, z, rot = 0) {
  const g = new THREE.Group();
  g.add(box(0.05, 0.4, 0.05, M.red, -0.16)); g.add(box(0.05, 0.4, 0.05, M.red, 0.16));
  g.add(box(0.48, 0.05, 0.07, M.red, 0, 0.4)); g.add(box(0.4, 0.03, 0.05, M.red, 0, 0.32)); g.add(box(0.48, 0.02, 0.08, M.snow, 0, 0.45));
  g.position.set(x, 0, z); g.rotation.y = rot; return g;
}
function crowd(g, n, r = 0.9) {
  for (let i = 0; i < n; i++) { const a = rand() * 6.28, d = 0.3 + rand() * r; g.add(person(Math.cos(a) * d, Math.sin(a) * d, rand() > 0.5 ? M.coat : M.coat2)); }
}

const BUILDERS = {
  airport() {
    const g = new THREE.Group();
    g.add(box(2.6, 0.04, 0.42, M.road, 0, 0, 0.3));
    for (let i = -1; i <= 1; i += 0.4) g.add(box(0.18, 0.045, 0.04, M.snow, i, 0, 0.3));
    g.add(box(1.0, 0.3, 0.45, M.glass, 0.2, 0, -0.35));
    g.add(box(0.12, 0.6, 0.12, M.concrete, -0.7, 0, -0.35));
    g.add(box(0.24, 0.12, 0.24, M.glass, -0.7, 0.6, -0.35));
    const plane = new THREE.Group();
    plane.add(box(0.7, 0.1, 0.12, M.snow)); plane.add(box(0.18, 0.03, 0.8, M.snow, 0, 0.04)); plane.add(box(0.1, 0.18, 0.03, M.red, -0.3, 0.05));
    plane.position.set(-0.6, 0.05, 0.3); g.add(plane);
    g.userData.plane = plane; return g;
  },
  castle() { // 名古屋城＋車站大樓
    const g = new THREE.Group();
    g.add(box(1.0, 0.18, 1.0, M.stone));
    g.add(box(0.6, 0.3, 0.6, M.wall, 0, 0.18)); g.add(pyramid(0.85, 0.2, M.roofGreen, 0, 0.48));
    g.add(box(0.42, 0.25, 0.42, M.wall, 0, 0.68)); g.add(pyramid(0.6, 0.22, M.roofGreen, 0, 0.93));
    g.add(box(0.06, 0.08, 0.06, M.gold, 0.12, 1.08)); g.add(box(0.06, 0.08, 0.06, M.gold, -0.12, 1.08));
    [[1.2, 1.3, -0.6], [1.6, 1.6, -0.1], [1.25, 1.1, 0.5], [-1.2, 0.8, 0.6]].forEach(([x, h, z]) => g.add(box(0.36, h, 0.36, M.glass, x, 0, z)));
    g.add(pine(-1.0, -0.6, 1)); g.add(pine(-0.7, -0.9, 0.8));
    crowd(g, 6, 1.0);
    return g;
  },
  town() {
    const g = new THREE.Group();
    [[-0.5, -0.3, 0.2], [0.2, -0.5, 0], [0.6, 0.2, 1.5], [-0.3, 0.5, 1.4], [0.9, -0.5, 0.3]].forEach(([x, z, r]) => g.add(house(x, z, r)));
    g.add(box(2.2, 0.03, 0.22, M.water, 0, 0, 0.05));
    g.add(pine(-1.0, 0.2)); g.add(pine(0.9, 0.7, 0.8)); g.add(lantern(-0.1, 0.25)); g.add(snowman(0.35, 0.6));
    crowd(g, 4, 0.7);
    return g;
  },
  oldtown() { // 高山：古街＋紅色中橋
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) { g.add(house(-1 + i * 0.45, -0.45, 0, M.wood)); g.add(house(-1 + i * 0.45, 0.45, Math.PI, M.wood)); }
    g.add(box(0.3, 0.03, 1.9, M.water, 1.25, 0, 0));
    g.add(box(0.5, 0.08, 0.22, M.red, 1.25, 0.06, 0));
    g.add(torii(-0.95, 0.95, 0.3)); g.add(lantern(0.4, 0)); g.add(lantern(-0.4, 0));
    crowd(g, 6, 0.6);
    return g;
  },
  gassho() {
    const g = new THREE.Group();
    [[-0.6, -0.5, 0.1], [0.3, -0.6, -0.2], [0.8, 0.2, 0.2], [-0.2, 0.4, 0], [-0.9, 0.5, 0.3]].forEach(([x, z, r]) => g.add(gassho(x, z, r)));
    g.add(pine(0.2, 1.0, 0.8)); g.add(pine(1.0, -0.7, 0.7)); g.add(snowman(0.4, 0.75));
    crowd(g, 5, 0.9);
    return g;
  },
  garden() { // 金澤：城＋兼六園雪吊
    const g = new THREE.Group();
    g.add(box(0.8, 0.12, 0.6, M.stone, -0.5, 0, -0.35));
    g.add(box(0.6, 0.35, 0.36, M.wall, -0.5, 0.12, -0.35)); g.add(prism(0.76, 0.24, 0.46, M.concrete, -0.5, 0.47, -0.35));
    const pond = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 16), M.water); pond.position.set(0.45, 0.02, 0.35); g.add(pond);
    for (const [x, z] of [[-0.1, 0.55], [0.85, -0.25], [0.3, -0.45]]) {
      g.add(pine(x, z, 1.0));
      const rope = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.85, 10, 1, true), new THREE.MeshBasicMaterial({ color: '#c9a86b', wireframe: true }));
      rope.position.set(x, 0.5, z); g.add(rope);
    }
    g.add(lantern(0.85, 0.55)); g.add(lantern(0.05, 0.05));
    crowd(g, 5, 0.8);
    return g;
  },
  onsen() {
    const g = new THREE.Group();
    g.add(box(1.0, 0.35, 0.5, M.wood, -0.3, 0, -0.3));
    [-0.6, -0.3, 0].forEach((x) => g.add(box(0.14, 0.12, 0.02, M.window, x, 0.12, -0.04)));
    g.add(prism(1.15, 0.28, 0.6, M.dark, -0.3, 0.35, -0.3)); g.add(prism(1.0, 0.14, 0.62, M.snow, -0.3, 0.5, -0.3));
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 12), M.water); pool.position.set(0.5, 0.03, 0.4); g.add(pool);
    for (let i = 0; i < 9; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09), M.stone); const a = (i / 9) * Math.PI * 2; r.position.set(0.5 + Math.cos(a) * 0.45, 0.04, 0.4 + Math.sin(a) * 0.45); g.add(r); }
    g.add(lantern(0.0, 0.55)); g.add(lantern(0.95, 0.0));
    const steam = [];
    const sm = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false });
    for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), sm.clone()); s.position.set(0.5, 0.1 + i * 0.15, 0.4); s.userData.t = i / 7; g.add(s); steam.push(s); }
    g.userData.steam = steam; return g;
  },
  ropeway() {
    const g = new THREE.Group();
    g.add(box(0.5, 0.35, 0.4, M.concrete, -0.8, 0, 0.6));
    const topY = 2.6;
    g.add(box(0.4, 0.3, 0.35, M.concrete, 0.9, topY, -0.7));
    const pts = [new THREE.Vector3(-0.8, 0.45, 0.6), new THREE.Vector3(0.9, topY + 0.2, -0.7)];
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#333' })));
    const gondola = box(0.18, 0.16, 0.14, M.red); g.add(gondola);
    g.userData.cable = pts; g.userData.gondola = gondola; return g;
  },
  lodge() {
    const g = new THREE.Group();
    g.add(box(0.9, 0.36, 0.6, M.wood));
    g.add(box(0.16, 0.12, 0.02, M.window, -0.2, 0.12, 0.305)); g.add(box(0.16, 0.12, 0.02, M.window, 0.2, 0.12, 0.305));
    g.add(prism(1.05, 0.4, 0.7, M.dark, 0, 0.36)); g.add(prism(0.9, 0.22, 0.72, M.snow, 0, 0.55));
    g.add(box(0.3, 0.12, 0.18, M.red, 0.8, 0, 0.3)); // 車
    g.add(pine(-0.8, -0.4)); g.add(pine(-0.6, 0.5, 0.8)); g.add(snowman(0.3, 0.7));
    return g;
  },
  ghibli() {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.8, 7), M.trunk); trunk.position.set(-0.4, 0.4, 0); g.add(trunk);
    const crown = mat('#4f9a62');
    [[-0.4, 1.0, 0, 0.55], [-0.75, 0.85, 0.2, 0.38], [-0.05, 0.85, -0.15, 0.4], [-0.4, 1.35, 0.05, 0.35]].forEach(([x, y, z, r]) => {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), crown); s.position.set(x, y, z); s.castShadow = true; g.add(s);
    });
    g.add(box(0.5, 0.4, 0.4, M.wall, 0.6, 0, 0.2)); g.add(box(0.12, 0.12, 0.02, M.window, 0.6, 0.15, 0.405));
    g.add(prism(0.62, 0.3, 0.5, M.orange, 0.6, 0.4, 0.2));
    g.add(box(0.14, 0.7, 0.14, M.wall, 0.95, 0, -0.35)); g.add(pyramid(0.24, 0.22, M.red, 0.95, 0.7, -0.35));
    crowd(g, 6, 0.9);
    return g;
  },
};
const NO_PLINTH = new Set(['ropeway', 'airport']);

// 地平線的漸層天空（白天／黃昏／夜晚）
function skyTexture(top, bottom) {
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const g = c.getContext('2d'); const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, top); grd.addColorStop(1, bottom); g.fillStyle = grd; g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const TIMES = {
  day:   { sky: ['#bfdde6', '#f4e7d7'], fog: '#efe4d6', hemi: ['#ffffff', '#9bb8c4', 1.25], sun: ['#fff0dc', 2.3], sunPos: [30, 45, 12], glow: 0, exposure: 1.0, sea: '#3aa6b3' },
  dusk:  { sky: ['#7d7aa8', '#f6b48a'], fog: '#e9b49a', hemi: ['#ffe2cc', '#7a7fa8', 0.9], sun: ['#ffb27e', 1.35], sunPos: [-40, 22, 10], glow: 0.9, exposure: 1.0, sea: '#3a8a9e' },
  night: { sky: ['#0f1a33', '#2d3f6a'], fog: '#22304f', hemi: ['#8ea6ff', '#1b2440', 0.45], sun: ['#a9bcff', 0.55], sunPos: [-20, 40, -20], glow: 1.6, exposure: 1.1, sea: '#1f4f6b' },
};

// ---------- 場景建立 ----------
export function createWorld(container, { onPick }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'label-layer';
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#efe4d6', 120, 320);
  const skies = Object.fromEntries(Object.entries(TIMES).map(([k, t]) => [k, skyTexture(...t.sky)]));

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 500);
  const HOME = { pos: new THREE.Vector3(16, 33, 38), target: new THREE.Vector3(1.5, 0, -1.5) };
  // 直式螢幕（手機）視角較窄，鏡頭拉遠
  const homePos = () => { const a = container.clientWidth / container.clientHeight; const k = a < 1 ? Math.min(2.6, 1.1 / a) : 1; return HOME.pos.clone().sub(HOME.target).multiplyScalar(k).add(HOME.target); };
  camera.position.copy(homePos());

  const controls = new OrbitControls(camera, labelRenderer.domElement);
  controls.target.copy(HOME.target);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.42;
  controls.minDistance = 8; controls.maxDistance = 170;

  const hemi = new THREE.HemisphereLight('#fff6ea', '#8fb5c0', 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe2b8', 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 4; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 });
  scene.add(sun);

  // 海：底色＋淺灘與浪花（由海岸距離算出的貼圖）
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: '#3aa6b3', roughness: 0.35, metalness: 0.05 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -0.05; sea.receiveShadow = true; scene.add(sea);

  const SW = 70, SD = 76, RES = 512;
  const sc = document.createElement('canvas'); sc.width = sc.height = RES;
  const sctx = sc.getContext('2d'); const img = sctx.createImageData(RES, RES);
  for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
    const x = 1.5 - SW / 2 + (i / RES) * SW, z = -SD / 2 + (j / RES) * SD;
    const d = landSdf(x, z) + (vnoise(x * 3, z * 3) - 0.5) * 0.25;
    let r = 0, g = 0, b = 0, a = 0;
    if (d > -0.3 && d < 0.45) { r = g = b = 255; a = 235; }                         // 浪花
    else if (d >= 0.45 && d < 0.75) { r = 190; g = 240; b = 238; a = 120; }          // 第二道浪
    else if (d >= 0.75 && d < 6) { const t = 1 - (d - 0.75) / 5.25; r = 150; g = 225; b = 222; a = 150 * t * t; } // 淺灘
    const k = (j * RES + i) * 4; img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = a;
  }
  sctx.putImageData(img, 0, 0);
  const shoreTex = new THREE.CanvasTexture(sc); shoreTex.colorSpace = THREE.SRGBColorSpace;
  const shore = new THREE.Mesh(new THREE.PlaneGeometry(SW, SD), new THREE.MeshBasicMaterial({ map: shoreTex, transparent: true, depthWrite: false, fog: true }));
  shore.rotation.x = -Math.PI / 2; shore.position.set(1.5, -0.02, 0); scene.add(shore);

  // 地形（low-poly 平面著色）
  const W = 46, D = 54;
  let geo = new THREE.PlaneGeometry(W, D, 115, 135).rotateX(-Math.PI / 2);
  geo.translate(1.5, 0, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo = geo.toNonIndexed(); geo.computeVertexNormals();
  const p2 = geo.attributes.position, nrm = geo.attributes.normal;
  const colors = new Float32Array(p2.count * 3);
  const C = {
    snow: new THREE.Color('#ffffff'), snowBlue: new THREE.Color('#e6eef4'), rock: new THREE.Color('#a39b92'),
    cliff: new THREE.Color('#c99f74'), cliffDark: new THREE.Color('#a87f5a'), field: new THREE.Color('#f6f8f7'), sand: new THREE.Color('#e9d6b6'),
  };
  const c = new THREE.Color();
  for (let i = 0; i < p2.count; i += 3) {
    const y = (p2.getY(i) + p2.getY(i + 1) + p2.getY(i + 2)) / 3;
    const ny = nrm.getY(i);
    const n = hash(p2.getX(i), p2.getZ(i));
    if (y < 0.3 && ny < 0.8) c.copy(y < -0.3 ? C.cliffDark : C.cliff);   // 台座斷面（土層）
    else if (y < 0.3) c.copy(C.sand);
    else if (ny < 0.72 && y > 0.9) c.copy(C.rock).offsetHSL(0, 0, (n - 0.5) * 0.05);
    else if (y > 2.4) c.copy(C.snow);
    else c.copy(n > 0.5 ? C.snowBlue : C.field).lerp(C.snow, Math.min(1, y / 2.4));
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
  terrain.receiveShadow = true; terrain.castShadow = true; scene.add(terrain);

  // 遠山（背景）
  const farMat = new THREE.MeshStandardMaterial({ color: '#9fb4c2', flatShading: true, roughness: 1 });
  const farSnow = new THREE.MeshStandardMaterial({ color: '#f4f1ec', flatShading: true, roughness: 1 });
  for (let i = 0; i < 34; i++) {
    const a = -Math.PI * 0.05 - (i / 34) * Math.PI * 1.25 - 0.2, r = 75 + rand() * 45, h = 8 + rand() * 16;
    const x = 1.5 + Math.cos(a) * r, z = Math.sin(a) * r;
    const m = new THREE.Mesh(new THREE.ConeGeometry(h * 0.9, h, 5 + Math.floor(rand() * 3)), farMat); m.position.set(x, h / 2 - 1, z); m.rotation.y = rand() * 6; scene.add(m);
    const s = new THREE.Mesh(new THREE.ConeGeometry(h * 0.9 * 0.3, h * 0.3, m.geometry.parameters.radialSegments), farSnow); s.position.set(x, h - 1 - h * 0.15 + 0.01, z); s.rotation.y = m.rotation.y; scene.add(s);
  }

  // 樹林：雪松（三層）＋圓樹
  const tiers = [], caps = [];
  [[0.26, 0.34, 0.25], [0.2, 0.3, 0.45], [0.13, 0.24, 0.63]].forEach(([r, h, y]) => {
    tiers.push(new THREE.ConeGeometry(r, h, 6).translate(0, y, 0));
    caps.push(new THREE.ConeGeometry(r * 0.62, h * 0.45, 6).translate(0, y + h * 0.3, 0));
  });
  tiers.push(new THREE.CylinderGeometry(0.035, 0.045, 0.14, 5).translate(0, 0.07, 0));
  const pineGeo = mergeGeometries(tiers), pineCap = mergeGeometries(caps);
  const roundGeo = mergeGeometries([new THREE.IcosahedronGeometry(0.24, 0).translate(0, 0.42, 0), new THREE.CylinderGeometry(0.035, 0.045, 0.24, 5).translate(0, 0.12, 0).toNonIndexed()]);
  const roundCap = new THREE.IcosahedronGeometry(0.17, 0).scale(1, 0.55, 1).translate(0, 0.58, 0);
  const NP = 380, NR = 130;
  const greenMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 });
  const pines = new THREE.InstancedMesh(pineGeo, greenMat, NP), pineCaps = new THREE.InstancedMesh(pineCap, M.snow, NP);
  const rounds = new THREE.InstancedMesh(roundGeo, greenMat.clone(), NR), roundCaps = new THREE.InstancedMesh(roundCap, M.snow, NR);
  [pines, rounds, pineCaps, roundCaps].forEach((m) => (m.castShadow = true));
  const dummy = new THREE.Object3D(), tc = new THREE.Color();
  const PINE_COLORS = ['#2f6b4f', '#3b7a58', '#28604a', '#467f5c'], ROUND_COLORS = ['#7fa77a', '#93b386', '#6e9b74', '#c99a5a'];
  let np = 0, nr = 0;
  for (let tries = 0; tries < 30000 && (np < NP || nr < NR); tries++) {
    const x = -20 + rand() * 44, z = -26 + rand() * 52;
    const h = heightAt(x, z);
    if (h < 0.5 || h > 3.2) continue;
    if (PLACE_POS.some(([, p]) => Math.hypot(p.x - x, p.z - z) < 2.6)) continue;
    if (fbm(x * 0.35 + 3, z * 0.35) < 0.5) continue;
    const s = 0.8 + rand() * 0.8;
    dummy.position.set(x, h - 0.04, z); dummy.scale.setScalar(s); dummy.rotation.y = rand() * 6; dummy.updateMatrix();
    const lowland = h < 1.1 && rand() < 0.45;
    if (lowland && nr < NR) { rounds.setMatrixAt(nr, dummy.matrix); roundCaps.setMatrixAt(nr, dummy.matrix); rounds.setColorAt(nr, tc.set(ROUND_COLORS[Math.floor(rand() * 4)])); nr++; }
    else if (np < NP) { pines.setMatrixAt(np, dummy.matrix); pineCaps.setMatrixAt(np, dummy.matrix); pines.setColorAt(np, tc.set(PINE_COLORS[Math.floor(rand() * 4)])); np++; }
  }
  pines.count = pineCaps.count = np; rounds.count = roundCaps.count = nr;
  scene.add(pines, pineCaps, rounds, roundCaps);

  // 地點：六角台座＋模型＋標籤
  const placeObjs = {};
  const anim = [];
  const stayNights = { nagoya: 'D1・1晚', takayama: 'D2–3・2晚', kanazawa: 'D4–5・2晚', okuhida: 'D6・1晚', seto: 'D7・1晚' };
  const hexGeo = new THREE.CylinderGeometry(1.32, 1.42, 0.5, 6);
  const hexRim = new THREE.CylinderGeometry(1.36, 1.36, 0.06, 6);
  for (const key of Object.keys(PLACES)) {
    const p = proj(key);
    const kind = PLACES[key].kind;
    const g = new THREE.Group();
    g.position.set(p.x, heightAt(p.x, p.z), p.z);
    g.scale.setScalar(1.45);
    const model = BUILDERS[kind]();
    if (!NO_PLINTH.has(kind)) {
      const hex = new THREE.Mesh(hexGeo, [M.plinth, M.plinthTop, M.plinth]); hex.position.y = -0.13; hex.rotation.y = Math.PI / 6; hex.castShadow = hex.receiveShadow = true; g.add(hex);
      const rim = new THREE.Mesh(hexRim, M.stone); rim.position.y = 0.1; rim.rotation.y = Math.PI / 6; g.add(rim);
      model.position.y = 0.13;
    }
    g.add(model);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.place = key; } });
    scene.add(g);
    if (model.userData.steam || model.userData.gondola || model.userData.plane) anim.push(model);

    const days = DAYS.filter((d) => d.stops.includes(key)).map((d) => d.n);
    const el = document.createElement('button');
    el.className = 'map-label' + (stayNights[key] ? ' stay' : '');
    el.innerHTML = `<span class="dot" style="background:${DAY_COLORS[days[0] - 1]}"></span><b>${PLACES[key].name}</b>` +
      `<span class="meta">${stayNights[key] ? '🏨 ' + stayNights[key] : 'D' + days.join('・D')}</span>`;
    el.addEventListener('click', (e) => { e.stopPropagation(); onPick(key); });
    const label = new CSS2DObject(el);
    label.position.set(0, { shinhotaka: 2.6, okuhida: 0.5, seto: 0.6, furukawa: 1.0 }[key] ?? 1.5, 0);
    g.add(label);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.68, 6), new THREE.MeshBasicMaterial({ color: '#e8643c', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.rotation.z = Math.PI / 6; ring.position.y = 0.16; g.add(ring);
    placeObjs[key] = { group: g, label: el, ring };
  }

  // 路線：沿地形的彩色道路帶
  function ribbon(points, width, closed) {
    const n = points.length, verts = [], idx = [];
    for (let i = 0; i < n; i++) {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
      const t = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
      const nx = -t.z * width / 2, nz = t.x * width / 2;
      const p = points[i];
      verts.push(p.x + nx, p.y, p.z + nz, p.x - nx, p.y, p.z - nz);
      if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    if (closed) idx.push((n - 1) * 2, (n - 1) * 2 + 1, 0, (n - 1) * 2 + 1, 1, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  const lift = (v) => new THREE.Vector3(v.x, Math.max(heightAt(v.x, v.z), 0.05) + 0.07, v.z);
  function legCurve(a, b) {
    const A = proj(a), B = proj(b);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const perp = new THREE.Vector3(-(B.z - A.z), 0, B.x - A.x).normalize().multiplyScalar(A.distanceTo(B) * 0.08);
    const base = new THREE.CatmullRomCurve3([A, mid.add(perp), B]);
    return new THREE.CatmullRomCurve3(base.getPoints(60).map(lift));
  }
  const routeMeshes = [];
  const fullPath = [];
  const roadMat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, transparent: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, transparent: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
  DAYS.forEach((d, i) => {
    const group = new THREE.Group();
    const color = DAY_COLORS[i];
    const add = (pts, closed) => {
      const fine = new THREE.CatmullRomCurve3(pts, closed).getPoints(160).map(lift);
      const edge = new THREE.Mesh(ribbon(fine, 0.42, closed), edgeMat.clone()); edge.receiveShadow = true; group.add(edge);
      const road = new THREE.Mesh(ribbon(fine.map((v) => v.clone().setY(v.y + 0.01)), 0.28, closed), roadMat(color)); road.receiveShadow = true; group.add(road);
    };
    if (d.stops.length === 1) { // 定點日：繞一小圈
      const p = proj(d.stops[0]);
      const loop = [];
      for (let k = 0; k < 40; k++) { const a = (k / 40) * Math.PI * 2; loop.push(lift(new THREE.Vector3(p.x + Math.cos(a) * 2.3, 0, p.z + Math.sin(a) * 2.3))); }
      add(loop, true);
      fullPath.push(...new THREE.CatmullRomCurve3(loop, true).getPoints(40));
    } else {
      for (let s = 0; s < d.stops.length - 1; s++) {
        const curve = legCurve(d.stops[s], d.stops[s + 1]);
        add(curve.points, false);
        fullPath.push(...curve.getPoints(80));
      }
    }
    group.userData.day = d.n;
    scene.add(group); routeMeshes.push(group);
  });

  // 自駕車（沿整趟路線循環移動）
  const car = new THREE.Group();
  car.add(box(0.42, 0.16, 0.24, M.red)); car.add(box(0.24, 0.12, 0.2, M.glass, -0.03, 0.16)); car.add(box(0.2, 0.04, 0.2, M.snow, -0.03, 0.28));
  [[-0.13, 0.13], [0.13, 0.13], [-0.13, -0.13], [0.13, -0.13]].forEach(([x, z]) => car.add(box(0.08, 0.08, 0.04, M.black, x, -0.03, z)));
  car.scale.setScalar(1.3); car.traverse((o) => (o.castShadow = true)); scene.add(car);
  const carCurve = new THREE.CatmullRomCurve3(fullPath);
  const carLen = fullPath.length;

  // 船（日本海、伊勢灣）
  const boats = [];
  const boatSpots = [[-14, -19, 2.5], [-17, -12, 3], [-8, 22, 2], [-3, 24, 2.5], [18, 6, 3], [-12, -24, 2.2]];
  boatSpots.forEach(([x, z, r], i) => {
    const b = new THREE.Group();
    b.add(box(0.6, 0.12, 0.22, i % 2 ? M.wall : M.red)); b.add(box(0.22, 0.14, 0.16, M.wall, -0.08, 0.12)); b.add(box(0.06, 0.03, 0.18, M.window, -0.08, 0.2));
    if (i % 3 === 0) { b.add(box(0.02, 0.5, 0.02, M.wood, 0.1, 0.12)); b.add(prism(0.3, 0.42, 0.01, M.snow, 0.17, 0.18)); }
    b.scale.setScalar(1.4); b.traverse((o) => (o.castShadow = true));
    b.userData = { x, z, r, a: rand() * 6.28, s: 0.05 + rand() * 0.05 }; scene.add(b); boats.push(b);
  });

  // 雲（會投下影子）
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1, transparent: true, opacity: 0.92 });
  const clouds = [];
  for (let i = 0; i < 7; i++) {
    const parts = [];
    for (let k = 0; k < 4; k++) parts.push(new THREE.IcosahedronGeometry(0.9 + rand() * 0.8, 0).translate((k - 1.5) * 1.1, rand() * 0.4, (rand() - 0.5) * 0.8));
    const cl = new THREE.Mesh(mergeGeometries(parts), cloudMat); cl.scale.set(1.4, 0.7, 1);
    cl.position.set(-25 + rand() * 50, 9 + rand() * 3, -28 + rand() * 56); cl.castShadow = true;
    scene.add(cl); clouds.push(cl);
  }

  // 下雪粒子
  const SN = 2200;
  const snowGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(SN * 3);
  for (let i = 0; i < SN; i++) sp.set([-25 + Math.random() * 54, Math.random() * 25, -30 + Math.random() * 60], i * 3);
  snowGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.12, transparent: true, opacity: 0.85, depthWrite: false }));
  scene.add(snow);

  // 白天／黃昏／夜晚
  let timeKey = 'day';
  function setTime(k) {
    timeKey = k; const t = TIMES[k];
    scene.background = skies[k]; scene.fog.color.set(t.fog);
    hemi.color.set(t.hemi[0]); hemi.groundColor.set(t.hemi[1]); hemi.intensity = t.hemi[2];
    sun.color.set(t.sun[0]); sun.intensity = t.sun[1]; sun.position.set(...t.sunPos);
    GLOW.forEach((m) => (m.emissiveIntensity = t.glow));
    renderer.toneMappingExposure = t.exposure; sea.material.color.set(t.sea);
    shore.material.opacity = k === 'night' ? 0.45 : 1;
    cloudMat.color.set(k === 'dusk' ? '#f4e2dc' : '#ffffff');
    container.dataset.time = k;
  }
  setTime('day');

  // 點擊 3D 模型
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  let downAt = null;
  labelRenderer.domElement.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
  labelRenderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(Object.values(placeObjs).map((o) => o.group), true)[0];
    if (hit) onPick(hit.object.userData.place);
  });

  // 鏡頭飛行
  let fly = null;
  function flyTo(target, dist = 16) {
    const t = target.clone();
    const dir = camera.position.clone().sub(controls.target).normalize();
    fly = { from: camera.position.clone(), fromT: controls.target.clone(), to: t.clone().add(dir.multiplyScalar(dist)).setY(t.y + dist * 0.75), toT: t, k: 0 };
  }

  const state = { animate: true, snow: true, carT: 0 };
  const clock = new THREE.Clock();
  let panelOffset = 0, curOffset = 0;
  function applyOffset() {
    const w = container.clientWidth, h = container.clientHeight;
    if (Math.abs(curOffset) < 0.5) camera.clearViewOffset(); else camera.setViewOffset(w, h, -curOffset, 0, w, h);
  }
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h); labelRenderer.setSize(w, h);
    camera.aspect = w / h; applyOffset(); camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  const listeners = [];
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    if (fly) {
      fly.k = Math.min(1, fly.k + dt * 1.2);
      const e = 1 - Math.pow(1 - fly.k, 3);
      camera.position.lerpVectors(fly.from, fly.to, e); controls.target.lerpVectors(fly.fromT, fly.toT, e);
      if (fly.k >= 1) fly = null;
    }
    if (curOffset !== panelOffset) { curOffset += (panelOffset - curOffset) * Math.min(1, dt * 6); if (Math.abs(panelOffset - curOffset) < 0.5) curOffset = panelOffset; applyOffset(); }
    controls.update();
    if (state.animate) {
      state.carT = (state.carT + dt * 0.012) % 1;
      const p = carCurve.getPointAt(state.carT), q = carCurve.getPointAt((state.carT + 0.002) % 1);
      car.position.copy(p); car.lookAt(q); car.rotateY(-Math.PI / 2);
      const idx = Math.floor(state.carT * carLen);
      listeners.forEach((fn) => fn(state.carT, idx));
      for (const g of anim) {
        if (g.userData.steam) g.userData.steam.forEach((s) => { s.userData.t = (s.userData.t + dt * 0.25) % 1; s.position.y = 0.1 + s.userData.t * 1.0; s.material.opacity = 0.55 * (1 - s.userData.t); s.scale.setScalar(0.6 + s.userData.t * 1.4); });
        if (g.userData.gondola) { const [a, b] = g.userData.cable; const k = (Math.sin(t * 0.4) + 1) / 2; g.userData.gondola.position.lerpVectors(a, b, k).add(new THREE.Vector3(0, -0.22, 0)); }
      }
      for (const b of boats) {
        const u = b.userData; u.a += dt * u.s;
        b.position.set(u.x + Math.cos(u.a) * u.r, 0.02 + Math.sin(t * 2 + u.x) * 0.03, u.z + Math.sin(u.a) * u.r);
        b.rotation.y = -u.a; b.rotation.z = Math.sin(t * 1.5 + u.z) * 0.05;
      }
      // 鏡頭拉近時雲淡出，避免穿過雲
      for (const cl of clouds) { cl.position.x += dt * 0.35; if (cl.position.x > 32) cl.position.x = -32; }
      shore.material.opacity = (timeKey === 'night' ? 0.45 : 0.85) + Math.sin(t * 1.2) * 0.12;
    }
    if (state.snow) {
      const arr = snowGeo.attributes.position.array;
      for (let i = 0; i < SN; i++) {
        arr[i * 3 + 1] -= dt * (1.2 + (i % 7) * 0.12);
        arr[i * 3] += Math.sin(t + i) * dt * 0.2;
        if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 25;
      }
      snowGeo.attributes.position.needsUpdate = true;
    }
    const camDist = camera.position.distanceTo(controls.target);
    cloudMat.opacity = ({ day: 0.92, dusk: 0.6, night: 0 })[timeKey] * smooth(32, 48, camDist); clouds.forEach((cl) => (cl.visible = cloudMat.opacity > 0.01));
    for (const o of Object.values(placeObjs)) if (o.ring.material.opacity > 0) o.ring.material.opacity = 0.45 + Math.sin(t * 4) * 0.3;
    renderer.render(scene, camera); labelRenderer.render(scene, camera);
  });

  return {
    flyToPlace(key, dist) { const g = placeObjs[key].group; flyTo(g.position.clone(), dist); },
    home() { fly = { from: camera.position.clone(), fromT: controls.target.clone(), to: homePos(), toT: HOME.target.clone(), k: 0 }; },
    zoom(f) { const off = camera.position.clone().sub(controls.target).multiplyScalar(f); fly = { from: camera.position.clone(), fromT: controls.target.clone(), to: controls.target.clone().add(off), toT: controls.target.clone(), k: 0 }; },
    highlightDay(n) {
      routeMeshes.forEach((g) => g.children.forEach((m) => { m.material.opacity = !n || g.userData.day === n ? 1 : 0.15; }));
      const keys = n ? DAYS[n - 1].stops : [];
      for (const [k, o] of Object.entries(placeObjs)) {
        o.ring.material.opacity = keys.includes(k) ? 0.5 : 0;
        o.label.classList.toggle('dim', !!n && !keys.includes(k));
        o.label.classList.toggle('active', keys.includes(k));
      }
      if (n) {
        const box3 = new THREE.Box3(); keys.forEach((k) => box3.expandByPoint(placeObjs[k].group.position));
        const size = box3.getSize(new THREE.Vector3()).length();
        flyTo(box3.getCenter(new THREE.Vector3()), Math.max(18, size * 2.0));
      }
    },
    selectPlace(key) {
      for (const [k, o] of Object.entries(placeObjs)) { o.ring.material.opacity = k === key ? 0.5 : 0; o.label.classList.toggle('active', k === key); o.label.classList.remove('dim'); }
      routeMeshes.forEach((g) => g.children.forEach((m) => (m.material.opacity = 1)));
    },
    setPanelOffset(px) { panelOffset = window.innerWidth > 900 ? px : 0; },
    setAnimate(v) { state.animate = v; }, setSnow(v) { state.snow = v; snow.visible = v; },
    setTime, get time() { return timeKey; },
    get animate() { return state.animate; },
    onCarMove(fn) { listeners.push(fn); },
    dayAtCar(t) { // 由車子進度推算目前是第幾天
      let acc = 0; const lens = DAYS.map((d) => (d.stops.length === 1 ? 41 : (d.stops.length - 1) * 81)); const total = lens.reduce((a, b) => a + b, 0);
      for (let i = 0; i < lens.length; i++) { acc += lens[i]; if (t * total < acc) return i + 1; }
      return 8;
    },
  };
}
