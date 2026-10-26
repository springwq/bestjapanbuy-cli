// 多语言覆盖层：data/i18n/{lang}/** 与 data/articles/{lang}/*.md 只包含需要翻译的字段，按 id 对应原数据。
// localize(ds, lang) 把覆盖层合并进数据集，缺失的字段保留中文原文。zh 原样返回。
// 繁体中文（zh-tw）：覆盖层只放 OpenCC 自动转换（网站构建时整页转换）出错、需要人工修正的字段，写繁体；
// 名称类字段直接替换 zh（见 nameKey），其余字段同英文。
//
// 覆盖层（load-fs 读入 raw.i18n[lang]）：
//   products:   { <product id>: { name, summary, goodFor, notFor, attrs: { <key>: 译文 } } }   // attrs 只用于 type: string 的自由文本属性
//   reviews:    { <product id>: { pros: [], cons: [] } }               // 条数与原文一致
//   categories: { <category id>: { name, description, attributes, buyingTips, guide, carryHome } }
//   rules:      { destinations: { <code>: { name, plugNote } }, checks: { <id>: label }, rules: { <id>: { verdict, note } } }
//   stores:     { stores: { <id>: { name, access, hours, note } }, stations: { <id>: name }, chains: { <id>: { name, taxFree, taxFreeInfo: { scope, oldRule: { counter, fee, minPurchase, note }, newRule: { 同 oldRule } } } } }
//   meta:       { dataStatusNote, cnDutyFreeNote, taxFree: { <version id>: { name, summary, steps } } }
//   sources:    { <来源名原文>: 译名 }                                   // 所有 source.name（型号、价格、评分、文章、门店、汇率、免税规则）
//   articles:   [ { slug, question, answer, keywords, body, stepsTitle, steps: [{ name, text }], faq: [{ q, a }] } ]   // steps/faq 条数与原文一致
import { dataStatusNote } from './status.js';
import { checkCompatibility } from './compat.js';
import { LANGS, HANT } from './messages.js';

const str = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null);
/** 译文数组：条数与原文一致才使用，否则保留原文（validate.js 会报错） */
const arr = (ov, orig, map = (x) => x) => (Array.isArray(ov) && Array.isArray(orig) && ov.length === orig.length && ov.every(str) ? ov.map(map) : orig);
const pick = (ov, orig) => str(ov) ?? orig;

/** 连锁店免税政策（#56）：只翻译说明文字，布尔值、枚举、来源保持原样；原文为 null 的字段不使用译文（不凭空出现内容） */
const RULE_TEXT = ['counter', 'fee', 'minPurchase', 'note'];
function localizeTaxFreeInfo(tf, ov) {
  const rule = (r, o) => (r && o ? { ...r, ...Object.fromEntries(RULE_TEXT.filter((k) => r[k] != null).map((k) => [k, pick(o[k], r[k])])) } : r);
  return { ...tf, scope: tf.scope == null ? null : pick(ov.scope, tf.scope), oldRule: rule(tf.oldRule, ov.oldRule), newRule: rule(tf.newRule, ov.newRule) };
}

/** 名称对象里放译名的键：繁体版的人工修正直接替换中文名（繁体版页面的文字整体由简体转换而来，读的是 zh），其他语言用自己的键 */
const nameKey = (lang) => (lang === HANT ? 'zh' : lang);

/** 各语言版本的"主目的地"：页面首屏结论、徽章、统计按它计算（p.compat）。繁体版是中国台湾，其余中国大陆。"值不值"始终按中国大陆 */
export const HOME_DEST = { [HANT]: 'TW' };
export function homeDestOf(lang) {
  return HOME_DEST[lang] ?? 'CN';
}

export function emptyOverlay() {
  return { products: {}, reviews: {}, categories: {}, rules: null, stores: null, meta: null, sources: null, articles: [] };
}

function localizeCategory(c, ov, lang) {
  if (!ov) return c;
  const nk = nameKey(lang);
  const out = { ...c, name: { ...c.name, [nk]: pick(ov.name, c.name?.[nk] ?? null) }, description: pick(ov.description, c.description) };
  out.attributes = (c.attributes ?? []).map((a) => {
    const oa = ov.attributes?.[a.key];
    if (!oa) return a;
    return {
      ...a,
      label: pick(oa.label, a.label),
      ...(a.unit != null || str(oa.unit) ? { unit: pick(oa.unit, a.unit) } : {}),
      ...(a.options ? { options: a.options.map((o) => ({ ...o, label: pick(oa.options?.[String(o.value)], o.label) })) } : {}),
    };
  });
  if (c.buyingTips) {
    const texts = arr(ov.buyingTips, c.buyingTips.map((t) => t.text));
    out.buyingTips = c.buyingTips.map((t, i) => ({ ...t, text: texts[i] }));
  }
  if (c.carryHome) out.carryHome = arr(ov.carryHome, c.carryHome);
  if (c.guide?.questions) {
    out.guide = {
      ...c.guide,
      questions: c.guide.questions.map((q) => {
        const oq = ov.guide?.[q.id];
        if (!oq) return q;
        return {
          ...q,
          title: pick(oq.title, q.title),
          options: q.options.map((o) => {
            const oo = oq.options?.[String(o.value)];
            if (!oo) return o;
            const scores = o.score ?? [];
            const reasons = arr(oo.reasons, scores.map((s) => s.reason ?? ''));
            return { ...o, label: pick(oo.label, o.label), ...(o.score ? { score: scores.map((s, i) => ({ ...s, reason: s.reason == null ? s.reason : reasons[i] })) } : {}) };
          }),
        };
      }),
    };
  }
  return out;
}

function localizeRules(rules, ov) {
  if (!ov) return rules;
  const destinations = Object.fromEntries(
    Object.entries(rules.destinations).map(([code, d]) => {
      const od = ov.destinations?.[code];
      return [code, od ? { ...d, name: pick(od.name, d.name), plugNote: pick(od.plugNote, d.plugNote) } : d];
    }),
  );
  const checks = rules.checks.map((c) => ({ ...c, label: pick(ov.checks?.[c.id], c.label) }));
  const list = rules.rules.map((r) => {
    const or = ov.rules?.[r.id];
    if (!or) return r;
    return { ...r, verdict: pick(or.verdict, r.verdict), ...(r.note != null ? { note: pick(or.note, r.note) } : {}) };
  });
  return { ...rules, destinations, checks, rules: list };
}

/** 来源名映射：{ name, url } → 译名；没有译名时原样返回 */
export function sourceMapper(map) {
  const one = (s) => (s && typeof s === 'object' && str(map?.[s.name]) ? { ...s, name: map[s.name] } : s);
  return { one, list: (xs) => (Array.isArray(xs) ? xs.map(one) : xs) };
}

function localizeMeta(meta, ov, src, ds, lang) {
  // 数据状态说明按语言重新生成（#96），不用覆盖层里手写的译文
  const out = { ...meta, dataStatusNote: dataStatusNote(ds, lang) };
  if (ov) {
    out.cnDutyFreeNote = pick(ov.cnDutyFreeNote, meta.cnDutyFreeNote);
  }
  if (meta.taxFree?.versions) {
    out.taxFree = {
      ...meta.taxFree,
      versions: meta.taxFree.versions.map((v0) => {
        const v = v0.sources ? { ...v0, sources: src.list(v0.sources) } : v0;
        const ovv = ov?.taxFree?.[v.id];
        if (!ovv) return v;
        return { ...v, name: pick(ovv.name, v.name), summary: pick(ovv.summary, v.summary), ...(v.steps ? { steps: arr(ovv.steps, v.steps) } : {}) };
      }),
    };
  }
  if (meta.fx) {
    out.fx = { ...meta.fx, source: src.one(meta.fx.source) };
    if (meta.fx.rateSources) out.fx.rateSources = Object.fromEntries(Object.entries(meta.fx.rateSources).map(([k, s]) => [k, src.one(s)]));
  }
  return out;
}

/** 译文的 steps/faq：条数一致且每条字段都是非空字符串才使用，否则保留原文（validate.js 会报错） */
function sameShape(ov, orig, keys) {
  return Array.isArray(ov) && ov.length === orig.length && ov.every((x) => keys.every((k) => str(x?.[k]))) ? ov.map((x) => Object.fromEntries(keys.map((k) => [k, x[k]]))) : orig;
}

function localizeArticles(articles, list, src) {
  const bySlug = new Map((list ?? []).map((a) => [a.slug, a]));
  return articles.map((a) => {
    const t = bySlug.get(a.slug);
    if (!t) return { ...a, sources: src.list(a.sources), translated: false };
    // 结构字段（品类、型号、日期、来源）以中文原文为准，只取译文的问题、答案、关键词和正文
    return {
      ...a,
      question: pick(t.question, a.question),
      answer: pick(t.answer, a.answer),
      keywords: Array.isArray(t.keywords) && t.keywords.length ? t.keywords.map(String) : a.keywords,
      body: pick(t.body, a.body),
      ...(a.stepsTitle ? { stepsTitle: pick(t.stepsTitle, a.stepsTitle) } : {}),
      ...(a.steps ? { steps: sameShape(t.steps, a.steps, ['name', 'text']) } : {}),
      ...(a.faq ? { faq: sameShape(t.faq, a.faq, ['q', 'a']) } : {}),
      sources: src.list(a.sources),
      translated: true,
    };
  });
}

/**
 * 返回合并好覆盖层的数据集（不修改原数据集）。
 * 兼容性按该语言重新计算，使规则说明、结论文字是该语言的。
 * 没有覆盖层时也能用：所有文字保留中文，只有 core 消息表里的结论文字是该语言。
 */
export function localize(ds, lang) {
  if (!lang || lang === 'zh' || !LANGS.includes(lang)) return ds;
  const ov = { ...emptyOverlay(), ...(ds.i18n?.[lang] ?? {}) };
  const src = sourceMapper(ov.sources);
  const rules = localizeRules(ds.rules, ov.rules);
  const meta = localizeMeta(ds.meta, ov.meta, src, ds, lang);
  const categories = ds.categories.map((c) => localizeCategory(c, ov.categories?.[c.id], lang));
  const stOv = ov.stores ?? {};
  const nk = nameKey(lang);
  const stores = (ds.stores ?? []).map((s) => {
    const o = stOv.stores?.[s.id];
    if (!o) return s.source ? { ...s, source: src.one(s.source) } : s;
    return { ...s, ...(s.source ? { source: src.one(s.source) } : {}), name: { ...s.name, [nk]: pick(o.name, s.name?.[nk] ?? null) }, access: pick(o.access, s.access), hours: pick(o.hours, s.hours), note: pick(o.note, s.note) };
  });
  const stations = (ds.stations ?? []).map((s) => (str(stOv.stations?.[s.id]) ? { ...s, name: { ...s.name, [nk]: stOv.stations[s.id] } } : s));
  const chains = Object.fromEntries(
    Object.entries(ds.chains ?? {}).map(([id, c]) => {
      const o = stOv.chains?.[id];
      if (!c || typeof c !== 'object') return [id, c];
      // 免税政策的来源名也按 sources.json 映射
      const tf0 = c.taxFreeInfo?.sources ? { ...c.taxFreeInfo, sources: src.list(c.taxFreeInfo.sources) } : c.taxFreeInfo;
      if (!o) return [id, tf0 === c.taxFreeInfo ? c : { ...c, taxFreeInfo: tf0 }];
      const out = { ...c, taxFreeInfo: tf0, [nk]: pick(o.name, c[nk] ?? null), taxFree: pick(o.taxFree, c.taxFree) };
      if (tf0 && o.taxFreeInfo) out.taxFreeInfo = localizeTaxFreeInfo(tf0, o.taxFreeInfo);
      return [id, out];
    }),
  );
  const home = rules.destinations[homeDestOf(lang)] ? homeDestOf(lang) : 'CN';
  const out = { ...ds, lang, homeDest: home, meta, rules, categories, stores, stations, chains, articles: localizeArticles(ds.articles ?? [], ov.articles, src) };
  if (ds.taxFreeGuide?.sources) out.taxFreeGuide = { ...ds.taxFreeGuide, sources: src.list(ds.taxFreeGuide.sources) };
  // 自由文本属性（type: string）的译文按品类定义判断，枚举、数字、布尔属性不受影响
  const strAttrs = new Map(ds.categories.map((c) => [c.id, new Set((c.attributes ?? []).filter((a) => a.type === 'string').map((a) => a.key))]));
  out.products = ds.products.map((p) => {
    const op = ov.products?.[p.id];
    const orv = ov.reviews?.[p.id];
    const q = { ...p };
    if (op) {
      q.name = { ...(p.name ?? {}), [nk]: pick(op.name, p.name?.[nk] ?? null) };
      for (const k of ['summary', 'goodFor', 'notFor']) if (p[k] != null) q[k] = pick(op[k], p[k]);
      const keys = strAttrs.get(p.category);
      if (op.attrs && p.attrs && keys) {
        q.attrs = { ...p.attrs };
        for (const [k, v] of Object.entries(op.attrs)) if (keys.has(k) && p.attrs[k] != null && str(v)) q.attrs[k] = v;
      }
    }
    if (p.sources) q.sources = src.list(p.sources);
    if (p.price) q.price = { ...p.price, ...(p.price.jp ? { jp: { ...p.price.jp, source: src.one(p.price.jp.source) } } : {}) };
    if (p.review?.source) q.review = { ...p.review, source: src.one(p.review.source) };
    if (orv && p.review) q.review = { ...q.review, pros: arr(orv.pros, p.review.pros ?? []), cons: arr(orv.cons, p.review.cons ?? []) };
    return q;
  });
  for (const p of out.products) p.compat = checkCompatibility(p, rules, home, lang);
  return out;
}

/** 某语言实际有译文的条目数（构建日志、数据说明页用） */
export function overlayCoverage(ds, lang) {
  const ov = ds.i18n?.[lang];
  if (!ov) return { products: 0, reviews: 0, categories: 0, articles: 0, rules: false, stores: false, meta: false };
  return {
    products: Object.keys(ov.products ?? {}).length,
    reviews: Object.keys(ov.reviews ?? {}).length,
    categories: Object.keys(ov.categories ?? {}).length,
    articles: (ov.articles ?? []).length,
    rules: !!ov.rules,
    stores: !!ov.stores,
    meta: !!ov.meta,
  };
}
