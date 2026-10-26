import { msg } from './messages.js';

// 评分展示与排序：第三方评分量表不同（价格.com 5 分、@cosme 7 分），统一在这里处理。

/** 0–1 的归一化评分；没有评分返回 null */
export function ratingNorm(review) {
  if (review?.rating == null) return null;
  return review.rating / (review.scale ?? 5);
}

/** 显示用：5 分制写 "4.6"，其他量表写 "5.9/7" */
export function ratingLabel(review) {
  if (review?.rating == null) return null;
  const scale = review.scale ?? 5;
  return scale === 5 ? String(review.rating) : `${review.rating}/${scale}`;
}

/** 卖家自营网店的评分（如品牌官方网店）不能当作第三方口碑 */
export function isSellerReview(review) {
  return /官方|官网|官網|公式|official/i.test(review?.source?.name ?? '');
}

/** 能否作为"高分/好评"宣传：至少 20 条评价，且不是卖家自营评分 */
export function canPromoteRating(review, minCount = 20) {
  return review?.rating != null && (review.count ?? 0) >= minCount && !isSellerReview(review);
}

/** 排序用的贝叶斯平均：评价数少时向 0.8 收缩，避免 3 条评价的 4.6 分排到最前 */
export function ratingScore(review, prior = 0.8, weight = 10) {
  const norm = ratingNorm(review);
  if (norm == null) return null;
  const n = review.count ?? 0;
  return (norm * n + prior * weight) / (n + weight);
}

/** 评分摘要："4.6/5（价格.com）"，按语言用全角或半角括号 */
export function ratingSummary(review, lang = 'zh') {
  if (review?.rating == null) return null;
  return msg(lang, 'rating.summary', { rating: review.rating, scale: review.scale ?? 5, source: review.source?.name ?? msg(lang, 'rating.third') });
}
