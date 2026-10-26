// MCP 工具与 CLI 共用的查询层：只做参数解析、结果整形和错误提示，所有计算都调用 @bestjapanbuy/core。
import {
  siteUrl,
  productUrl,
  getCategory,
  productsOf,
  checkCompatibility as coreCheckCompatibility,
  checkCategoryCompatibility,
  plugNoteFor,
  priceInfo,
  explainPrice,
  fxRate,
  calcTaxRefund as coreCalcTaxRefund,
  getTaxFreeRules as coreGetTaxFreeRules,
  nearestStores,
  findStation,
  matchModel,
  buildSearchIndex,
  searchIndex,
  specRows,
  compareProducts as coreCompareProducts,
  VERSION_LABELS,
} from '@bestjapanbuy/core';

// 2026-10-24 起不再对比中国国内价格（#83）：工具输出里没有"值不值"结论（worth）和国内价（cnPriceCny、price.cn）。

/** 面向用户的错误：message 为中英双语，suggestions 为可能想找的条目 */
export class BjbError extends Error {
  constructor(message, { code = 'bad_request', suggestions } = {}) {
    super(message);
    this.name = 'BjbError';
    this.code = code;
    if (suggestions?.length) this.suggestions = suggestions;
  }
}

const indexCache = new WeakMap();
function indexOf(ds) {
  let idx = indexCache.get(ds);
  if (!idx) {
    idx = buildSearchIndex(ds);
    indexCache.set(ds, idx);
  }
  return idx;
}

function meta(ds) {
  return { dataUpdatedAt: ds.meta.updatedAt, source: siteUrl(ds, '/') };
}

function brandName(ds, id) {
  return ds.brands[id]?.zh ?? id;
}

function rating(p) {
  return p.review ? `${p.review.rating}/${p.review.scale ?? 5}` : null;
}

/** 列表用的型号摘要 */
export function productSummary(ds, p) {
  return {
    id: p.id,
    model: p.model,
    brand: brandName(ds, p.brand),
    name: p.name?.zh ?? null,
    category: p.category,
    version: p.version,
    versionLabel: VERSION_LABELS[p.version] ?? null,
    jpPriceJpy: p.price?.jp?.min ?? null,
    usageInCN: p.compat?.usageLabel ?? null,
    rating: rating(p),
    status: p.status,
    url: productUrl(ds, p),
  };
}

function suggestionsFor(ds, query, type = 'p') {
  return searchIndex(indexOf(ds), query, 10)
    .filter((it) => it.t === type)
    .slice(0, 5)
    .map((it) => ({ id: it.id, title: it.title, url: siteUrl(ds, it.url) }));
}

/** 按型号id 或型号字符串（容错）查找，找不到时抛出带建议的错误 */
export function resolveProduct(ds, query) {
  const q = String(query ?? '').trim();
  if (!q) throw new BjbError('请提供型号id或型号 / Please provide a product id or model number');
  const p = matchModel(ds.products, q);
  if (p) return p;
  const suggestions = suggestionsFor(ds, q);
  throw new BjbError(
    `未收录该型号 / model not found: ${q}` + (suggestions.length ? '。可能是 / Did you mean: ' + suggestions.map((s) => s.title).join(', ') : ''),
    { code: 'not_found', suggestions },
  );
}

function resolveCategory(ds, id) {
  const c = getCategory(ds, String(id ?? '').trim().toLowerCase());
  if (c) return c;
  // 允许用中文/日文/英文名称
  const byName = ds.categories.find((x) => [x.name.zh, x.name.ja, x.name.en?.toLowerCase()].includes(String(id).trim().toLowerCase()) || x.name.zh === id);
  if (byName) return byName;
  throw new BjbError(`未收录该品类 / category not found: ${id}。可选 / Available: ${ds.categories.map((x) => `${x.id}（${x.name.zh}）`).join(', ')}`, {
    code: 'not_found',
    suggestions: ds.categories.map((x) => ({ id: x.id, title: x.name.zh, url: siteUrl(ds, `/c/${x.id}/`) })),
  });
}

export function categoryList(ds) {
  return ds.categories.map((c) => ({ id: c.id, name: c.name, url: siteUrl(ds, `/c/${c.id}/`) }));
}

function resolveDestination(ds, code = 'CN') {
  const c = String(code || 'CN').trim().toUpperCase();
  if (ds.rules.destinations[c]) return c;
  throw new BjbError(
    `不支持的目的地 / unsupported destination: ${code}。可选 / Available: ${Object.entries(ds.rules.destinations)
      .map(([k, v]) => `${k}（${v.name}）`)
      .join(', ')}`,
  );
}

function matchBrand(ds, p, q) {
  const s = String(q).trim().toLowerCase();
  if (p.brand === s) return true;
  const b = ds.brands[p.brand];
  return !!b && [b.zh, b.ja, b.en].some((n) => n && n.toLowerCase() === s);
}

function matchAttr(value, want) {
  if (value == null) return false;
  const wants = Array.isArray(want) ? want.map(String) : [String(want)];
  const have = Array.isArray(value) ? value.map(String) : [String(value)];
  return wants.some((w) => have.includes(w));
}

function priceOf(p) {
  return p.price?.jp?.min ?? Infinity;
}

// ---------------------------------------------------------------- 工具实现

export function searchProducts(ds, args = {}) {
  const { category, version, minPrice, maxPrice, brand, attrs, keyword } = args;
  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
  let list = ds.products;
  let cat = null;
  if (category) {
    cat = resolveCategory(ds, category);
    list = productsOf(ds, cat.id);
  }
  if (version) list = list.filter((p) => p.version === version);
  if (brand) list = list.filter((p) => matchBrand(ds, p, brand));
  if (minPrice != null) list = list.filter((p) => p.price?.jp?.min != null && p.price.jp.min >= minPrice);
  if (maxPrice != null) list = list.filter((p) => p.price?.jp?.min != null && p.price.jp.min <= maxPrice);
  if (attrs && Object.keys(attrs).length) {
    if (cat) {
      const known = new Set(cat.attributes.map((a) => a.key));
      const unknown = Object.keys(attrs).filter((k) => !known.has(k));
      if (unknown.length)
        throw new BjbError(`品类 ${cat.id} 没有这些属性 / unknown attributes: ${unknown.join(', ')}。可选 / Available: ${[...known].join(', ')}`);
    }
    list = list.filter((p) => Object.entries(attrs).every(([k, v]) => matchAttr(p.attrs?.[k], v)));
  }
  let scores = null;
  if (keyword && String(keyword).trim()) {
    scores = new Map(searchIndex(indexOf(ds), keyword, Infinity).filter((it) => it.t === 'p').map((it) => [it.id, it.score]));
    list = list.filter((p) => scores.has(p.id));
  }
  const sorted = [...list].sort(
    (a, b) =>
      (scores ? scores.get(b.id) - scores.get(a.id) : 0) ||
      (a.status === 'discontinued') - (b.status === 'discontinued') ||
      priceOf(a) - priceOf(b),
  );
  const out = {
    ...meta(ds),
    query: Object.fromEntries(Object.entries({ category: cat?.id, version, minPrice, maxPrice, brand, attrs, keyword }).filter(([, v]) => v != null && v !== '')),
    total: sorted.length,
    returned: Math.min(sorted.length, limit),
    results: sorted.slice(0, limit).map((p) => productSummary(ds, p)),
  };
  if (cat) out.categoryUrl = siteUrl(ds, `/c/${cat.id}/`);
  if (!sorted.length) {
    out.hint = '没有符合条件的型号，可以放宽条件 / No matching products; try relaxing filters';
    if (!category) out.categories = categoryList(ds);
  }
  return out;
}

export function getProduct(ds, { id, model } = {}) {
  const p = resolveProduct(ds, id ?? model);
  const cat = getCategory(ds, p.category);
  const b = ds.brands[p.brand];
  const articles = (ds.articles ?? [])
    .filter((a) => a.products?.includes(p.id) || (!a.products?.length && a.categories?.includes(p.category)))
    .slice(0, 8)
    .map((a) => ({ slug: a.slug, question: a.question, url: siteUrl(ds, `/q/${a.slug}/`) }));
  return {
    ...meta(ds),
    product: {
      id: p.id,
      url: productUrl(ds, p),
      category: cat ? { id: cat.id, name: cat.name.zh, url: siteUrl(ds, `/c/${cat.id}/`) } : p.category,
      brand: b ? { id: p.brand, zh: b.zh, ja: b.ja, en: b.en } : { id: p.brand },
      model: p.model,
      aliases: p.aliases ?? [],
      name: p.name,
      version: p.version,
      versionLabel: VERSION_LABELS[p.version] ?? null,
      status: p.status,
      summary: p.summary ?? null,
      goodFor: p.goodFor ?? null,
      notFor: p.notFor ?? null,
      flags: p.flags ?? [],
      specs: cat ? specRows(p, cat, ds.brands).map(({ label, value }) => ({ label, value })) : null,
      price: p.price
        ? { jp: p.price.jp ?? null, basis: priceInfo(p, ds).basis, basisJpy: priceInfo(p, ds).jpTaxIncluded, taxFreeJpy: priceInfo(p, ds).jpTaxFree, needsReview: !!p.price.needsReview, note: '价格仅供参考，以店铺为准 / Prices are for reference only' }
        : null,
      review: p.review ?? null,
      compatibilityCN: p.compat ? compactCompat(p.compat) : null,
      counterparts: (p.counterparts ?? [])
        .map((cid) => ds.products.find((x) => x.id === cid))
        .filter(Boolean)
        .map((x) => productSummary(ds, x)),
      articles,
      sources: p.sources ?? [],
      updatedAt: p.updatedAt ?? null,
    },
  };
}

function compactCompat(c) {
  return {
    destination: c.destination,
    destinationName: c.destinationName,
    usage: c.usage,
    usageLabel: c.usageLabel,
    flight: c.flight,
    flightLabel: c.flightLabel,
    items: c.items.map((i) => ({ check: i.check, label: i.label, level: i.level, verdict: i.verdict, note: i.note })),
  };
}

export function compareProducts(ds, { ids } = {}) {
  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 3) throw new BjbError('对比需要 2–3 个型号 / compare needs 2–3 products');
  const products = ids.map((q) => resolveProduct(ds, q));
  if (new Set(products.map((p) => p.id)).size !== products.length) throw new BjbError('不能对比同一个型号 / duplicate products');
  if (new Set(products.map((p) => p.category)).size > 1)
    throw new BjbError(`跨品类的型号不能放在一起对比 / products must be in the same category (${products.map((p) => `${p.model}: ${p.category}`).join(', ')})`);
  const cat = getCategory(ds, products[0].category);
  const cmp = coreCompareProducts(products, cat, ds.brands);
  return {
    ...meta(ds),
    compareUrl: siteUrl(ds, `/compare?ids=${products.map((p) => p.id).join(',')}`),
    products: products.map((p) => productSummary(ds, p)),
    rows: cmp.rows,
    differences: cmp.rows.filter((r) => r.differs).map((r) => r.label),
  };
}

export function checkCompatibility(ds, { product, category, destination = 'CN' } = {}) {
  const dest = resolveDestination(ds, destination);
  const destInfo = ds.rules.destinations[dest];
  if (product) {
    const p = resolveProduct(ds, product);
    const c = coreCheckCompatibility(p, ds.rules, dest);
    return {
      ...meta(ds),
      product: productSummary(ds, p),
      ...compactCompat(c),
      // 插座说明按这个型号的插头取（SE 插头不给"与日本 A 型插头通用"之类的说明）
      destinationInfo: { voltage: destInfo.voltage, frequency: destInfo.frequency, plugs: destInfo.plugs, plugNote: plugNoteFor(destInfo, p) },
      url: productUrl(ds, p),
    };
  }
  if (!category) throw new BjbError('请提供型号或品类 / Please provide a product or a category');
  const cat = resolveCategory(ds, category);
  const list = productsOf(ds, cat.id);
  const summary = checkCategoryCompatibility(list, ds.rules, dest);
  const byId = new Map(list.map((p) => [p.id, p]));
  const group = (ids) => ids.map((id) => byId.get(id)).map((p) => ({ id: p.id, model: p.model, brand: brandName(ds, p.brand), version: p.version, url: productUrl(ds, p) }));
  return {
    ...meta(ds),
    category: { id: cat.id, name: cat.name.zh, url: siteUrl(ds, `/c/${cat.id}/`) },
    destination: dest,
    destinationName: destInfo.name,
    destinationInfo: { voltage: destInfo.voltage, frequency: destInfo.frequency, plugs: destInfo.plugs, plugNote: destInfo.plugNote ?? null },
    counts: { total: list.length, ok: summary.ok.length, accessory: summary.accessory.length, no: summary.no.length },
    ok: group(summary.ok),
    accessory: group(summary.accessory),
    no: group(summary.no),
    carryHome: dest === 'CN' ? cat.carryHome ?? [] : undefined,
    toolUrl: siteUrl(ds, '/tools/compat/'),
  };
}

/**
 * 日本价、免税/退税后价格和当地货币参考价（按汇率换算，不和任何地方的价格比较）。
 * currency：ISO 4217 货币代码，默认 CNY；fx：自定义汇率（1 日元 = ? 该货币）。
 */
export function getPrice(ds, { product, currency, fx } = {}) {
  const p = resolveProduct(ds, product);
  const cur = String(currency || 'CNY').trim().toUpperCase();
  if (!fx && !fxRate(ds.meta.fx, cur))
    throw new BjbError(`没有该货币的汇率 / no exchange rate for currency: ${currency}。可选 / Available: ${Object.keys(ds.meta.fx?.rates ?? {}).join(', ')}`);
  const info = priceInfo(p, ds, { currency: cur, ...(fx ? { fx } : {}) });
  return {
    ...meta(ds),
    product: productSummary(ds, p),
    // 主价格（#144）：basis = msrp（厂家定价）/ store（店铺价）/ market-min（网店最低价）；免税/退税后价格按它算
    basis: info.basis,
    jpTaxIncludedJpy: info.jpTaxIncluded,
    jpTaxIncludedMaxJpy: info.jpTaxIncludedMax,
    marketMinJpy: info.marketMin,
    estimated: info.estimated,
    jpPriceKind: info.jpKind,
    jpMsrpJpy: info.jpMsrp,
    shippingExcluded: info.shippingExcluded,
    taxRate: info.taxRate,
    taxFreeJpy: info.jpTaxFree,
    refundJpy: info.refund,
    localReference: info.local != null ? { currency: info.currency, amount: info.local, fx: info.fx, fxDate: info.fxDate } : null,
    jpSource: info.jpSource,
    jpDate: info.jpDate,
    explanation: explainPrice(info),
    needsReview: info.needsReview,
    note: '价格仅供参考，以店铺为准；当地货币参考价只是按汇率换算 / Prices are for reference only; the local-currency figure is an exchange-rate conversion',
    url: productUrl(ds, p),
  };
}

export function findStores(ds, { lat, lng, station, category, city, chain, limit = 5 } = {}) {
  let origin;
  let st = null;
  if (lat != null && lng != null) origin = { lat, lng };
  else if (station) {
    st = findStation(ds.stations, station);
    if (!st)
      throw new BjbError(`未找到车站 / station not found: ${station}。可选 / Available: ${ds.stations.map((s) => `${s.id}（${s.name.zh}）`).join(', ')}`, {
        code: 'not_found',
      });
    origin = { lat: st.lat, lng: st.lng };
  } else throw new BjbError('请提供经纬度或车站名 / Please provide lat+lng or a station name');
  const cat = category ? resolveCategory(ds, category) : null;
  const n = Math.min(Math.max(Number(limit) || 5, 1), 50);
  const pool = city ? ds.stores.filter((s) => s.city === String(city).trim().toLowerCase()) : ds.stores;
  if (city && !pool.length) {
    const cities = [...new Set(ds.stores.map((s) => s.city))];
    throw new BjbError(`未找到城市 / city not found: ${city}。可选 / Available: ${cities.join(', ')}`, { code: 'not_found' });
  }
  const stores = nearestStores(pool, origin, { limit: n, category: cat?.id, chain: chain || undefined });
  return {
    ...meta(ds),
    origin: st ? { station: st.id, name: st.name.zh, nameEn: st.name.en ?? null, city: st.city ?? null, lat: st.lat, lng: st.lng } : origin,
    stores: stores.map((s) => ({
      id: s.id,
      name: s.name.zh,
      nameJa: s.name.ja ?? null,
      chain: s.chain,
      city: s.city ?? null,
      distanceKm: s.distanceKm,
      address: s.address ?? null,
      access: s.access ?? null,
      hours: s.hours ?? null,
      overseasCorner: s.overseasCorner ?? null,
      taxFree: s.taxFree ?? null,
      categories: s.categories ?? null,
      note: s.note ?? null,
      verifiedAt: s.verifiedAt ?? null,
      source: s.source ?? null,
      mapUrl: s.mapUrl,
      url: siteUrl(ds, `/stores/${s.id}/`),
    })),
    note: '门店信息去前请确认 / Please confirm store details before visiting',
    storesUrl: siteUrl(ds, '/stores/'),
  };
}

export function calcTaxRefund(ds, { price, taxIncluded = true, fx, date, otherCny, taxRate, product } = {}) {
  const p = product ? resolveProduct(ds, product) : null;
  let r;
  try {
    r = coreCalcTaxRefund(ds.meta, { price, taxIncluded, fx, date, otherCny, taxRate, product: p, categories: ds.categories });
  } catch (e) {
    throw new BjbError(`${e.message} / invalid input`);
  }
  return { ...meta(ds), ...r, toolUrl: siteUrl(ds, '/tools/tax-refund/'), guideUrl: siteUrl(ds, '/q/tax-free-2026/') };
}

export function getTaxFreeRules(ds, { date } = {}) {
  let r;
  try {
    r = coreGetTaxFreeRules(ds.meta, date || undefined);
  } catch (e) {
    throw new BjbError(`${e.message} / no tax-free rule for this date`);
  }
  return {
    ...meta(ds),
    ...r,
    newRuleDate: ds.meta.taxFree.newRuleDate,
    rulesVersion: ds.meta.taxFree.rulesVersion,
    cnDutyFreeAllowanceCny: ds.meta.cnDutyFreeAllowance,
    cnDutyFreeNote: ds.meta.cnDutyFreeNote ?? null,
    url: siteUrl(ds, '/q/tax-free-2026/'),
  };
}
