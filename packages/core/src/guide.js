import { evaluate } from './condition.js';
import { isGoods } from './dataset.js';
import { msg, isZh } from './messages.js';
import { checkCompatibility } from './compat.js';

// 选购向导：问题、选项、过滤与加分规则全部来自品类定义 category.guide。
// 选项结构：{ value, label, dest?, filter?, relax?, score?: [{ when, points, reason }] }
//   filter：硬条件；relax=true 表示预算类条件，没有结果时会放宽并给出"加多少钱"
//   score：软条件，命中加分，并附"为什么推荐给你"的理由
//   dest=true：带回去用的选项。label 里的 {dest} 换成目的地名称；网站在向导里让用户选目的地。
// 条件按用户的目的地计算（opts.rules + opts.dest，默认中国大陆 CN）：
//   compat.usage 是该目的地的 checkCompatibility 结论，dest.* 是目的地数据（如 { "ref": "dest.voltage" }）

function priceOf(p) {
  return p.price?.jp?.min ?? Infinity;
}

/** 带回去用时需要配降压变压器的型号（规则 transformer: true）：排在不用变压器的型号后面 */
export function needsTransformer(p) {
  return !!p.compat?.items?.some((i) => i.transformer && i.level !== 'ok');
}

function rank(a, b) {
  return (
    (a._transformer ?? 0) - (b._transformer ?? 0) ||
    b._score - a._score ||
    // 选了"带回去用"时：能直接用的排在需配件的前面（原来由"值不值"间接起这个作用，#83 起改为直接比较）
    a._usage - b._usage ||
    (b.review?.rating ?? 0) / (b.review?.scale ?? 5) - (a.review?.rating ?? 0) / (a.review?.scale ?? 5) ||
    priceOf(a) - priceOf(b)
  );
}

function pickOptions(category, answers) {
  const picked = [];
  for (const q of category.guide.questions) {
    const v = answers[q.id];
    if (v == null) continue;
    const opt = q.options.find((o) => String(o.value) === String(v));
    if (opt) picked.push({ question: q, option: opt });
  }
  return picked;
}

/** 选项文字：{dest} 换成目的地名称（没有目的地时用 fallback） */
export function guideLabel(label, destName, fallback = '') {
  return String(label ?? '').replace(/\{dest\}/g, destName ?? fallback);
}

/** 按目的地重算每个型号的 compat，并附上目的地数据 dest（供条件里的 dest.* 使用） */
export function withDestination(products, rules, dest = 'CN', lang = 'zh') {
  const d = rules?.destinations?.[dest];
  if (!d) return products;
  return products.map((p) => ({ ...p, compat: checkCompatibility(p, rules, dest, lang), dest: d }));
}

function scoreProducts(products, picked, { relaxBudget = false, lang = 'zh' } = {}) {
  const out = [];
  const home = picked.some((x) => x.option.dest);
  for (const p of products) {
    if (p.status === 'discontinued') continue;
    let ok = true;
    for (const { option } of picked) {
      if (option.filter && !(relaxBudget && option.relax) && !evaluate(option.filter, p)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    let score = 0;
    const reasons = [];
    for (const { option } of picked)
      for (const s of option.score ?? [])
        if (evaluate(s.when, p)) {
          score += s.points;
          if (s.reason) reasons.push(s.reason);
        }
    // 选了"带回去用"时：按目的地的兼容性结论给理由
    if (home && p.compat?.usage === 'ok' && !isGoods(p) && p.dest?.name) reasons.push(msg(lang, 'guide.reason.usage', { dest: p.dest.name }));
    const { dest, ...rest } = p;
    out.push({ ...rest, _score: score, _usage: home ? ({ ok: 0, accessory: 1 }[p.compat?.usage] ?? 2) : 0, _reasons: reasons, _transformer: home && needsTransformer(p) ? 1 : 0 });
  }
  return out.sort(rank);
}

function strip(p) {
  if (!p) return null;
  const { _score, _usage, _reasons, _transformer, ...rest } = p;
  return { product: rest, score: _score, reasons: [...new Set(_reasons)] };
}

/**
 * opts: { rules, dest }：兼容规则（compat.json，可以是译文版）和目的地代码；给了 rules 时 compat、dest.* 按该目的地计算。
 * 返回的 product.compat 是该目的地的结论。
 * @returns {{ primary, cheaper, better, empty: boolean, message?: string, upsell?: object }}
 */
export function runGuide(category, products0, answers, lang = 'zh', opts = {}) {
  const picked = pickOptions(category, answers);
  const products = opts.rules ? withDestination(products0, opts.rules, opts.dest ?? 'CN', lang) : products0;
  const list = scoreProducts(products, picked, { lang });
  if (!list.length) {
    const relaxed = scoreProducts(products, picked, { relaxBudget: true, lang });
    const budgetOpt = picked.find((x) => x.option.relax);
    if (relaxed.length && budgetOpt) {
      const cheapest = [...relaxed].sort((a, b) => priceOf(a) - priceOf(b))[0];
      const limit = budgetOpt.option.filter?.value;
      const extra = Number.isFinite(priceOf(cheapest)) && limit ? priceOf(cheapest) - limit : null;
      return {
        empty: true,
        message: msg(lang, 'guide.msg.budget'),
        upsell: extra != null ? { extraJpy: extra, ...strip(cheapest) } : null,
        primary: null,
        cheaper: null,
        better: null,
      };
    }
    // 只按"带回去用"筛选就没有型号：说明是目的地的原因
    const destName = opts.rules?.destinations?.[opts.dest ?? 'CN']?.name;
    const destPicked = picked.filter((x) => x.option.dest);
    if (destName && destPicked.length && !scoreProducts(products, destPicked, { lang }).length)
      return { empty: true, message: msg(lang, 'guide.msg.noDest', { dest: destName }), upsell: null, primary: null, cheaper: null, better: null };
    return { empty: true, message: msg(lang, 'guide.msg.none'), upsell: null, primary: null, cheaper: null, better: null };
  }
  const primary = list[0];
  const rest = list.slice(1);
  const cheaper = rest.filter((p) => priceOf(p) < priceOf(primary)).sort(rank)[0] ?? null;
  const better =
    rest
      .filter((p) => p !== cheaper && priceOf(p) > priceOf(primary))
      .sort((a, b) => (b.review?.rating ?? 0) - (a.review?.rating ?? 0) || rank(a, b))[0] ?? null;
  const alternates = [cheaper, better].filter(Boolean);
  // 不足两个备选时用排名后续补齐
  for (const p of rest) {
    if (alternates.length >= 2) break;
    if (!alternates.includes(p)) alternates.push(p);
  }
  return {
    empty: false,
    primary: strip(primary),
    cheaper: cheaper ? strip(cheaper) : null,
    better: better ? strip(better) : null,
    alternates: alternates.map(strip),
  };
}

/** 向导里有"带回去用"（dest: true）的选项 */
export function guideUsesDest(category) {
  return !!category.guide?.questions?.some((q) => q.options.some((o) => o.dest));
}

/** 枚举所有答案组合（用于验收：每种组合都有结果或明确说明） */
export function allAnswerCombos(category) {
  let combos = [{}];
  for (const q of category.guide.questions) {
    const next = [];
    for (const c of combos) for (const o of q.options) next.push({ ...c, [q.id]: o.value });
    combos = next;
  }
  return combos;
}
