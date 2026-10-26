import { isGoods } from './dataset.js';
import { needsTransformer } from './guide.js';
import { ratingScore, isSellerReview } from './rating.js';
import { fmtJpy } from './money.js';
import { msg, isZh } from './messages.js';

// 站内榜单排序（#145）：品类页、首页榜单、本周推荐、API 的 rank 都用这里的 rankProducts。
// "为什么排在这里"（rankBasis）读的是同一份 rankKey，所以说明和实际排序不会对不上。
//
// 简体/繁体：① 带回主目的地（简体中国大陆、繁体中国台湾）能不能用 → ② 有没有日本价 → ③ 排序评分高的在前 → ④ 日本价低的在前
// 英文：不按单一目的地排（结论只针对中国大陆/中国台湾），只用 ② → ③ → ④
// 排序评分：第三方评分换算到 0–1，按评价数向 0.8 收缩（ratingScore：(分数 × 评价数 + 0.8 × 10) ÷ (评价数 + 10)），评价少的不会因为一两条满分排到前面。

/** 带回主目的地可用程度：能直接用 0，需配件 1（要配降压变压器的 1.25，排在只需转换插头的后面），未知 1.5，不能用 2（非电器没有结论时视为能用） */
export function usageRank(p) {
  if (p.compat?.usage === 'accessory' && needsTransformer(p)) return 1.25;
  return { ok: 0, accessory: 1, no: 2 }[p.compat?.usage] ?? (isGoods(p) ? 0 : 1.5);
}

/** 排序用的日本价：price.jp.min（网店最低价，或店价、厂家定价本身） */
export function rankPrice(p) {
  return p.price?.jp?.min ?? null;
}

/** 一个型号的排序键（按这个顺序比较）：usage（只有中文版）、hasPrice、score（排序评分，没有评分为 null）、price */
export function rankKey(p, lang = 'zh') {
  const price = rankPrice(p);
  const score = ratingScore(p?.review);
  return {
    usage: isZh(lang) ? usageRank(p) : null,
    hasPrice: price != null,
    score,
    price,
  };
}

/** 比较两个排序键：小于 0 表示 a 排在前面 */
export function compareRankKeys(a, b) {
  return (
    (a.usage ?? 0) - (b.usage ?? 0) ||
    // 没有日本价格的型号排在后面（榜单要能直接对照价格）
    !a.hasPrice - !b.hasPrice ||
    (b.score ?? -1) - (a.score ?? -1) ||
    (a.price ?? Infinity) - (b.price ?? Infinity)
  );
}

/** 按站内规则排序（不改原数组；比较结果相同的保持原顺序） */
export function rankProducts(list, lang = 'zh') {
  const keys = new Map(list.map((p) => [p, rankKey(p, lang)]));
  return [...list].sort((a, b) => compareRankKeys(keys.get(a), keys.get(b)));
}

/**
 * "为什么排在这里"：由 rankKey 逐步生成说明。opts.home 主目的地名称，opts.srcName(name) 翻译评分来源名称（可选）。
 * 返回 { key, steps: [{ step, text }], text }；steps 的顺序就是比较顺序。
 */
export function rankBasis(p, lang = 'zh', opts = {}) {
  const M = (k, v) => msg(lang, k, v);
  const key = rankKey(p, lang);
  const steps = [];
  if (key.usage != null) {
    const home = opts.home ?? M('home.cn');
    let text;
    if (key.usage === 1.25) text = M('rank.usage.transformer', { home });
    else if (p.compat?.usage) text = M('rank.usage', { home, label: p.compat.usageLabel ?? p.compat.usage });
    else text = isGoods(p) ? M('rank.usage.goods') : M('rank.usage.unknown', { home });
    steps.push({ step: 'usage', text });
  }
  steps.push({ step: 'hasPrice', text: M(key.hasPrice ? 'rank.price.yes' : 'rank.price.no') });
  const r = p.review;
  if (key.score != null) {
    const source = (opts.srcName ? opts.srcName(r.source?.name) : null) ?? r.source?.name ?? M('rating.third');
    const v = { rating: r.rating, scale: r.scale ?? 5, source, count: r.count };
    steps.push({ step: 'score', text: M(r.count != null ? 'rank.rating' : 'rank.ratingNoCount', v) + (isSellerReview(r) ? M('rank.seller') : '') });
  } else steps.push({ step: 'score', text: M('rank.rating.none') });
  if (key.hasPrice) steps.push({ step: 'price', text: M(['market-min', 'msrp', 'store'].includes(p.price?.jp?.kind) ? `rank.jp.${p.price.jp.kind}` : 'rank.jp', { price: fmtJpy(key.price) }) });
  return { key, steps, text: steps.map((s) => s.text).join(M('rank.sep')) };
}
