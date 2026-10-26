import { exclFromIncl, inclFromExcl, jpyToCny } from './money.js';
import { taxRateOf } from './dataset.js';
import { msg } from './messages.js';

// 免税规则按日本时间的日期判断（新规 2026-11-01 从日本时间零点起生效）
function today() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

/** 按购买日期返回适用的免税规则（meta.taxFree.versions）。 */
export function getTaxFreeRules(meta, date = today(), lang = 'zh') {
  const v = meta.taxFree.versions.find(
    (r) => (!r.effectiveFrom || date >= r.effectiveFrom) && (!r.effectiveTo || date <= r.effectiveTo),
  );
  if (!v) throw new Error(msg(lang, 'tax.err.noRule', { date }));
  return { date, ...v };
}

/**
 * 退税计算器。
 * @param {object} input { price, taxIncluded=true, fx, date, otherCny=0, taxRate, product, categories, lang='zh' }
 *   税率优先用 input.taxRate（如食品 0.08）；否则给了 product 时按其品类（taxRateOf，需同时传 categories）；
 *   都没有时用 meta.consumptionTaxRate。
 */
export function calcTaxRefund(meta, input) {
  const lang = input.lang ?? 'zh';
  const taxRate = input.taxRate ?? (input.product ? taxRateOf(input.product, { meta, categories: input.categories }) : meta.consumptionTaxRate);
  if (!(taxRate > 0 && taxRate < 1)) throw new Error(msg(lang, 'tax.err.rate'));
  const fx = input.fx ?? meta.fx.jpyToCny;
  const date = input.date ?? today();
  const price = Number(input.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error(msg(lang, 'tax.err.price'));
  const taxIncluded = input.taxIncluded !== false;
  const incl = taxIncluded ? Math.round(price) : inclFromExcl(price, taxRate);
  const excl = taxIncluded ? exclFromIncl(price, taxRate) : Math.round(price);
  const refund = incl - excl;
  const rules = getTaxFreeRules(meta, date, lang);
  const cny = jpyToCny(excl, fx);
  const otherCny = Number(input.otherCny ?? 0) || 0;
  const totalCny = Math.round((cny + otherCny) * 100) / 100;
  const allowance = meta.cnDutyFreeAllowance;
  return {
    date,
    fx,
    fxDate: input.fx ? msg(lang, 'fx.user') : meta.fx.date,
    taxRate,
    taxIncludedPrice: incl,
    taxFreePrice: excl,
    refund,
    taxFreeCny: cny,
    refundCny: jpyToCny(refund, fx),
    eligible: excl >= rules.minPurchaseExcl,
    minPurchaseExcl: rules.minPurchaseExcl,
    otherCny,
    totalOverseasCny: totalCny,
    cnAllowance: allowance,
    overAllowance: totalCny > allowance,
    rule: { id: rules.id, name: rules.name, summary: rules.summary, payAtStore: rules.payAtStore },
  };
}
