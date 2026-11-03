// 旅行時光機：所有行程的清單。新增行程時在這裡加一筆，並提供該行程的資料與地圖。
export const TRIPS = [
  {
    id: 'hokuriku-2027',
    title: '北陸・飛驒 冬季自駕',
    place: '日本・名古屋／高山／金澤',
    country: '日本', // 選單上的國家標籤（Windows 不支援國旗 emoji，所以用文字）
    color: '#bc002d',
    start: '2027-01-13',
    end: '2027-01-20',
    length: '8天7夜',
    people: '四人自駕',
  },
];

const byId = Object.fromEntries(TRIPS.map((t) => [t.id, t]));

// 網址 ?trip=xxx 指定行程；沒指定就用最近一趟（還沒出發的優先）
export function currentTrip() {
  const q = new URLSearchParams(location.search).get('trip');
  if (q && byId[q]) return byId[q];
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = TRIPS.filter((t) => t.end >= today).sort((a, b) => a.start.localeCompare(b.start));
  return upcoming[0] || [...TRIPS].sort((a, b) => b.start.localeCompare(a.start))[0];
}

// 行程狀態：即將出發／旅行中／已完成
export function tripStatus(t, now = new Date()) {
  const day = 86400000;
  const s = new Date(t.start + 'T00:00:00'), e = new Date(t.end + 'T23:59:59');
  if (now < s) return { key: 'upcoming', label: `即將出發・${Math.ceil((s - now) / day)} 天後` };
  if (now <= e) return { key: 'ongoing', label: `旅行中・Day ${Math.floor((now - s) / day) + 1}` };
  return { key: 'done', label: '已完成' };
}

export const fmtRange = (t) => `${t.start.replace(/-/g, '/')}–${t.end.slice(5).replace('-', '/')}`;
