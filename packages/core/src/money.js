import { msg } from './messages.js';

// 日元税额计算。日本店头价一般为含税价（税込）。
// 含税 → 不含税：四舍五入到整数日元；不含税 → 含税：向下取整（日本商家常用做法）。
export function exclFromIncl(incl, rate = 0.1) {
  return Math.round(incl / (1 + rate));
}
export function inclFromExcl(excl, rate = 0.1) {
  return Math.floor(excl * (1 + rate));
}
export function jpyToCny(jpy, fx) {
  return Math.round(jpy * fx * 100) / 100;
}
// 日元写 JP¥、人民币写 CN¥：单独的 ¥ / ￥ 在手机上几乎分不出来（docs/COPY.md）
export function fmtJpy(n, lang = 'zh') {
  return n == null ? msg(lang, 'pending') : `JP¥${Math.round(n).toLocaleString('en-US')}`;
}
export function fmtCny(n, lang = 'zh') {
  return n == null ? msg(lang, 'pending') : `CN¥${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/** 美元参考价（meta.fx.jpyToUsd 由采集脚本写入；没有汇率时返回 null） */
export function jpyToUsd(jpy, rate) {
  if (jpy == null || !(rate > 0)) return null;
  return Math.round(jpy * rate);
}
export function fmtUsd(n) {
  return n == null ? null : `US$${Math.round(n).toLocaleString('en-US')}`;
}
