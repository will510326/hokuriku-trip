import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLACES, DAYS } from './data.js';
import { proj, hash, vnoise, smooth, seeded, landSdf, heightAt, buildRoutes, BOAT_SPOTS, treePositions, PLACE_SCALE, NO_PLINTH, BRIDGE, BRIDGE_Y, ropewayTop } from './terrain.js';
export { proj, heightAt };

export const DAY_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#14b8a6', '#a855f7', '#f97316', '#ec4899'];
const rand = seeded(7); // 固定亂數，每次畫面一致

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
// 行人：固定位置（避開建築、水道）
function people(g, spots) { spots.forEach(([x, z], i) => g.add(person(x, z, i % 2 ? M.coat2 : M.coat))); }

// 船：尖船頭的船身（俯視輪廓擠出）
function boatHull(color) {
  const s = new THREE.Shape();
  s.moveTo(-0.32, -0.11); s.lineTo(0.14, -0.11); s.quadraticCurveTo(0.3, -0.08, 0.36, 0); s.quadraticCurveTo(0.3, 0.08, 0.14, 0.11); s.lineTo(-0.32, 0.11); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 1 });
  g.rotateX(-Math.PI / 2); // 擠出方向朝上
  return new THREE.Mesh(g, color);
}

// 所有模型都控制在半徑約 1.25 內（六角台座半徑 1.32）
const BUILDERS = {
  airport() { // 人工島：跑道在南、航廈在北，中間留給聯絡道路
    const g = new THREE.Group();
    g.add(box(2.0, 0.04, 0.4, M.road, 0, 0, 0.36));
    for (let i = -0.8; i <= 0.8; i += 0.4) g.add(box(0.16, 0.045, 0.04, M.snow, i, 0, 0.36));
    g.add(box(0.9, 0.3, 0.4, M.glass, 0.15, 0, -0.62));
    g.add(box(0.12, 0.6, 0.12, M.concrete, -0.65, 0, -0.55));
    g.add(box(0.24, 0.12, 0.24, M.glass, -0.65, 0.6, -0.55));
    const plane = new THREE.Group();
    plane.add(box(0.6, 0.1, 0.12, M.snow)); plane.add(box(0.16, 0.03, 0.66, M.snow, 0, 0.04)); plane.add(box(0.1, 0.16, 0.03, M.red, -0.26, 0.05));
    plane.position.set(-0.45, 0.05, 0.36); g.add(plane);
    g.userData.plane = plane; return g;
  },
  castle() { // 名古屋城＋車站大樓
    const g = new THREE.Group();
    g.add(box(1.0, 0.18, 1.0, M.stone));
    g.add(box(0.6, 0.3, 0.6, M.wall, 0, 0.18)); g.add(pyramid(0.85, 0.2, M.roofGreen, 0, 0.48));
    g.add(box(0.42, 0.25, 0.42, M.wall, 0, 0.68)); g.add(pyramid(0.6, 0.22, M.roofGreen, 0, 0.93));
    g.add(box(0.06, 0.08, 0.06, M.gold, 0.12, 1.08)); g.add(box(0.06, 0.08, 0.06, M.gold, -0.12, 1.08));
    [[0.78, 1.3, -0.58], [0.9, 1.6, -0.08], [0.76, 1.1, 0.5], [-0.8, 0.8, 0.55]].forEach(([x, h, z]) => g.add(box(0.32, h, 0.32, M.glass, x, 0, z)));
    g.add(pine(-0.75, -0.45, 1)); g.add(pine(-0.45, -0.8, 0.8));
    people(g, [[0, 0.72], [0.32, 0.8], [-0.4, 0.82], [0.55, -0.9], [-0.7, 0.05]]);
    return g;
  },
  town() { // 兩排房子夾一條水道，水道上有小橋
    const g = new THREE.Group();
    [[-0.6, -0.5], [0.04, -0.56], [0.66, -0.46]].forEach(([x, z]) => g.add(house(x, z, 0)));
    [[-0.3, 0.6], [0.48, 0.6]].forEach(([x, z]) => g.add(house(x, z, Math.PI)));
    g.add(box(1.9, 0.03, 0.22, M.water, 0, 0, 0));
    g.add(box(0.2, 0.06, 0.32, M.red, 0.2, 0.02, 0));
    g.add(pine(-0.85, 0.32)); g.add(pine(0.95, 0.3, 0.7)); g.add(lantern(-0.05, 0.22)); g.add(snowman(0.05, -0.24));
    people(g, [[-0.5, 0.22], [0.35, -0.22], [0.62, 0.2], [-0.38, -0.22]]);
    return g;
  },
  oldtown() { // 高山：古街兩排町屋＋宮川上的紅色中橋
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) { g.add(house(-0.78 + i * 0.45, -0.42, 0, M.wood, 0.85)); g.add(house(-0.78 + i * 0.45, 0.42, Math.PI, M.wood, 0.85)); }
    g.add(box(0.24, 0.03, 0.9, M.water, 0.9, 0, 0));
    g.add(box(0.38, 0.08, 0.2, M.red, 0.9, 0.04, 0));
    g.add(torii(-0.4, 0.85, 0)); g.add(lantern(0.25, 0)); g.add(lantern(-0.45, 0));
    people(g, [[-0.8, 0.06], [-0.2, -0.1], [0.05, 0.1], [0.55, -0.06], [0.9, 0.04]]);
    return g;
  },
  gassho() {
    const g = new THREE.Group();
    [[-0.5, -0.4, 0.1], [0.35, -0.5, -0.2], [0.55, 0.42, 0.2], [-0.35, 0.45, 0]].forEach(([x, z, r]) => g.add(gassho(x, z, r)));
    g.add(snowman(0.1, 0.75));
    people(g, [[-0.05, 0.0], [0.2, 0.05], [0.95, -0.2]]);
    return g;
  },
  garden() { // 金澤：城＋兼六園雪吊＋池塘
    const g = new THREE.Group();
    g.add(box(0.8, 0.12, 0.6, M.stone, -0.5, 0, -0.35));
    g.add(box(0.6, 0.35, 0.36, M.wall, -0.5, 0.12, -0.35)); g.add(prism(0.76, 0.24, 0.46, M.concrete, -0.5, 0.47, -0.35));
    const pond = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 16), M.water); pond.position.set(0.45, 0.02, 0.38); g.add(pond);
    for (const [x, z] of [[-0.15, 0.6], [0.8, -0.3], [0.25, -0.6]]) {
      g.add(pine(x, z, 1.0));
      const rope = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.85, 10, 1, true), new THREE.MeshBasicMaterial({ color: '#c9a86b', wireframe: true }));
      rope.position.set(x, 0.5, z); g.add(rope);
    }
    g.add(lantern(0.05, 0.05));
    people(g, [[-0.3, 0.22], [-0.65, 0.35], [0.4, 0.92], [1.0, 0.15]]);
    return g;
  },
  onsen() {
    const g = new THREE.Group();
    g.add(box(1.0, 0.35, 0.5, M.wood, -0.3, 0, -0.3));
    [-0.6, -0.3, 0].forEach((x) => g.add(box(0.14, 0.12, 0.02, M.window, x, 0.12, -0.04)));
    g.add(prism(1.15, 0.28, 0.6, M.dark, -0.3, 0.35, -0.3)); g.add(prism(1.0, 0.14, 0.62, M.snow, -0.3, 0.5, -0.3));
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 12), M.water); pool.position.set(0.5, 0.03, 0.4); g.add(pool);
    for (let i = 0; i < 9; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09), M.stone); const a = (i / 9) * Math.PI * 2; r.position.set(0.5 + Math.cos(a) * 0.45, 0.04, 0.4 + Math.sin(a) * 0.45); g.add(r); }
    g.add(lantern(-0.35, 0.45)); g.add(lantern(0.98, -0.1));
    people(g, [[-0.65, 0.2], [-0.1, 0.18]]);
    const steam = [];
    const sm = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false });
    for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), sm.clone()); s.position.set(0.5, 0.1 + i * 0.15, 0.4); s.userData.t = i / 7; g.add(s); steam.push(s); }
    g.userData.steam = steam; return g;
  },
  ropeway() { // 山頂站高度在放到地圖上後依地形決定
    const g = new THREE.Group();
    g.add(box(0.5, 0.35, 0.4, M.concrete, -0.8, 0, 0.6));
    const top = box(0.4, 0.3, 0.35, M.concrete, 0.9, 0, -0.7); g.add(top);
    const cableGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    g.add(new THREE.Line(cableGeo, new THREE.LineBasicMaterial({ color: '#333' })));
    const gondola = box(0.18, 0.16, 0.14, M.red); g.add(gondola);
    g.userData.top = top; g.userData.cableGeo = cableGeo; g.userData.gondola = gondola; return g;
  },
  lodge() {
    const g = new THREE.Group();
    g.add(box(0.9, 0.36, 0.6, M.wood));
    g.add(box(0.16, 0.12, 0.02, M.window, -0.2, 0.12, 0.305)); g.add(box(0.16, 0.12, 0.02, M.window, 0.2, 0.12, 0.305));
    g.add(prism(1.05, 0.4, 0.7, M.dark, 0, 0.36)); g.add(prism(0.9, 0.22, 0.72, M.snow, 0, 0.55));
    g.add(box(0.3, 0.12, 0.18, M.red, 0.8, 0, 0.42)); // 停好的車
    g.add(pine(-0.8, -0.4)); g.add(pine(-0.6, 0.6, 0.8)); g.add(snowman(0.25, 0.75));
    return g;
  },
  ghibli() {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.8, 7), M.trunk); trunk.position.set(-0.4, 0.4, 0); g.add(trunk);
    const crown = mat('#4f9a62');
    [[-0.4, 1.0, 0, 0.55], [-0.72, 0.85, 0.2, 0.38], [-0.08, 0.85, -0.15, 0.4], [-0.4, 1.35, 0.05, 0.35]].forEach(([x, y, z, r]) => {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), crown); s.position.set(x, y, z); s.castShadow = true; g.add(s);
    });
    g.add(box(0.5, 0.4, 0.4, M.wall, 0.6, 0, 0.2)); g.add(box(0.12, 0.12, 0.02, M.window, 0.6, 0.15, 0.405));
    g.add(prism(0.62, 0.3, 0.5, M.orange, 0.6, 0.4, 0.2));
    g.add(box(0.14, 0.7, 0.14, M.wall, 0.9, 0, -0.4)); g.add(pyramid(0.24, 0.22, M.red, 0.9, 0.7, -0.4));
    people(g, [[0.1, 0.62], [-0.3, 0.75], [0.3, -0.5], [-0.8, -0.6], [0.05, 0.05]]);
    return g;
  },
};

// 模型若超出六角台面（內切半徑 1.14），等比例縮小到剛好放得下
function hexExtent(obj) {
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert(), v = new THREE.Vector3();
  let max = 0;
  obj.traverse((m) => {
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
      max = Math.max(max, Math.abs(v.z), Math.abs(0.866 * v.x + 0.5 * v.z), Math.abs(0.866 * v.x - 0.5 * v.z));
    }
  });
  return max;
}
function fitToHex(model, limit) {
  const e = hexExtent(model);
  if (e > limit) model.scale.multiplyScalar(limit / e);
}

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

  // 路線資料（道路只走陸地，往機場走聯絡橋）
  const routes = buildRoutes();

  // 樹林：雪松（三層）＋圓樹；位置避開海、台座與道路
  const tiers = [], caps = [];
  [[0.26, 0.34, 0.25], [0.2, 0.3, 0.45], [0.13, 0.24, 0.63]].forEach(([r, h, y]) => {
    tiers.push(new THREE.ConeGeometry(r, h, 6).translate(0, y, 0));
    caps.push(new THREE.ConeGeometry(r * 0.62, h * 0.45, 6).translate(0, y + h * 0.3, 0));
  });
  tiers.push(new THREE.CylinderGeometry(0.035, 0.045, 0.14, 5).translate(0, 0.07, 0));
  const pineGeo = mergeGeometries(tiers), pineCap = mergeGeometries(caps);
  const roundGeo = mergeGeometries([new THREE.IcosahedronGeometry(0.24, 0).translate(0, 0.42, 0), new THREE.CylinderGeometry(0.035, 0.045, 0.24, 5).translate(0, 0.12, 0).toNonIndexed()]);
  const roundCap = new THREE.IcosahedronGeometry(0.17, 0).scale(1, 0.55, 1).translate(0, 0.58, 0);
  const tp = treePositions(routes, 380, 130);
  const greenMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 });
  const pines = new THREE.InstancedMesh(pineGeo, greenMat, tp.pines.length), pineCaps = new THREE.InstancedMesh(pineCap, M.snow, tp.pines.length);
  const rounds = new THREE.InstancedMesh(roundGeo, greenMat.clone(), tp.rounds.length), roundCaps = new THREE.InstancedMesh(roundCap, M.snow, tp.rounds.length);
  [pines, rounds, pineCaps, roundCaps].forEach((m) => (m.castShadow = true));
  const dummy = new THREE.Object3D(), tc = new THREE.Color();
  const PINE_COLORS = ['#2f6b4f', '#3b7a58', '#28604a', '#467f5c'], ROUND_COLORS = ['#7fa77a', '#93b386', '#6e9b74', '#c99a5a'];
  const placeTrees = (list, mesh, cap, palette) => list.forEach((t, i) => {
    dummy.position.set(t.x, t.y, t.z); dummy.scale.setScalar(t.s); dummy.rotation.y = t.r; dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix); cap.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, tc.set(palette[Math.floor(t.c * palette.length)]));
  });
  placeTrees(tp.pines, pines, pineCaps, PINE_COLORS); placeTrees(tp.rounds, rounds, roundCaps, ROUND_COLORS);
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
    g.scale.setScalar(PLACE_SCALE);
    const model = BUILDERS[kind]();
    if (!NO_PLINTH.has(kind)) {
      const hex = new THREE.Mesh(hexGeo, [M.plinth, M.plinthTop, M.plinth]); hex.position.y = -0.13; hex.rotation.y = Math.PI / 6; hex.castShadow = hex.receiveShadow = true; g.add(hex);
      const rim = new THREE.Mesh(hexRim, M.stone); rim.position.y = 0.1; rim.rotation.y = Math.PI / 6; g.add(rim);
      model.position.y = 0.13;
      fitToHex(model, 1.12);
    }
    if (kind === 'ropeway') { // 山頂站放在真正的山上，纜繩跟著拉過去
      const top = ropewayTop().sub(g.position).divideScalar(PLACE_SCALE);
      model.userData.top.position.set(top.x, top.y, top.z);
      const a = new THREE.Vector3(-0.8, 0.45, 0.6), b = new THREE.Vector3(top.x, top.y + 0.2, top.z);
      model.userData.cableGeo.setFromPoints([a, b]); model.userData.cable = [a, b];
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
    label.position.set(0, { shinhotaka: 1.4, okuhida: 0.5, seto: 0.6 }[key] ?? 1.5, 0);
    g.add(label);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.68, 6), new THREE.MeshBasicMaterial({ color: '#e8643c', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.rotation.z = Math.PI / 6; ring.position.y = 0.16; g.add(ring);
    placeObjs[key] = { group: g, label: el, ring };
  }

  // 路線：沿地形的彩色道路帶
  function ribbon(points, width, closed) {
    const n = points.length, verts = [], idx = [];
    for (let i = 0; i < n; i++) {
      const a = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
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
  const routeMeshes = [];
  const fullPath = [];
  const dayLens = [];
  const roadMat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, transparent: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, transparent: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
  routes.forEach((legs, i) => {
    const group = new THREE.Group();
    const color = DAY_COLORS[i];
    let len = 0;
    legs.forEach((l) => {
      const pts = l.points;
      const edge = new THREE.Mesh(ribbon(pts, 0.42, l.closed), edgeMat.clone()); edge.receiveShadow = true; group.add(edge);
      const road = new THREE.Mesh(ribbon(pts.map((v) => v.clone().setY(v.y + 0.01)), 0.28, l.closed), roadMat(color)); road.receiveShadow = true; group.add(road);
      const path = l.closed ? [...pts, pts[0]] : pts;
      for (let k = 1; k < path.length; k++) len += path[k].distanceTo(path[k - 1]);
      fullPath.push(...path);
    });
    dayLens.push(len);
    group.userData.day = i + 1;
    scene.add(group); routeMeshes.push(group);
  });

  // 中部機場聯絡橋
  {
    const [a, b] = BRIDGE, L = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
    const bridge = new THREE.Group();
    bridge.add(box(L + 0.3, 0.08, 0.56, M.concrete, 0, -0.1, 0));
    bridge.add(box(L + 0.3, 0.07, 0.03, M.red, 0, -0.02, 0.27)); bridge.add(box(L + 0.3, 0.07, 0.03, M.red, 0, -0.02, -0.27));
    for (let x = -L / 2 + 0.3; x <= L / 2 - 0.2; x += 0.7) bridge.add(box(0.14, BRIDGE_Y + 0.25, 0.3, M.concrete, x, -(BRIDGE_Y + 0.35), 0));
    bridge.position.set(mid.x, BRIDGE_Y, mid.z);
    bridge.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    bridge.traverse((o) => { o.castShadow = o.receiveShadow = true; });
    scene.add(bridge);
  }

  // 自駕車（沿整趟路線循環移動）
  const car = new THREE.Group();
  car.add(box(0.42, 0.16, 0.24, M.red)); car.add(box(0.24, 0.12, 0.2, M.glass, -0.03, 0.16)); car.add(box(0.2, 0.04, 0.2, M.snow, -0.03, 0.28));
  [[-0.13, 0.13], [0.13, 0.13], [-0.13, -0.13], [0.13, -0.13]].forEach(([x, z]) => car.add(box(0.08, 0.08, 0.04, M.black, x, -0.03, z)));
  car.scale.setScalar(1.3); car.traverse((o) => (o.castShadow = true)); scene.add(car);
  const carCurve = new THREE.CatmullRomCurve3(fullPath, false, 'centripetal');
  const carLen = fullPath.length;

  // 船（日本海、伊勢灣、太平洋）：尖船頭、沿航線方向前進
  const boats = [];
  BOAT_SPOTS.forEach(([x, z, r], i) => {
    const b = new THREE.Group();
    b.add(boatHull(i % 2 ? M.wall : M.red));
    b.add(box(0.2, 0.13, 0.15, M.wall, -0.1, 0.12)); b.add(box(0.21, 0.04, 0.16, M.window, -0.1, 0.17));
    if (i % 3 === 0) { // 帆船：桅杆＋沿船身方向的三角帆
      b.add(box(0.02, 0.55, 0.02, M.wood, 0.08, 0.12));
      b.add(prism(0.32, 0.46, 0.01, M.snow, -0.08, 0.2, 0));
    }
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
        b.rotation.y = -(u.a + Math.PI / 2); b.rotation.x = Math.sin(t * 1.5 + u.z) * 0.05; // 船頭朝前進方向
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
    // 檢查用：每個地點模型離中心最遠的「六角形距離」（台座本地座標；台面內切半徑約 1.14）
    debugExtents() {
      const out = {}, v = new THREE.Vector3();
      for (const [k, o] of Object.entries(placeObjs)) {
        if (NO_PLINTH.has(PLACES[k].kind)) continue;
        o.group.updateMatrixWorld(true);
        let max = 0, worst = '';
        o.group.children.forEach((c) => { if (c.isMesh) return; c.traverse((m) => {
          if (!m.isMesh || m.geometry.type === 'RingGeometry') return;
          const pos = m.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); o.group.worldToLocal(v); const r = Math.max(Math.abs(v.z), Math.abs(0.866 * v.x + 0.5 * v.z), Math.abs(0.866 * v.x - 0.5 * v.z)); if (r > max) { max = r; worst = m.geometry.type + '@' + v.x.toFixed(2) + ',' + v.z.toFixed(2); } }
        }); });
        out[k] = { max: +max.toFixed(2), worst };
      }
      return out;
    },
    setPanelOffset(px) { panelOffset = window.innerWidth > 900 ? px : 0; },
    setAnimate(v) { state.animate = v; }, setSnow(v) { state.snow = v; snow.visible = v; },
    setTime, get time() { return timeKey; },
    get animate() { return state.animate; },
    onCarMove(fn) { listeners.push(fn); },
    dayAtCar(t) { // 由車子進度推算目前是第幾天
      let acc = 0; const total = dayLens.reduce((a, b) => a + b, 0);
      for (let i = 0; i < dayLens.length; i++) { acc += dayLens[i]; if (t * total < acc) return i + 1; }
      return 8;
    },
  };
}
