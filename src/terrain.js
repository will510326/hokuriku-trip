// 地形、路線、船、樹的位置計算（不碰畫面，scene.js 與 scripts/check.mjs 共用）
import * as THREE from 'three';
import { PLACES, DAYS } from './data.js';

export const PLACE_SCALE = 1.45;          // 地點模型放大倍數
export const PLINTH_R = 1.42 * PLACE_SCALE; // 六角台座半徑（世界座標）
export const NO_PLINTH = new Set(['ropeway', 'airport']);

// 經緯度 → 世界座標（為了畫面好看，部分地點略微挪動；金澤往內陸移，台座才不會懸在海上）
const NUDGE = { ghibli: [3.4, 2.4], shinhotaka: [0.6, -1.2], furukawa: [-0.2, -3.2], kanazawa: [1.9, 1.3] };
export function proj(key) {
  const p = PLACES[key];
  const [nx, nz] = NUDGE[key] || [0, 0];
  return new THREE.Vector3((p.lon - 137.05) * 24 + nx, 0, -(p.lat - 35.72) * 19 + nz);
}

export function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < 4; i++) { s += amp * vnoise(x * f, z * f); amp *= 0.5; f *= 2.03; }
  return s;
}
export const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const gauss = (x, z, cx, cz, rx, rz) => Math.exp(-(((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2));
export function seeded(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export const PLACE_POS = Object.keys(PLACES).map((k) => [k, proj(k)]);
const AIRPORT = proj('airport');
const AIRPORT_R = 1.7;

// 本州（不含機場人工島）的距離場：負值＝陸地
export function mainlandSdf(x, z) {
  const dx = Math.abs(x - 1.5) / 15.5, dz = Math.abs(z) / 21;
  let d = (Math.pow(dx ** 4 + dz ** 4, 0.25) - 1) * 15 + (fbm(x * 0.25, z * 0.25) - 0.5) * 3;
  d = Math.max(d, 15 - Math.hypot(x + 22, z + 26)); // 日本海
  d = Math.max(d, 6.5 - Math.hypot(x + 6, z - 19.5)); // 伊勢灣（南側，機場人工島在灣內）
  return d;
}
export function landSdf(x, z) {
  return Math.min(mainlandSdf(x, z), Math.hypot(x - AIRPORT.x, z - AIRPORT.z) - AIRPORT_R); // 中部機場人工島
}

export function heightAt(x, z) {
  const land = smooth(0.25, -0.35, landSdf(x, z)); // 海岸陡一點，像模型台座的斷面
  let m = 0;
  m += 5.2 * gauss(x, z, 12.5, -7, 3.6, 9);    // 北阿爾卑斯
  m += 3.0 * gauss(x, z, -6, -6.5, 3.2, 3.5);  // 白山
  m += 1.6 * gauss(x, z, 2.5, -3, 6, 5);       // 飛驒高地
  m += 1.0 * gauss(x, z, -1, 4, 6, 4);         // 美濃丘陵
  let h = 0.45 + (fbm(x * 0.6, z * 0.6) - 0.4) * 0.35 + m * (0.55 + fbm(x * 0.45 + 9, z * 0.45) * 0.9);
  // 城鎮台座底下整平，往外慢慢接回原地形
  for (const [k, p] of PLACE_POS) {
    const r = PLACES[k].kind === 'ropeway' ? 0.9 : PLINTH_R; // 纜車只整平山腳站
    const f = 1 - smooth(r + 0.3, r + 2.2, Math.hypot(x - p.x, z - p.z));
    h = h * (1 - f) + 0.45 * f;
  }
  return -0.9 + (h + 0.9) * land;
}

// 把點推回陸地（離海岸至少 margin）
function toLand(v, margin, sdf = mainlandSdf) {
  const e = 0.05;
  for (let i = 0; i < 60; i++) {
    const d = sdf(v.x, v.z);
    if (d <= -margin) break;
    const gx = (sdf(v.x + e, v.z) - sdf(v.x - e, v.z)) / (2 * e), gz = (sdf(v.x, v.z + e) - sdf(v.x, v.z - e)) / (2 * e);
    const g = Math.hypot(gx, gz) || 1;
    const step = Math.min(0.5, d + margin + 0.02);
    v.x -= (gx / g) * step; v.z -= (gz / g) * step;
  }
  return v;
}
function relax(pts, keepEnds, closed, iters = 4) {
  for (let it = 0; it < iters; it++) {
    const src = pts.map((p) => p.clone());
    for (let i = 0; i < pts.length; i++) {
      if (!closed && keepEnds && (i === 0 || i === pts.length - 1)) continue;
      const a = src[(i - 1 + pts.length) % pts.length], b = src[(i + 1) % pts.length];
      if (!closed && (i === 0 || i === pts.length - 1)) continue;
      pts[i].x = (a.x + b.x + 2 * src[i].x) / 4; pts[i].z = (a.z + b.z + 2 * src[i].z) / 4;
    }
  }
  return pts;
}
const MARGIN = 0.9;
const ROAD_LIFT = 0.07;
export const BRIDGE_Y = 0.45 + ROAD_LIFT + 0.08;
const lift = (v) => v.setY(Math.max(heightAt(v.x, v.z), 0.05) + ROAD_LIFT);

// 機場聯絡橋：從人工島往東接到常滑一帶的海岸
function bridgeEnds() {
  const a = AIRPORT.clone().add(new THREE.Vector3(AIRPORT_R * 0.75, 0, -0.2));
  const b = a.clone();
  while (mainlandSdf(b.x, b.z) > -0.35 && b.x < AIRPORT.x + 12) b.x += 0.05; // 橋墩只落在水裡，橋尾剛好接到岸邊
  return [a, b];
}
export const BRIDGE = bridgeEnds();

// 一段路：回傳 { points: Vector3[], bridge: [i0, i1] | null }
function inlandCurve(A, B, n = 60) {
  const mid = A.clone().add(B).multiplyScalar(0.5);
  const perp = new THREE.Vector3(-(B.z - A.z), 0, B.x - A.x).normalize().multiplyScalar(A.distanceTo(B) * 0.08);
  const pts = new THREE.CatmullRomCurve3([A.clone(), mid.add(perp), B.clone()]).getPoints(n);
  pts.forEach((p) => toLand(p, MARGIN));
  relax(pts, true, false); pts.forEach((p) => toLand(p, MARGIN));
  return pts;
}
function leg(a, b) {
  if (a !== 'airport' && b !== 'airport') return { points: inlandCurve(proj(a), proj(b)).map(lift), bridge: null };
  const other = a === 'airport' ? b : a;
  const [bA, bM] = BRIDGE;
  const onIsland = [AIRPORT.clone(), bA.clone()].map(lift);
  const span = []; for (let i = 0; i <= 12; i++) span.push(bA.clone().lerp(bM, i / 12).setY(BRIDGE_Y));
  const land = inlandCurve(bM, proj(other)).map(lift);
  let points = [...onIsland, ...span, ...land.slice(1)];
  let bridge = [onIsland.length - 1, onIsland.length - 1 + span.length - 1];
  if (a !== 'airport') { points = points.reverse(); bridge = [points.length - 1 - bridge[1], points.length - 1 - bridge[0]]; }
  return { points, bridge };
}

// 每天的路線：[{ points, bridge, closed }]
export function buildRoutes() {
  return DAYS.map((d) => {
    if (d.stops.length === 1) { // 定點日：在城鎮周圍繞一圈（避開海）
      const p = proj(d.stops[0]);
      const loop = [];
      for (let k = 0; k < 48; k++) { const a = (k / 48) * Math.PI * 2; loop.push(new THREE.Vector3(p.x + Math.cos(a) * 2.5, 0, p.z + Math.sin(a) * 2.5)); }
      loop.forEach((v) => toLand(v, MARGIN)); relax(loop, false, true); loop.forEach((v) => toLand(v, MARGIN));
      return [{ points: loop.map(lift), bridge: null, closed: true }];
    }
    const legs = [];
    for (let s = 0; s < d.stops.length - 1; s++) legs.push({ ...leg(d.stops[s], d.stops[s + 1]), closed: false });
    return legs;
  });
}

// 船的航線（圓心、半徑）：全部在開闊海面上
export const BOAT_SPOTS = [[-15, -21, 2.2], [-19, -13, 2.5], [-9, 24.5, 1.6], [-2.5, 26, 2], [21, 4, 2.5], [-13, -27, 2]];

// 樹的位置：不長在海上、高山、台座或道路上
export function treePositions(routes, nPine, nRound) {
  const rand = seeded(11);
  const road = [];
  routes.flat().forEach((l) => l.points.forEach((p) => road.push(p)));
  const cell = 1, grid = new Map();
  road.forEach((p) => { const k = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); });
  const nearRoad = (x, z, r) => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const p of grid.get(`${cx + i},${cz + j}`) || []) if (Math.hypot(p.x - x, p.z - z) < r) return true;
    return false;
  };
  const pines = [], rounds = [];
  for (let tries = 0; tries < 40000 && (pines.length < nPine || rounds.length < nRound); tries++) {
    const x = -20 + rand() * 44, z = -26 + rand() * 52;
    const h = heightAt(x, z);
    if (h < 0.5 || h > 3.2 || landSdf(x, z) > -0.6) continue;
    if (PLACE_POS.some(([, p]) => Math.hypot(p.x - x, p.z - z) < PLINTH_R + 0.5)) continue;
    if (nearRoad(x, z, 0.5)) continue;
    if (fbm(x * 0.35 + 3, z * 0.35) < 0.5) continue;
    const t = { x, y: h - 0.04, z, s: 0.8 + rand() * 0.8, r: rand() * 6, c: rand() };
    if (h < 1.1 && rand() < 0.45) { if (rounds.length < nRound) rounds.push(t); }
    else if (pines.length < nPine) pines.push(t);
  }
  return { pines, rounds, nearRoad };
}

// 新穗高纜車山頂站：在山腳站周圍找最高的地方
export function ropewayTop(dist = 3.4) {
  const b = proj('shinhotaka');
  let best = null;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2, x = b.x + Math.cos(a) * dist, z = b.z + Math.sin(a) * dist;
    const h = heightAt(x, z);
    if (landSdf(x, z) < -1 && (!best || h > best.y)) best = new THREE.Vector3(x, h, z);
  }
  return best;
}
