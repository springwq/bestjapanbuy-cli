// 外币参考汇率（meta.fx.rates）：1 日元 = 多少外币。由 scripts/collect.js 每周写入，网站英文版按用户所在地显示当地货币参考价。
//   meta.fx.rates:       { "<ISO 4217>": { rate, date, source, needsReview? } }   // source 是 meta.fx.rateSources 的键
//   meta.fx.rateSources: { "<键>": { name, url } }
//   meta.fx.jpyToUsd:    与 rates.USD.rate 相同（旧字段，保留）
// 目的地 → 货币：data/rules/compat.json 的 destinations.<code>.currency。

/** 货币符号（金额写法与 fmtJpy / fmtUsd 一致：符号 + 千位分隔的整数） */
export const CURRENCY_SYMBOLS = {
  USD: 'US$', CNY: 'CN¥', HKD: 'HK$', MOP: 'MOP$', TWD: 'NT$', SGD: 'S$', KRW: '₩', THB: '฿', MYR: 'RM', PHP: '₱', VND: '₫', IDR: 'Rp',
  INR: '₹', AUD: 'A$', NZD: 'NZ$', CAD: 'C$', GBP: '£', EUR: '€',
};

export function currencySymbol(cur) {
  return CURRENCY_SYMBOLS[cur] ?? `${cur} `;
}

/** 日元 → 外币（取整）；没有汇率时返回 null */
export function jpyToFx(jpy, rate) {
  if (jpy == null || !(rate > 0)) return null;
  return Math.round(jpy * rate);
}

/** 外币金额：US$1,234 / €56 / ₩12,345 */
export function fmtFx(n, cur) {
  return n == null ? null : `${currencySymbol(cur)}${Math.round(n).toLocaleString('en-US')}`;
}

/** 汇率本身（1 日元 = ?）：保留 4 位有效数字 */
export function fmtRate(rate) {
  if (!(rate > 0)) return null;
  return String(Number(rate.toPrecision(4)));
}

/** 取某币种汇率：rates 里有就用，USD 退回旧字段 jpyToUsd；没有返回 null */
export function fxRate(fx, cur) {
  const r = fx?.rates?.[cur]?.rate;
  if (r > 0) return r;
  if (cur === 'USD' && fx?.jpyToUsd > 0) return fx.jpyToUsd;
  if (cur === 'CNY' && fx?.jpyToCny > 0) return fx.jpyToCny;
  return null;
}

/** 目的地 → 有汇率的货币（目的地没有货币或没有汇率时返回 null） */
export function destCurrency(rules, fx, code) {
  const cur = rules?.destinations?.[code]?.currency;
  return cur && fxRate(fx, cur) ? cur : null;
}

const sig = (x, n = 6) => Number(x.toPrecision(n));

/**
 * 解析欧洲央行每日参考汇率 XML（https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml）。
 * 返回 { date, perEur: { USD: 1.1193, JPY: 175.51, ... } }（1 欧元 = 多少该币种）。
 */
export function parseEcbXml(xml) {
  const date = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1] ?? null;
  const perEur = { EUR: 1 };
  for (const m of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) perEur[m[1]] = Number(m[2]);
  if (!date || !(perEur.JPY > 0)) throw new Error('欧洲央行 XML 里没有日期或日元汇率');
  return { date, perEur };
}

/** 欧元基准 → 日元基准：1 日元 = perEur[cur] / perEur.JPY */
export function jpyRatesFromEur(perEur, currencies) {
  const out = {};
  for (const cur of currencies) if (perEur[cur] > 0) out[cur] = sig(perEur[cur] / perEur.JPY);
  return out;
}

/**
 * 合并新汇率到 meta.fx（不修改原对象）。单次变动超过 maxJump 的币种保留旧值并标记 needsReview。
 * fresh: { <cur>: { rate, date, source } }
 */
export function mergeFxRates(fx, fresh, { maxJump = 0.1 } = {}) {
  const rates = { ...(fx?.rates ?? {}) };
  const flagged = [];
  for (const [cur, r] of Object.entries(fresh)) {
    const old = rates[cur]?.rate;
    if (old > 0 && Math.abs(r.rate - old) / old > maxJump) {
      rates[cur] = { ...rates[cur], needsReview: true };
      flagged.push(`${cur} ${old} → ${r.rate}`);
      continue;
    }
    rates[cur] = { rate: r.rate, date: r.date, source: r.source };
  }
  const sorted = Object.fromEntries(Object.keys(rates).sort().map((k) => [k, rates[k]]));
  const out = { ...fx, rates: sorted };
  if (sorted.USD?.rate > 0) out.jpyToUsd = sorted.USD.rate;
  return { fx: out, flagged };
}
