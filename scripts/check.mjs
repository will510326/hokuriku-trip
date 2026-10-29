// 場景合理性檢查：node scripts/check.mjs
import { PLACES, DAYS } from '../src/data.js';
import { proj, landSdf, heightAt, buildRoutes, BOAT_SPOTS, treePositions, PLINTH_R, NO_PLINTH, PLACE_SCALE, BRIDGE, ropewayTop } from '../src/terrain.js';

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };
const plinthKeys = Object.keys(PLACES).filter((k) => !NO_PLINTH.has(PLACES[k].kind));

// 1. 道路：除了機場聯絡橋，每個點都在陸地上
const routes = buildRoutes();
let roadPts = 0, bridgeLegs = 0;
routes.forEach((legs, di) => legs.forEach((l, li) => {
  const d = DAYS[di];
  if (l.bridge) {
    bridgeLegs++;
    ok(d.stops.includes('airport'), `D${d.n} 第${li + 1}段有橋但不是機場路線`);
    const [i0, i1] = l.bridge;
    const mid = l.points[Math.round((i0 + i1) / 2)];
    ok(landSdf(mid.x, mid.z) > 0, `D${d.n} 橋中段下方不是海（橋沒意義）`);
  }
  l.points.forEach((p, i) => {
    if (l.bridge && i >= l.bridge[0] && i <= l.bridge[1]) return;
    roadPts++;
    const s = landSdf(p.x, p.z);
    ok(s < -0.3, `D${d.n} 第${li + 1}段第${i}點在海上或海岸邊 (sdf=${s.toFixed(2)})`);
  });
  // 不穿過其他城鎮台座
  const ends = d.stops;
  plinthKeys.filter((k) => !ends.includes(k)).forEach((k) => {
    const c = proj(k);
    const hit = l.points.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < PLINTH_R * 0.9);
    ok(!hit, `D${d.n} 第${li + 1}段穿過 ${PLACES[k].name} 的台座`);
  });
}));
ok(bridgeLegs === 2, `機場聯絡橋應出現在 2 段路（D1、D8），實際 ${bridgeLegs}`);
const bridgeLen = Math.hypot(BRIDGE[1].x - BRIDGE[0].x, BRIDGE[1].z - BRIDGE[0].z);
ok(bridgeLen > 0.5 && bridgeLen < 6, `聯絡橋長度不合理：${bridgeLen.toFixed(2)}`);

// 2. 船：整個航線都在開闊海面
BOAT_SPOTS.forEach(([x, z, r], i) => {
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (landSdf(px, pz) < 1.2) { fails.push(`船 #${i + 1} 航線太靠近陸地 (${px.toFixed(1)}, ${pz.toFixed(1)})`); break; }
  }
});

// 3. 台座：完全在陸地上、地形不會穿出台座或讓台座懸空、彼此不重疊
const top = 0.12 * PLACE_SCALE, bottom = -0.38 * PLACE_SCALE;
plinthKeys.forEach((k) => {
  const c = proj(k), cy = heightAt(c.x, c.z);
  for (let a = 0; a < 12; a++) for (const rr of [0.5, 1]) {
    const x = c.x + Math.cos((a / 12) * Math.PI * 2) * PLINTH_R * rr, z = c.z + Math.sin((a / 12) * Math.PI * 2) * PLINTH_R * rr;
    ok(landSdf(x, z) < -0.2, `${PLACES[k].name} 台座有一角在海上`);
    const dy = heightAt(x, z) - cy;
    ok(dy < top && dy > bottom, `${PLACES[k].name} 台座下地形起伏過大 (Δ=${dy.toFixed(2)})`);
  }
  plinthKeys.filter((o) => o > k).forEach((o) => {
    const d = c.distanceTo(proj(o));
    ok(d > PLINTH_R * 2 + 0.1, `${PLACES[k].name} 與 ${PLACES[o].name} 台座重疊（距離 ${d.toFixed(2)}）`);
  });
});

// 4. 樹：不在海上、道路、台座上
const { pines, rounds, nearRoad } = treePositions(routes, 380, 130);
[...pines, ...rounds].forEach((t) => {
  ok(landSdf(t.x, t.z) < -0.5, `樹長在海邊/海上 (${t.x.toFixed(1)}, ${t.z.toFixed(1)})`);
  ok(!nearRoad(t.x, t.z, 0.45), `樹長在路上 (${t.x.toFixed(1)}, ${t.z.toFixed(1)})`);
  ok(!plinthKeys.some((k) => proj(k).distanceTo({ x: t.x, y: 0, z: t.z }) < PLINTH_R), `樹長在台座上`);
});

// 5. 纜車：山頂站要明顯比山腳高
const rb = proj('shinhotaka'), rt = ropewayTop();
const rise = rt.y - heightAt(rb.x, rb.z);
ok(rise > 1.2, `纜車山頂站只比山腳高 ${rise.toFixed(2)}，不像纜車`);

const uniq = [...new Set(fails)];
console.log(`道路點 ${roadPts}、聯絡橋 ${bridgeLegs} 段（長 ${bridgeLen.toFixed(2)}）、船 ${BOAT_SPOTS.length} 艘、台座 ${plinthKeys.length} 個、纜車高差 ${rise.toFixed(2)}、樹 ${pines.length + rounds.length} 棵`);
if (uniq.length) { console.log(`❌ ${uniq.length} 個問題：`); uniq.slice(0, 60).forEach((f) => console.log('  - ' + f)); process.exit(1); }
console.log('✅ 全部通過');
