import { checkCompatibility } from './compat.js';
import { dataSummary, dataStatusNote } from './status.js';

/**
 * 把原始数据组装成统一的 dataset：型号合并价格、评价，并计算兼容性（中国大陆）。
 * raw: { meta, brands, categories, products, prices, reviews, rules, stores, stations, articles, changelog }
 */
export function assembleDataset(raw) {
  const prices = raw.prices ?? {};
  const reviews = raw.reviews ?? {};
  const images = raw.images ?? {};
  // discover 是采集脚本的配置（价格.com 排名地址，scripts/discover.js），不进网站和 API 的数据
  const categories = [...raw.categories].map(({ discover, ...c }) => c).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  const products = raw.products.map((p) => ({
    ...p,
    price: p.price ?? prices[p.id] ?? null,
    review: p.review ?? reviews[p.id] ?? null,
    image: p.image ?? images[p.id] ?? null,
  }));
  const ds = { ...raw, categories, products };
  const kindOf = new Map(categories.map((c) => [c.id, c.kind ?? 'appliance']));
  for (const p of products) {
    // 品类类型决定判断方式：非电器品类自动视为 non-electric，不必每个型号手写
    p.kind = kindOf.get(p.category) ?? 'appliance';
    if (p.kind !== 'appliance' && p.voltage == null && !(p.flags ?? []).includes('non-electric')) p.flags = [...(p.flags ?? []), 'non-electric'];
  }
  for (const p of products) p.compat = checkCompatibility(p, ds.rules, 'CN');
  // 数据状态和说明由数据算出（#96），不读 data/meta.json 里手写的数字
  ds.meta = { ...raw.meta, dataStatus: dataSummary(ds).status, dataStatusNote: dataStatusNote(ds, 'zh') };
  return ds;
}

/** 非电器商品（日用品、食品、药品）：判断的是能不能带入境，而不是电压插头 */
export function isGoods(p) {
  return p.kind ? p.kind !== 'appliance' : !!p.flags?.includes('non-electric');
}

/** 消费税率：品类可单独设置（食品适用 8% 轻减税率），否则用 meta.consumptionTaxRate */
export function taxRateOf(p, ds) {
  const cat = ds.categories?.find((c) => c.id === p.category);
  return cat?.taxRate ?? ds.meta.consumptionTaxRate;
}

export function siteUrl(ds, path = '/') {
  return new URL(path, ds.meta.site.url).toString();
}
export function productUrl(ds, p) {
  return siteUrl(ds, `/p/${p.id}/`);
}

export function getCategory(ds, id) {
  return ds.categories.find((c) => c.id === id) ?? null;
}
export function productsOf(ds, categoryId) {
  return ds.products.filter((p) => p.category === categoryId);
}
