import { msg } from './messages.js';

// 数据状态摘要（#96）：首页数据条、数据说明页、llms.txt、/api/v1/meta.json、MCP 共用。
// 全部由数据算出，不手写数字，避免各处数字对不上。

/** 各项数据的条数。status：价格全部确认、门店全部核实时为 verified，否则为 checking */
export function dataSummary(ds) {
  const products = ds.products ?? [];
  const stores = ds.stores ?? [];
  const jp = products.filter((p) => p.price?.jp?.min != null);
  const s = {
    date: ds.meta?.updatedAt ?? null,
    categories: (ds.categories ?? []).length,
    products: products.length,
    jp: jp.length,
    marketMin: jp.filter((p) => p.price.jp.kind === 'market-min').length,
    msrp: products.filter((p) => p.price?.jp?.msrp != null || p.price?.jp?.kind === 'msrp').length,
    reviews: products.filter((p) => p.review?.rating != null).length,
    stores: stores.length,
    storesVerified: stores.filter((x) => x.verifiedAt).length,
    needsReview: products.filter((p) => p.price?.needsReview).length,
  };
  s.status = s.needsReview === 0 && s.storesVerified === s.stores ? 'verified' : 'checking';
  return s;
}

/** 一段话说明数据覆盖情况和更新方式 */
export function dataStatusNote(ds, lang = 'zh') {
  const s = dataSummary(ds);
  return msg(lang, 'status.note', s) + (s.needsReview ? msg(lang, 'status.needsReview', s) : msg(lang, 'status.noReview'));
}
