import { exclFromIncl } from './money.js';
import { taxRateOf } from './dataset.js';
import { fxRate, jpyToFx, fmtFx } from './fx.js';
import { msg } from './messages.js';

// 价格：日本含税价 → 免税/退税后价格（不含税价）→ 当地货币参考价（只是按汇率换算，不和任何地方的价格比较）。
// 2026-10-24 起本站不再对比中国国内价格（#83），原来的 worth.js（"值不值"）已删除。

/**
 * 主价格取哪个价（#144）：价格.com 的网店最低价不含运费、网店不一定能免税，游客在实体店通常买不到这个价，
 * 所以有厂家定价或官方商店、零售店价时，主价格和免税/退税后价格都按它算，网店最低价作为第二行。
 * - jp.kind = 'msrp'：厂家定价（basis 'msrp'）
 * - jp.kind = 'store'：官方商店或零售店价（basis 'store'）
 * - jp.kind = 'market-min' 且有 jp.msrp，网店最低价 ≥ 定价 × MSRP_MIN_RATIO：主价格用厂家定价（basis 'msrp'），网店最低价作第二行
 *   （游戏机等基本不打折的品类，定价就是实体店价）
 * - jp.kind = 'market-min' 且有 jp.msrp，网店最低价 < 定价 × MSRP_MIN_RATIO：定价只是名义价格，实体店通常打折，
 *   主价格用网店最低价（basis 'market-min'，estimated），厂家定价作第二行（listPrice），实体店价格通常在两者之间
 * - 只有网店最低价：basis 'market-min'，免税/退税后价格是按网店最低价估算的，实体店通常更高
 * kind 缺失（旧数据）时 basis 为 null，金额照 jp.min。
 * 返回 { basis, jpy, max, marketMin, marketMax, listPrice, estimated }；没有日本价时金额和 basis 都是 null。
 */
/** 网店最低价至少是厂家定价的这个比例时，才把厂家定价当主价格（差距更大时定价只是名义价格） */
export const MSRP_MIN_RATIO = 0.7;

export function priceBasis(product) {
  const jp = product?.price?.jp ?? null;
  const none = { basis: null, jpy: null, max: null, marketMin: null, marketMax: null, listPrice: null, estimated: false };
  if (!jp || jp.min == null) return none;
  const range = (min, max) => (max != null && max !== min ? max : null);
  if (jp.kind === 'msrp') return { ...none, basis: 'msrp', jpy: jp.msrp ?? jp.min, max: null };
  if (jp.kind === 'store') return { ...none, basis: 'store', jpy: jp.min, max: range(jp.min, jp.max) };
  if (jp.kind === 'market-min') {
    if (jp.msrp != null && jp.min >= jp.msrp * MSRP_MIN_RATIO) return { ...none, basis: 'msrp', jpy: jp.msrp, marketMin: jp.min, marketMax: range(jp.min, jp.max) };
    const listPrice = jp.msrp != null ? jp.msrp : null;
    return { ...none, basis: 'market-min', jpy: jp.min, max: range(jp.min, jp.max), marketMin: jp.min, marketMax: range(jp.min, jp.max), listPrice, estimated: true };
  }
  return { ...none, jpy: jp.min, max: range(jp.min, jp.max) };
}

/**
 * 型号的价格说明。opts.currency 指定参考价的货币（ISO 4217，默认 CNY），opts.fx 可覆盖汇率（1 日元 = ? 该货币）。
 * jpTaxIncluded 是主价格（priceBasis：有厂家定价或店价时用它，否则用网店最低价），免税/退税后价格按它算；
 * basis 是主价格的类型（msrp / store / market-min），marketMin 是网店最低价（主价格不是网店最低价时作第二行），
 * estimated 为 true 时免税/退税后价格是按网店最低价估算的；listPrice 是这时作第二行的厂家定价（实体店价格通常在两者之间）。
 * 返回 { productId, taxRate, basis, jpTaxIncluded, jpTaxIncludedMax, jpTaxFree, refund, marketMin, estimated, jpKind, jpMsrp, jpSource, jpDate,
 *        shippingExcluded, currency, fx, fxDate, local, needsReview }；没有日本价时金额为 null，没有该货币汇率时 currency/fx/local 为 null。
 */
export function priceInfo(product, ds, opts = {}) {
  const lang = opts.lang ?? 'zh';
  const currency = String(opts.currency ?? 'CNY').toUpperCase();
  // 人民币和网站一致用 meta.fx.jpyToCny（Frankfurter），其他货币用 meta.fx.rates
  const siteCny = currency === 'CNY' && ds.meta.fx?.jpyToCny > 0;
  const fx = opts.fx ?? (siteCny ? ds.meta.fx.jpyToCny : fxRate(ds.meta.fx, currency));
  const fxDate = opts.fx ? msg(lang, 'fx.user') : siteCny ? (ds.meta.fx.date ?? null) : (ds.meta.fx?.rates?.[currency]?.date ?? null);
  const taxRate = taxRateOf(product, ds);
  const jp = product.price?.jp ?? null;
  const pb = priceBasis(product);
  const incl = pb.jpy;
  const excl = incl == null ? null : exclFromIncl(incl, taxRate);
  return {
    productId: product.id,
    taxRate,
    basis: pb.basis,
    jpTaxIncluded: incl,
    jpTaxIncludedMax: pb.max,
    jpTaxFree: excl,
    refund: incl == null ? null : incl - excl,
    marketMin: pb.basis !== 'market-min' ? pb.marketMin : null,
    estimated: pb.estimated,
    listPrice: pb.listPrice,
    jpKind: jp?.kind ?? null,
    jpMsrp: jp?.msrp ?? null,
    jpSource: jp?.source ?? null,
    jpDate: jp?.date ?? null,
    shippingExcluded: !!jp?.shippingExcluded,
    currency: fx ? currency : null,
    fx: fx ?? null,
    fxDate: fx ? fxDate : null,
    local: fx && excl != null ? jpyToFx(excl, fx) : null,
    needsReview: !!product.price?.needsReview,
  };
}

/** 计算过程（逐行文字）：日本含税价 → 不含税价 → 当地货币参考价 */
export function explainPrice(info, lang = 'zh') {
  const M = (k, v) => msg(lang, k, v);
  const n = (x) => x.toLocaleString('en-US');
  if (info.jpTaxIncluded == null) return [M('price.noJp')];
  const jpArgs = { incl: n(info.jpTaxIncluded), source: info.jpSource?.name ?? M('explain.noSource'), date: info.jpDate ?? M('explain.noDate') };
  const lines = [
    info.basis ? M(`explain.jp.${info.basis}`, jpArgs) : M('explain.jp', jpArgs),
    M('explain.free', { incl: n(info.jpTaxIncluded), rate: 1 + info.taxRate, free: n(info.jpTaxFree) }) + (info.estimated ? (info.listPrice != null ? M('explain.estimatedMsrp', { msrp: n(info.listPrice) }) : M('explain.estimated')) : ''),
  ];
  if (info.marketMin != null) lines.splice(1, 0, M('explain.marketMin', { min: n(info.marketMin) }));
  if (info.local != null)
    lines.push(M('explain.local', { free: n(info.jpTaxFree), fx: info.fx, cur: info.currency, fxDate: info.fxDate ?? M('explain.noDate'), local: fmtFx(info.local, info.currency) }));
  return lines;
}
