// 花費記帳／分帳：資料只存在這台裝置（localStorage），可用分享連結傳給同行的人
export const CATS = ['交通', '住宿', '餐飲', '門票', '購物', '其他'];
const DEFAULT_MEMBERS = ['成員 A', '成員 B', '成員 C', '成員 D'];

export function createLedger(tripId, defaultRate) {
  const KEY = `trip-ledger:${tripId}`;
  const blank = () => ({ members: [...DEFAULT_MEMBERS], rate: defaultRate, items: [] });
  const valid = (d) => d && Array.isArray(d.members) && d.members.length >= 2 && Array.isArray(d.items) && d.rate > 0;
  let data;
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch { data = null; }
  if (!valid(data)) data = blank();
  const save = () => localStorage.setItem(KEY, JSON.stringify(data));

  const toTwd = (it) => (it.cur === 'JPY' ? it.amt * data.rate : it.amt);

  // 每人：已付、應付、差額（正數＝別人要給他）
  function summary() {
    const n = data.members.length;
    const paid = Array(n).fill(0), share = Array(n).fill(0), byCat = {};
    let total = 0;
    for (const it of data.items) {
      const v = toTwd(it), split = it.split.filter((i) => i < n);
      if (!split.length || it.payer >= n) continue;
      total += v; paid[it.payer] += v;
      split.forEach((i) => (share[i] += v / split.length));
      byCat[it.cat] = (byCat[it.cat] || 0) + v;
    }
    const balance = paid.map((p, i) => p - share[i]);
    return { total, paid, share, balance, byCat };
  }

  // 最少筆數的轉帳建議：欠最多的人先付給被欠最多的人
  function settle() {
    const bal = summary().balance.map((b, i) => ({ i, b: Math.round(b) }));
    const debt = bal.filter((x) => x.b < 0).sort((a, b) => a.b - b.b);
    const cred = bal.filter((x) => x.b > 0).sort((a, b) => b.b - a.b);
    const out = [];
    let d = 0, c = 0;
    while (d < debt.length && c < cred.length) {
      const amt = Math.min(-debt[d].b, cred[c].b);
      if (amt > 0) out.push({ from: debt[d].i, to: cred[c].i, amt });
      debt[d].b += amt; cred[c].b -= amt;
      if (debt[d].b === 0) d++;
      if (cred[c].b === 0) c++;
    }
    return out;
  }

  const b64 = {
    enc: (s) => btoa(Array.from(new TextEncoder().encode(s), (c) => String.fromCharCode(c)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    dec: (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))),
  };

  return {
    get data() { return data; },
    toTwd, summary, settle,
    add(it) { data.items.push({ ...it, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5) }); save(); },
    remove(id) { data.items = data.items.filter((x) => x.id !== id); save(); },
    setMember(i, name) { data.members[i] = name.trim() || DEFAULT_MEMBERS[i]; save(); },
    setRate(r) { if (r > 0) { data.rate = r; save(); } },
    clear() { data = { ...blank(), members: data.members, rate: data.rate }; save(); },
    shareUrl() { return `${location.origin}${location.pathname}${location.search}#ledger=${b64.enc(JSON.stringify(data))}`; },
    // 從分享連結讀出帳本；格式不對就回傳 null
    parse(hash) {
      const m = /[#&]ledger=([\w-]+)/.exec(hash);
      if (!m) return null;
      try { const d = JSON.parse(b64.dec(m[1])); return valid(d) ? d : null; } catch { return null; }
    },
    replace(d) { data = d; save(); },
    text(fmt) {
      const s = summary(), L = [`【旅費分帳】共 ${fmt(s.total)}（${data.items.length} 筆，匯率 ¥1≈NT$${data.rate}）`];
      data.members.forEach((m, i) => L.push(`${m}：已付 ${fmt(s.paid[i])}／應付 ${fmt(s.share[i])}`));
      const t = settle();
      L.push(t.length ? '— 結算 —' : '已經結清，不用轉帳');
      t.forEach((x) => L.push(`${data.members[x.from]} → ${data.members[x.to]}：${fmt(x.amt)}`));
      return L.join('\n');
    },
  };
}
