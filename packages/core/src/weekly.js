// 本周推荐（#84）：每周快照（data/history/{yyyy}-W{ww}.json）的生成与比较。
// 快照只存需要和上周比较的字段：日本最低价、评分和评价数、价格.com 排名、免税政策的核对日期和摘要哈希。
// 纯函数，不读写文件：scripts/snapshot.js 生成快照，网站 /weekly/ 页面比较快照。

const DAY = 86400000;
/** 保留最近几周的快照 */
export const SNAPSHOT_KEEP = 26;

/** ISO 周：'2026-10-24' → { year: 2026, week: 43, key: '2026-W43', slug: '2026-w43', start: '2026-10-19', end: '2026-10-25' } */
export function isoWeek(date) {
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`日期格式不对：${date}`);
  const dow = d.getUTCDay() || 7; // 周一 = 1 … 周日 = 7
  const thu = new Date(d.getTime() + (4 - dow) * DAY); // 本周的周四决定所属年份
  const year = thu.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thu.getTime() - jan1) / DAY / 7) + 1;
  const start = new Date(d.getTime() - (dow - 1) * DAY).toISOString().slice(0, 10);
  const end = new Date(d.getTime() + (7 - dow) * DAY).toISOString().slice(0, 10);
  const ww = String(week).padStart(2, '0');
  return { year, week, key: `${year}-W${ww}`, slug: `${year}-w${ww}`, start, end };
}

/** '2026-W43' / '2026-w43' → { year, week }；格式不对返回 null */
export function parseWeekKey(s) {
  const m = String(s ?? '').match(/^(\d{4})-[Ww](\d{2})$/);
  return m ? { year: Number(m[1]), week: Number(m[2]) } : null;
}

/** 稳定的 JSON（对象键排序），用于计算摘要哈希 */
function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
/** FNV-1a 32 位摘要（8 位十六进制）：只用来判断内容是否变化，不用于安全用途 */
export function digest(v) {
  const s = stableJson(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** 排名页的标识：品类 id，子分类排名页是 "品类/子分类名"（如 outdoor/バーナー・ツーバーナー） */
export const rankingKey = (category, label) => (label ? `${category}/${label}` : category);

/**
 * 生成一份快照。
 *   raw：loadRaw(data) 的结果（products、prices、reviews、chains、taxFreeGuide）
 *   ranks：data/sources/ranks.json（scripts/discover.js 写出的已收录型号名次），可以为 null
 *   date：快照日期（东京日期 YYYY-MM-DD）
 *   maxRankAgeDays：名次数据最多早于快照几天（默认 7 天；更早的视为本周没有读到排名，不写进快照）
 */
export function buildSnapshot({ raw, ranks = null, date, maxRankAgeDays = 7 }) {
  const w = isoWeek(date);
  const fresh = (d) => d && d <= date && (Date.parse(date) - Date.parse(d)) / DAY <= maxRankAgeDays;
  const rankings = {};
  for (const s of ranks?.sources ?? []) {
    if (s.status !== 'ok' || !fresh(s.checkedAt)) continue;
    rankings[s.key] = { url: s.url, checkedAt: s.checkedAt, ...(s.period ? { period: s.period } : {}) };
  }
  const ids = new Set(raw.products.map((p) => p.id));
  const products = {};
  for (const p of [...raw.products].sort((a, b) => a.id.localeCompare(b.id))) {
    const jp = raw.prices?.[p.id]?.jp;
    const rv = raw.reviews?.[p.id];
    const rk = ranks?.ranks?.[p.id];
    const o = {};
    if (jp?.min != null) o.p = jp.min;
    if (jp?.min != null && jp.kind && jp.kind !== 'market-min') o.pk = jp.kind;
    if (raw.prices?.[p.id]?.needsReview) o.x = 1;
    if (rv?.rating != null) {
      o.r = rv.rating;
      if ((rv.scale ?? 5) !== 5) o.s = rv.scale;
      if (rv.count != null) o.n = rv.count;
    }
    if (rk && rankings[rk.source] && ids.has(p.id)) {
      o.k = rk.rank;
      o.ks = rk.source;
    }
    if (p.status === 'discontinued') o.d = 1;
    products[p.id] = o;
  }
  const chains = {};
  for (const [id, c] of Object.entries(raw.chains ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (!c?.taxFreeInfo) continue;
    // 摘要只算政策内容（不含 checkedAt，核对日期单独比较：只是重新核对、内容没变时不算"政策变化"）
    const { checkedAt, sources, ...info } = c.taxFreeInfo;
    chains[id] = { c: checkedAt ?? null, h: digest({ info, taxFree: c.taxFree ?? null, sources: (sources ?? []).map(({ checkedAt: _, ...s }) => s) }) };
  }
  let taxFree = null;
  if (raw.taxFreeGuide) {
    const { checkedAt, sources, ...g } = raw.taxFreeGuide;
    taxFree = { c: checkedAt ?? null, h: digest({ g, sources: (sources ?? []).map(({ checkedAt: _, ...s }) => s) }) };
  }
  return { week: w.key, date, rankings, products, chains, taxFree };
}

/** 快照 → 文本：一个型号一行，git 差异清楚、体积小 */
export function formatSnapshot(snap) {
  const lines = ['{', `  "week": ${JSON.stringify(snap.week)},`, `  "date": ${JSON.stringify(snap.date)},`];
  const block = (name, obj, last) => {
    const ents = Object.entries(obj ?? {});
    if (!ents.length) return lines.push(`  ${JSON.stringify(name)}: {}${last ? '' : ','}`);
    lines.push(`  ${JSON.stringify(name)}: {`);
    ents.forEach(([id, o], i) => lines.push(`    ${JSON.stringify(id)}: ${JSON.stringify(o)}${i < ents.length - 1 ? ',' : ''}`));
    lines.push(`  }${last ? '' : ','}`);
  };
  block('rankings', snap.rankings, false);
  block('products', snap.products, false);
  block('chains', snap.chains, false);
  lines.push(`  "taxFree": ${JSON.stringify(snap.taxFree ?? null)}`);
  lines.push('}');
  return lines.join('\n') + '\n';
}

/** 比较价格时的阈值：降幅 ≥ 5% 才列出；降幅超过 50% 视为可能是异常值（缺货店铺、错标），不列出 */
export const PRICE_DROP_MIN = 0.05;
export const PRICE_DROP_MAX = 0.5;

/**
 * 当周快照和上一份快照比较。
 *   cur、prev：快照（prev 为 null 表示没有上一份，排名和价格不比较）
 *   products：当前型号库（取 addedAt、status）
 * 返回 {
 *   hasPrev, added: [id]（本周新收录：addedAt 在上一份快照之后、当周快照当天及以前；第一份快照时为当周 ISO 周内）,
 *   rankUp: [{ id, from, to, delta, source }]（同一个排名页里名次上升，按上升名次排序）,
 *   rankNew: [{ id, to, source }]（上一份快照里这个排名页读到了、但该型号不在榜上，本周进榜）,
 *   priceDown: [{ id, from, to, pct }]（降幅 ≥ 5%，按降幅排序；需复核的价格、非同一类价格不比较）,
 *   priceSkipped: [{ id, from, to, pct }]（降幅超过 50%，可能是异常值，不列出，只计数）,
 *   chains: [{ id, kind: 'new' | 'changed' | 'rechecked', from, to }], taxFree: null | { kind, from, to }
 * }
 */
export function compareSnapshots(cur, prev, { products = [] } = {}) {
  const w = isoWeek(cur.date);
  const since = prev ? prev.date : null;
  const inSnap = (id) => id in (cur.products ?? {});
  const added = products
    .filter((p) => inSnap(p.id) && p.addedAt && p.addedAt <= cur.date && (since ? p.addedAt > since : p.addedAt >= w.start))
    .map((p) => p.id);
  const out = { hasPrev: !!prev, since, added, rankUp: [], rankNew: [], priceDown: [], priceSkipped: [], chains: [], taxFree: null };
  if (!prev) return out;
  const status = new Map(products.map((p) => [p.id, p.status]));
  const active = (id) => status.get(id) !== 'discontinued' && !cur.products[id]?.d;
  for (const [id, c] of Object.entries(cur.products ?? {})) {
    const o = prev.products?.[id];
    if (!active(id)) continue;
    // 排名：同一个排名页才比较
    if (c.k != null && c.ks) {
      if (o?.k != null && o.ks === c.ks) {
        if (o.k > c.k) out.rankUp.push({ id, from: o.k, to: c.k, delta: o.k - c.k, source: c.ks });
      } else if (o && o.k == null && prev.rankings?.[c.ks]) out.rankNew.push({ id, to: c.k, source: c.ks });
    }
    // 价格：两次都有价格、同一类价格、两次都不是需复核的价格
    if (o?.p != null && c.p != null && (o.pk ?? null) === (c.pk ?? null) && !o.x && !c.x && c.p < o.p) {
      const pct = (o.p - c.p) / o.p;
      const row = { id, from: o.p, to: c.p, pct };
      if (pct > PRICE_DROP_MAX) out.priceSkipped.push(row);
      else if (pct >= PRICE_DROP_MIN) out.priceDown.push(row);
    }
  }
  out.rankUp.sort((a, b) => b.delta - a.delta || a.to - b.to || a.id.localeCompare(b.id));
  out.rankNew.sort((a, b) => a.to - b.to || a.id.localeCompare(b.id));
  out.priceDown.sort((a, b) => b.pct - a.pct || a.id.localeCompare(b.id));
  for (const [id, c] of Object.entries(cur.chains ?? {})) {
    const o = prev.chains?.[id];
    if (!o) out.chains.push({ id, kind: 'new', from: null, to: c.c });
    else if (o.h !== c.h) out.chains.push({ id, kind: 'changed', from: o.c, to: c.c });
    else if (o.c !== c.c) out.chains.push({ id, kind: 'rechecked', from: o.c, to: c.c });
  }
  const order = { changed: 0, new: 1, rechecked: 2 };
  out.chains.sort((a, b) => order[a.kind] - order[b.kind] || a.id.localeCompare(b.id));
  if (cur.taxFree && prev.taxFree) {
    if (cur.taxFree.h !== prev.taxFree.h) out.taxFree = { kind: 'changed', from: prev.taxFree.c, to: cur.taxFree.c };
    else if (cur.taxFree.c !== prev.taxFree.c) out.taxFree = { kind: 'rechecked', from: prev.taxFree.c, to: cur.taxFree.c };
  }
  return out;
}

/** 快照列表（任意顺序）里，某一周之前最近的一份；没有返回 null */
export function previousSnapshot(list, week) {
  return [...list].filter((s) => s.week < week).sort((a, b) => b.week.localeCompare(a.week))[0] ?? null;
}
