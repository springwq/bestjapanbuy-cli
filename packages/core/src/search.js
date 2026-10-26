// 站内搜索与型号容错匹配。前端、MCP、CLI 共用。
import { isZh } from './messages.js';
export function normalizeModel(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * 按型号字符串查找：忽略大小写、连字符、全角；容忍颜色后缀（NW-YQH10-BA → NW-YQH10）。
 * 返回最佳匹配或 null。
 */
export function matchModel(products, query) {
  const q = normalizeModel(query);
  if (!q) return null;
  const byId = products.find((p) => p.id === String(query).trim().toLowerCase());
  if (byId) return byId;
  const exact = products.find((p) => normalizeModel(p.model) === q || (p.aliases ?? []).some((a) => normalizeModel(a) === q));
  if (exact) return exact;
  // 价签型号带颜色后缀：查询以收录型号开头，取最长的那个
  const prefix = products
    .filter((p) => q.startsWith(normalizeModel(p.model)) && q.length - normalizeModel(p.model).length <= 4)
    .sort((a, b) => normalizeModel(b.model).length - normalizeModel(a.model).length);
  return prefix[0] ?? null;
}

function textOf(p, brands, categories) {
  const b = brands[p.brand];
  const c = categories.find((x) => x.id === p.category);
  return [p.model, ...(p.aliases ?? []), p.name?.zh, p.name?.ja, p.name?.en, b?.zh, b?.ja, b?.en, c?.name.zh, c?.name.ja, c?.name.en]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * 构建前端搜索索引（体积小：每条只保留必要字段）。
 * lang（默认 zh）：标题用该语言的名称（缺失时用中文），链接加 /en 前缀；关键词始终包含中日英三种名称。
 */
// 同 specs.js 的 isMakerModel（这里单独写一遍，免得浏览器端的搜索脚本引入 specs.js）
const MAKER_MODEL = /^[A-Za-z0-9][A-Za-z0-9 ./+-]*$/;

export function buildSearchIndex(ds, lang = 'zh') {
  const items = [];
  const own = (p) => (isZh(lang) ? p.name?.zh : p.name?.[lang]) ?? null;
  // 名称里已有品牌（或品牌的一部分，如"なとり"、"大正"）时不再加品牌
  const withBrand = (name, brand) => {
    const n = name.toLowerCase();
    const parts = String(brand ?? '').toLowerCase().split(/[\s()（）/]+/).filter((x) => x.length >= 2);
    const first = n.split(/\s+/)[0];
    const has = parts.some((x) => n.includes(x)) || (first.length >= 2 && String(brand ?? '').toLowerCase().startsWith(first));
    return brand && !has ? `${brand} ${name}` : name;
  };
  const pre = lang === 'zh' ? '' : `/${lang}`;
  const nm = (o) => o?.[lang] ?? o?.zh ?? null;
  // 英文版的副标题不列中文名（中文名仍在关键词 k 里，可以搜到）
  const others = (o) => ['ja', 'en'].filter((k) => k !== lang).map((k) => o?.[k]).filter(Boolean).join(' / ');
  for (const c of ds.categories)
    items.push({ t: 'c', id: c.id, title: nm(c.name), sub: isZh(lang) ? `${c.name.ja} / ${c.name.en}` : others(c.name), url: `${pre}/c/${c.id}/`, k: [c.name.zh, c.name.ja, c.name.en, c.id].join(' ').toLowerCase() });
  for (const p of ds.products) {
    const b = ds.brands[p.brand];
    const k = textOf(p, ds.brands, ds.categories);
    items.push({
      t: 'p',
      id: p.id,
      m: normalizeModel(p.model),
      // 型号是厂家型号时标题写"品牌 + 型号"；是日文商品名（威士忌、药品、零食等）时，
      // 标题用当前语言的名称，副标题写日文名，方便对照店里的标签
      ...(MAKER_MODEL.test(p.model) || !own(p)
        ? { title: `${nm(b) ?? p.brand} ${p.model}`, sub: own(p) ?? '' }
        : { title: withBrand(own(p), nm(b) ?? p.brand), sub: p.name?.ja && p.name.ja !== own(p) ? p.name.ja : '' }),
      url: `${pre}/p/${p.id}/`,
      k,
    });
  }
  for (const a of ds.articles)
    items.push({ t: 'q', id: a.slug, title: a.question, sub: a.answer.slice(0, lang === 'en' ? 90 : 60), url: `${pre}/q/${a.slug}/`, k: [a.question, ...(a.keywords ?? [])].join(' ').toLowerCase() });
  return items;
}

// 中文查询常不带空格（象印电饭煲、便宜的电饭煲）：拆词时可以跳过这些虚词和修饰词，
// 但至少要有一段实词命中
const FILLERS = new Set(['的', '吗', '呢', '吧', '啊', '哪个', '哪款', '哪种', '什么', '怎么', '怎么样', '好', '好用', '便宜', '推荐', '买', '想买', '求', '款', '一个', '一款', '适合', '值得', '日本']);
const CJK = /[぀-ヿ㐀-鿿豈-﫿]/;

/**
 * 不带空格的词能否切成几段、每段都出现在 k 里（或是虚词）。
 * 中日文每段至少 2 字，拉丁字母每段至少 3 字（hairdryer → hair + dryer），避免切得太碎误命中。
 */
function segmentMatch(term, k) {
  const n = term.length;
  if (n < 3 || n > 30) return false;
  // ok[i]：前 i 个字符可切分；hit[i]：其中至少一段是实词命中
  const ok = new Array(n + 1).fill(false);
  const hit = new Array(n + 1).fill(false);
  ok[0] = true;
  for (let i = 1; i <= n; i++)
    for (let j = 0; j < i; j++) {
      if (!ok[j] || (ok[i] && hit[i])) continue;
      const seg = term.slice(j, i);
      if (FILLERS.has(seg)) {
        ok[i] = true;
        hit[i] ||= hit[j];
      } else if (seg.length >= (CJK.test(seg) ? 2 : 3) && k.includes(seg)) {
        ok[i] = true;
        hit[i] = true;
      }
    }
  return ok[n] && hit[n];
}

/** 搜索索引条目（前端与服务端共用的打分逻辑） */
export function searchIndex(index, query, limit = 20) {
  const raw = String(query ?? '').trim().toLowerCase();
  if (!raw) return [];
  const m = normalizeModel(raw);
  const terms = raw.split(/\s+/).filter(Boolean);
  const scored = [];
  for (const it of index) {
    let score = 0;
    if (it.m && m.length >= 3) {
      if (it.m === m) score = 100;
      else if (m.startsWith(it.m) && m.length - it.m.length <= 4) score = 90;
      else if (it.m.startsWith(m)) score = 70;
      else if (it.m.includes(m)) score = 50;
    }
    if (!score && terms.every((t) => it.k.includes(t))) score = it.t === 'c' ? 60 : 40;
    // 整词没命中时再拆词，分数略低于整词命中
    else if (!score && terms.every((t) => it.k.includes(t) || segmentMatch(t, it.k))) score = it.t === 'c' ? 55 : 35;
    if (score) scored.push({ ...it, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---------------------------------------------------------------- 拍价签识别型号

// OCR 常把这些字母和数字认错（O/0、I/L/1、S/5、B/8、Z/2）：两边都折成数字再比较
const CONFUSABLE = { O: '0', D: '0', Q: '0', I: '1', L: '1', S: '5', B: '8', Z: '2', G: '6' };
function ocrKey(s) {
  return normalizeModel(s).replace(/[ODQILSBZG]/g, (c) => CONFUSABLE[c]);
}
const keyCache = new WeakMap();

/**
 * 从价签、包装照片的 OCR 文字里找出已收录（t: 'p'）和候选（t: 'n'）的型号。
 * 容忍 OCR 认错的字母数字、颜色后缀（NW-YQH10-BA）、型号被拆成两行或两段（NW-YQH / 10）。
 * 返回 [{ ...索引条目, score, token }]，按分数排序，已收录的排在候选前面。
 */
export function extractModels(text, index, limit = 5) {
  const words = String(text ?? '')
    .normalize('NFKC')
    .toUpperCase()
    .split(/[^A-Z0-9\-/.]+/)
    .map((w) => w.replace(/^[-/.]+|[-/.]+$/g, ''))
    .filter((w) => /[A-Z0-9]/.test(w));
  const tokens = new Set();
  words.forEach((w, i) => {
    tokens.add(w);
    if (words[i + 1]) tokens.add(w + words[i + 1]);
  });
  let keys = keyCache.get(index);
  if (!keys) {
    keys = index.filter((it) => it.m && (it.t === 'p' || it.t === 'n')).map((it) => ({ it, k: ocrKey(it.m) })).filter((x) => x.k.length >= 4);
    keyCache.set(index, keys);
  }
  const best = new Map();
  for (const tok of tokens) {
    const q = ocrKey(tok);
    // 型号至少要有一个字母（折算前），纯数字的价格、日期不算
    if (q.length < 4 || !/[A-Z]/.test(normalizeModel(tok))) continue;
    for (const { it, k } of keys) {
      let score = 0;
      if (q === k) score = 100;
      else if (q.startsWith(k) && q.length - k.length <= 4) score = 90;
      else if (k.length >= 6 && q.includes(k)) score = 80;
      if (score && score > (best.get(it.id)?.score ?? 0)) best.set(it.id, { ...it, score, token: tok });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score || (a.t === 'n') - (b.t === 'n')).slice(0, limit);
}
