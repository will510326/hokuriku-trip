import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
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
  const land = smooth(0.6, -0.8, landSdf(x, z));
  let m = 0;
  m += 5.2 * gauss(x, z, 12.5, -7, 3.6, 9);    // 北阿爾卑斯
  m += 3.0 * gauss(x, z, -6, -6.5, 3.2, 3.5);  // 白山
  m += 1.6 * gauss(x, z, 2.5, -3, 6, 5);       // 飛驒高地
  m += 1.0 * gauss(x, z, -1, 4, 6, 4);         // 美濃丘陵
  let h = 0.3 + (fbm(x * 0.6, z * 0.6) - 0.4) * 0.35 + m * (0.55 + fbm(x * 0.45 + 9, z * 0.45) * 0.9);
  for (const [, p] of PLACE_POS) {
    const f = gauss(x, z, p.x, p.z, 1.9, 1.9);
    h = h * (1 - f) + 0.32 * f;
  }
  return -0.7 + (h + 0.7) * land;
}

// ---------- 小模型 ----------
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });
const M = {
  snow: mat('#ffffff'), wall: mat('#f3efe6'), dark: mat('#3b3f4a'), wood: mat('#8a5a3c'), roofGreen: mat('#4f8a7a'),
  gold: mat('#e2b13c', { metalness: 0.4, roughness: 0.4 }), thatch: mat('#9c7a4e'), glass: mat('#9cc6e6', { roughness: 0.2, metalness: 0.3 }),
  red: mat('#d9534f'), tree: mat('#2f6b4f'), trunk: mat('#6b4a32'), road: mat('#5b6270'), water: mat('#59c3e6', { roughness: 0.15 }),
  orange: mat('#f2994a'), concrete: mat('#c9ced6'),
};
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
  g.add(box(0.08 * s, 0.18 * s, 0.08 * s, M.trunk));
  const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.28 * s, 0.5 * s, 6), M.tree); c1.position.y = 0.4 * s; g.add(c1);
  const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.17 * s, 0.25 * s, 6), M.snow); c2.position.y = 0.62 * s; g.add(c2);
  g.position.set(x, 0, z); g.traverse((o) => (o.castShadow = true)); return g;
}
function house(x, z, rot = 0, roof = M.dark, s = 1) {
  const g = new THREE.Group();
  g.add(box(0.5 * s, 0.32 * s, 0.4 * s, M.wall));
  g.add(prism(0.62 * s, 0.24 * s, 0.48 * s, roof, 0, 0.32 * s, 0));
  g.add(prism(0.5 * s, 0.12 * s, 0.5 * s, M.snow, 0, 0.44 * s, 0));
  g.position.set(x, 0, z); g.rotation.y = rot; return g;
}
function gassho(x, z, rot = 0) {
  const g = new THREE.Group();
  g.add(box(0.5, 0.22, 0.75, M.wood));
  g.add(prism(0.62, 0.7, 0.8, M.thatch, 0, 0.22, 0));
  g.add(prism(0.48, 0.42, 0.82, M.snow, 0, 0.5, 0));
  g.position.set(x, 0, z); g.rotation.y = rot; return g;
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
    g.add(box(1.0, 0.18, 1.0, M.concrete));
    g.add(box(0.6, 0.3, 0.6, M.wall, 0, 0.18)); g.add(pyramid(0.85, 0.2, M.roofGreen, 0, 0.48));
    g.add(box(0.42, 0.25, 0.42, M.wall, 0, 0.68)); g.add(pyramid(0.6, 0.22, M.roofGreen, 0, 0.93));
    g.add(box(0.06, 0.08, 0.06, M.gold, 0.12, 1.08)); g.add(box(0.06, 0.08, 0.06, M.gold, -0.12, 1.08));
    [[1.2, 1.3, -0.6], [1.6, 1.6, -0.1], [1.25, 1.1, 0.5], [-1.2, 0.8, 0.6]].forEach(([x, h, z]) => g.add(box(0.36, h, 0.36, M.glass, x, 0, z)));
    g.add(pine(-1.0, -0.6, 1)); g.add(pine(-0.7, -0.9, 0.8));
    return g;
  },
  town() {
    const g = new THREE.Group();
    [[-0.5, -0.3, 0.2], [0.2, -0.5, 0], [0.6, 0.2, 1.5], [-0.3, 0.5, 1.4], [0.9, -0.5, 0.3]].forEach(([x, z, r]) => g.add(house(x, z, r)));
    g.add(box(2.4, 0.03, 0.22, M.water, 0, 0, 0.05));
    g.add(pine(-1.1, 0.2)); g.add(pine(1.2, 0.6, 0.8));
    return g;
  },
  oldtown() { // 高山：古街＋紅色中橋
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) { g.add(house(-1 + i * 0.5, -0.45, 0, M.wood)); g.add(house(-1 + i * 0.5, 0.45, Math.PI, M.wood)); }
    g.add(box(0.3, 0.03, 2.6, M.water, 1.6, 0, 0));
    g.add(box(0.6, 0.08, 0.22, M.red, 1.6, 0.06, 0));
    g.add(gassho(-1.5, 1.2, 0.4)); g.add(gassho(-1.0, 1.4, 0.2));
    return g;
  },
  gassho() {
    const g = new THREE.Group();
    [[-0.6, -0.5, 0.1], [0.3, -0.6, -0.2], [0.9, 0.2, 0.2], [-0.2, 0.4, 0], [-1.0, 0.6, 0.3], [0.5, 0.9, -0.1]].forEach(([x, z, r]) => g.add(gassho(x, z, r)));
    for (let i = 0; i < 6; i++) g.add(pine(-1.6 + Math.random() * 3.2, -1.2 - Math.random() * 0.5, 0.8));
    return g;
  },
  garden() { // 金澤：城＋兼六園雪吊
    const g = new THREE.Group();
    g.add(box(0.8, 0.12, 0.6, M.concrete, -0.6, 0, -0.3));
    g.add(box(0.6, 0.35, 0.36, M.wall, -0.6, 0.12, -0.3)); g.add(prism(0.76, 0.24, 0.46, M.concrete, -0.6, 0.47, -0.3));
    const pond = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.03, 16), M.water); pond.position.set(0.6, 0.02, 0.3); g.add(pond);
    for (const [x, z] of [[0.1, 0.6], [1.1, -0.2], [0.4, -0.5]]) {
      g.add(pine(x, z, 1.1));
      const rope = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 10, 1, true), new THREE.MeshBasicMaterial({ color: '#c9a86b', wireframe: true }));
      rope.position.set(x, 0.55, z); g.add(rope);
    }
    // 鼓門
    g.add(box(0.06, 0.5, 0.06, M.wood, 1.3, 0, 0.8)); g.add(box(0.06, 0.5, 0.06, M.wood, 1.6, 0, 0.8)); g.add(box(0.5, 0.06, 0.12, M.wood, 1.45, 0.5, 0.8));
    return g;
  },
  onsen() {
    const g = new THREE.Group();
    g.add(box(1.0, 0.35, 0.5, M.wood, -0.3, 0, -0.3)); g.add(prism(1.15, 0.28, 0.6, M.dark, -0.3, 0.35, -0.3)); g.add(prism(1.0, 0.14, 0.62, M.snow, -0.3, 0.5, -0.3));
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 12), M.water); pool.position.set(0.55, 0.03, 0.35); g.add(pool);
    for (let i = 0; i < 8; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09), M.concrete); const a = (i / 8) * Math.PI * 2; r.position.set(0.55 + Math.cos(a) * 0.45, 0.04, 0.35 + Math.sin(a) * 0.45); g.add(r); }
    const steam = [];
    const sm = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 });
    for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), sm.clone()); s.position.set(0.55, 0.1 + i * 0.15, 0.35); s.userData.t = i / 6; g.add(s); steam.push(s); }
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
    g.add(box(0.9, 0.36, 0.6, M.wood)); g.add(prism(1.05, 0.4, 0.7, M.dark, 0, 0.36)); g.add(prism(0.9, 0.22, 0.72, M.snow, 0, 0.55));
    g.add(box(0.3, 0.12, 0.18, M.red, 0.8, 0, 0.3)); // 車
    g.add(pine(-0.8, -0.4)); g.add(pine(-0.6, 0.5, 0.8));
    return g;
  },
  ghibli() {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.8, 7), M.trunk); trunk.position.set(-0.4, 0.4, 0); g.add(trunk);
    const crown = mat('#3f8f5a');
    [[-0.4, 1.0, 0, 0.55], [-0.75, 0.85, 0.2, 0.38], [-0.05, 0.85, -0.15, 0.4], [-0.4, 1.35, 0.05, 0.35]].forEach(([x, y, z, r]) => {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), crown); s.position.set(x, y, z); s.castShadow = true; g.add(s);
    });
    g.add(box(0.5, 0.4, 0.4, M.wall, 0.6, 0, 0.2)); g.add(prism(0.62, 0.3, 0.5, M.orange, 0.6, 0.4, 0.2));
    g.add(box(0.14, 0.7, 0.14, M.wall, 0.95, 0, -0.35)); g.add(pyramid(0.24, 0.22, M.red, 0.95, 0.7, -0.35));
    return g;
  },
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
  scene.background = new THREE.Color('#dbeaf5');
  scene.fog = new THREE.Fog('#dbeaf5', 110, 300);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
  const HOME = { pos: new THREE.Vector3(16, 33, 38), target: new THREE.Vector3(1.5, 0, -1.5) };
  // 直式螢幕（手機）視角較窄，鏡頭拉遠
  const homePos = () => { const a = container.clientWidth / container.clientHeight; const k = a < 1 ? Math.min(2.6, 1.1 / a) : 1; return HOME.pos.clone().sub(HOME.target).multiplyScalar(k).add(HOME.target); };
  camera.position.copy(homePos());

  const controls = new OrbitControls(camera, labelRenderer.domElement);
  controls.target.copy(HOME.target);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.42;
  controls.minDistance = 8; controls.maxDistance = 170;

  scene.add(new THREE.HemisphereLight('#ffffff', '#9fb4c8', 1.4));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.position.set(25, 40, 18); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
  scene.add(sun);

  // 海
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#7cc4e8', roughness: 0.3, metalness: 0.1 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -0.05; sea.receiveShadow = true; scene.add(sea);

  // 地形（low-poly 平面著色）
  const W = 46, D = 54;
  let geo = new THREE.PlaneGeometry(W, D, 115, 135).rotateX(-Math.PI / 2);
  geo.translate(1.5, 0, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo = geo.toNonIndexed(); geo.computeVertexNormals();
  const p2 = geo.attributes.position, nrm = geo.attributes.normal;
  const colors = new Float32Array(p2.count * 3);
  const cSnow = new THREE.Color('#f7fafc'), cSnow2 = new THREE.Color('#e4edf4'), cRock = new THREE.Color('#8e9aa8'), cBeach = new THREE.Color('#cfd8df'), cField = new THREE.Color('#dfe9e2');
  const c = new THREE.Color();
  for (let i = 0; i < p2.count; i += 3) {
    const y = (p2.getY(i) + p2.getY(i + 1) + p2.getY(i + 2)) / 3;
    const ny = nrm.getY(i);
    if (y < 0.12) c.copy(cBeach);
    else if (ny < 0.72 && y > 0.8) c.copy(cRock);
    else if (y > 2.4) c.copy(cSnow);
    else c.copy(hash(p2.getX(i), p2.getZ(i)) > 0.5 ? cSnow2 : cField).lerp(cSnow, Math.min(1, y / 2.4));
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
  terrain.receiveShadow = true; terrain.castShadow = true; scene.add(terrain);

  // 樹林
  const treeGeo = new THREE.ConeGeometry(0.22, 0.6, 5); treeGeo.translate(0, 0.3, 0);
  const capGeo = new THREE.ConeGeometry(0.13, 0.22, 5); capGeo.translate(0, 0.56, 0);
  const N = 520;
  const trees = new THREE.InstancedMesh(treeGeo, M.tree, N), caps = new THREE.InstancedMesh(capGeo, M.snow, N);
  trees.castShadow = true;
  const dummy = new THREE.Object3D();
  let placed = 0;
  for (let tries = 0; tries < 20000 && placed < N; tries++) {
    const x = -20 + Math.random() * 44, z = -26 + Math.random() * 52;
    const h = heightAt(x, z);
    if (h < 0.35 || h > 3.2) continue;
    if (PLACE_POS.some(([, p]) => Math.hypot(p.x - x, p.z - z) < 2.8)) continue;
    if (fbm(x * 0.35 + 3, z * 0.35) < 0.52) continue;
    const s = 0.7 + Math.random() * 0.8;
    dummy.position.set(x, h - 0.05, z); dummy.scale.setScalar(s); dummy.rotation.y = Math.random() * 6; dummy.updateMatrix();
    trees.setMatrixAt(placed, dummy.matrix); caps.setMatrixAt(placed, dummy.matrix); placed++;
  }
  trees.count = caps.count = placed;
  scene.add(trees, caps);

  // 地點模型＋標籤
  const placeObjs = {};
  const anim = [];
  const stayNights = { nagoya: 'D1・1晚', takayama: 'D2–3・2晚', kanazawa: 'D4–5・2晚', okuhida: 'D6・1晚', seto: 'D7・1晚' };
  for (const key of Object.keys(PLACES)) {
    const p = proj(key);
    const g = BUILDERS[PLACES[key].kind]();
    g.position.set(p.x, heightAt(p.x, p.z), p.z);
    g.scale.setScalar(1.45);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.place = key; } });
    scene.add(g);
    if (g.userData.steam || g.userData.gondola || g.userData.plane) anim.push(g);

    const days = DAYS.filter((d) => d.stops.includes(key)).map((d) => d.n);
    const el = document.createElement('button');
    el.className = 'map-label' + (stayNights[key] ? ' stay' : '');
    el.innerHTML = `<span class="dot" style="background:${DAY_COLORS[days[0] - 1]}"></span><b>${PLACES[key].name}</b>` +
      `<span class="meta">${stayNights[key] ? '🏨 ' + stayNights[key] : 'D' + days.join('・D')}</span>`;
    el.addEventListener('click', (e) => { e.stopPropagation(); onPick(key); });
    const label = new CSS2DObject(el);
    label.position.set(0, { shinhotaka: 2.6, okuhida: 0.4, seto: 0.5, furukawa: 0.9 }[key] ?? 1.4, 0);
    g.add(label);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.6, 40), new THREE.MeshBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
    placeObjs[key] = { group: g, label: el, ring };
  }

  // 路線：每天一段，沿地形抬高
  function legCurve(a, b) {
    const A = proj(a), B = proj(b);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const perp = new THREE.Vector3(-(B.z - A.z), 0, B.x - A.x).normalize().multiplyScalar(A.distanceTo(B) * 0.08);
    const base = new THREE.CatmullRomCurve3([A, mid.add(perp), B]);
    const pts = base.getPoints(60).map((v) => new THREE.Vector3(v.x, Math.max(heightAt(v.x, v.z), 0.05) + 0.12, v.z));
    return new THREE.CatmullRomCurve3(pts);
  }
  const routeMeshes = [];
  const fullPath = [];
  DAYS.forEach((d, i) => {
    const group = new THREE.Group();
    const color = DAY_COLORS[i];
    let stops = d.stops;
    if (stops.length === 1) { // 定點日：繞一小圈
      const p = proj(stops[0]);
      const loop = [];
      for (let k = 0; k <= 40; k++) { const a = (k / 40) * Math.PI * 2; loop.push(new THREE.Vector3(p.x + Math.cos(a) * 1.2, 0, p.z + Math.sin(a) * 1.2)); }
      const curve = new THREE.CatmullRomCurve3(loop.map((v) => new THREE.Vector3(v.x, heightAt(v.x, v.z) + 0.12, v.z)), true);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.07, 6, true), new THREE.MeshStandardMaterial({ color, transparent: true })));
      fullPath.push(...curve.getPoints(40));
    } else {
      for (let s = 0; s < stops.length - 1; s++) {
        const curve = legCurve(stops[s], stops[s + 1]);
        group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.09, 6, false), new THREE.MeshStandardMaterial({ color, transparent: true })));
        fullPath.push(...curve.getPoints(80));
      }
    }
    group.userData.day = d.n;
    scene.add(group); routeMeshes.push(group);
  });

  // 自駕車（沿整趟路線循環移動）
  const car = new THREE.Group();
  car.add(box(0.42, 0.16, 0.24, M.red)); car.add(box(0.24, 0.12, 0.2, M.glass, -0.03, 0.16)); car.add(box(0.2, 0.04, 0.2, M.snow, -0.03, 0.28));
  car.scale.setScalar(1.3); scene.add(car);
  const carCurve = new THREE.CatmullRomCurve3(fullPath);
  const carLen = fullPath.length;

  // 下雪粒子
  const SN = 2500;
  const snowGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(SN * 3);
  for (let i = 0; i < SN; i++) sp.set([-25 + Math.random() * 54, Math.random() * 25, -30 + Math.random() * 60], i * 3);
  snowGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.12, transparent: true, opacity: 0.85, depthWrite: false }));
  scene.add(snow);

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
    for (const o of Object.values(placeObjs)) if (o.ring.material.opacity > 0) o.ring.material.opacity = 0.35 + Math.sin(t * 4) * 0.25;
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
    get animate() { return state.animate; },
    onCarMove(fn) { listeners.push(fn); },
    dayAtCar(t) { // 由車子進度推算目前是第幾天
      let acc = 0; const lens = DAYS.map((d) => (d.stops.length === 1 ? 41 : (d.stops.length - 1) * 81)); const total = lens.reduce((a, b) => a + b, 0);
      for (let i = 0; i < lens.length; i++) { acc += lens[i]; if (t * total < acc) return i + 1; }
      return 8;
    },
  };
}
