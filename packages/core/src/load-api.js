import { assembleDataset } from './dataset.js';

export const DEFAULT_API = 'https://bestjapanbuy.com/api/v1';

/** 从公开 API 读取数据（CLI、本地 MCP 使用）。只用 fetch，Node 18+ 自带。 */
export async function loadDatasetFromApi(base = process.env.BESTJAPANBUY_API ?? DEFAULT_API) {
  base = base.replace(/\/$/, '');
  const get = async (path) => {
    const res = await fetch(`${base}/${path}`, { headers: { 'user-agent': 'bestjapanbuy-cli' } });
    if (!res.ok) throw new Error(`请求 ${base}/${path} 失败：HTTP ${res.status}`);
    return res.json();
  };
  const [meta, cats, stores, rules] = await Promise.all([get('meta.json'), get('categories.json'), get('stores.json'), get('rules.json')]);
  const lists = await Promise.all(cats.categories.map((c) => get(`products/${c.id}.json`)));
  return assembleDataset({
    meta,
    brands: cats.brands,
    categories: cats.categories,
    products: lists.flatMap((l) => l.products),
    rules: rules.compat,
    stores: stores.stores,
    stations: stores.stations,
    chains: stores.chains ?? {},
    articles: [],
    changelog: [],
  });
}
