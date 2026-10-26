import { evaluate } from './condition.js';
import { msg } from './messages.js';

const isGoods = (p) => (p.kind ? p.kind !== 'appliance' : !!p.flags?.includes('non-electric'));

// 兼容性判断：规则全部来自 data/rules/compat.json。
// 每个检查项（电压/插头/频率/登机/锁区）按顺序匹配，第一条命中的规则即结论。
export const LEVELS = ['ok', 'accessory', 'no'];
// usage：电器能不能用；goods：非电器商品（食品、药品、化妆品等）判断的是能不能带入境；flight：登机
export function levelLabels(lang = 'zh') {
  const m = (g) => Object.fromEntries(LEVELS.map((l) => [l, msg(lang, `compat.${g}.${l}`)]));
  return { usage: m('usage'), goods: m('goods'), flight: m('flight') };
}
export const LEVEL_LABELS = levelLabels('zh');

export function worst(levels) {
  let idx = 0;
  for (const l of levels) idx = Math.max(idx, LEVELS.indexOf(l));
  return LEVELS[idx];
}

// 规则文案模板（verdict / note，含英文等覆盖层）：{name} 换成按型号和目的地算出的值，未知的占位符原样保留。
//   {destVoltage}：目的地电压数字，如 220；不指定目的地时（如方法说明页列规则）写 200–240
//   {recWatt}：降压变压器建议功率 = 型号功率 ÷0.8 向上取整到百位，如 1210W → "1,600W 以上"；功率待补充时写"按电饭煲功率 ÷0.8 计算"
//   {recWattHint}：note 里的计算说明，如 "（这款 1,210W，即 1,600W 以上）"；功率待补充时写"（这款的功率待补充，以铭牌为准）"
// 结论项另带 verdictGeneric / noteGeneric：按"功率待补充"渲染、note 不含 {recWattHint} 的通用文案，用于按结论汇总（/works-in/ 的原因统计），不随型号功率变化。
export function recommendedTransformerWatt(watt) {
  return Number.isFinite(watt) && watt > 0 ? Math.ceil(watt / 0.8 / 100) * 100 : null;
}

const fmtW = (n) => `${n.toLocaleString('en-US')}W`;

export function ruleVars(product, dest, lang = 'zh') {
  const watt = Number.isFinite(product?.watt) && product.watt > 0 ? product.watt : null;
  const rec = recommendedTransformerWatt(watt);
  return {
    destVoltage: dest?.voltage != null ? String(dest.voltage) : msg(lang, 'compat.var.destVoltageAny'),
    recWatt: rec ? msg(lang, 'compat.var.recWatt', { w: fmtW(rec) }) : msg(lang, 'compat.var.recWattUnknown'),
    recWattHint: rec ? msg(lang, 'compat.var.recWattHint', { watt: fmtW(watt), w: fmtW(rec) }) : msg(lang, 'compat.var.recWattHintUnknown'),
  };
}

export function renderRuleText(text, vars) {
  if (typeof text !== 'string' || !text.includes('{')) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
}

export function checkCompatibility(product, rulesData, destCode = 'CN', lang = 'zh') {
  const dest = rulesData.destinations[destCode];
  if (!dest) throw new Error(msg(lang, 'compat.badDest', { code: destCode }));
  const labels = levelLabels(lang);
  // dest.code：规则可按目的地代码判断（如 region-cn-mainland-only：目的地不是 CN 时判不能用）
  const ctx = { ...product, product, dest: { ...dest, code: destCode } };
  const items = [];
  const vars = ruleVars(product, dest, lang);
  // 通用文案：功率按待补充写，note 里不写"这款"的计算说明
  const genericVars = { ...ruleVars({ watt: null }, dest, lang), recWattHint: '' };
  for (const check of rulesData.checks) {
    const rule = rulesData.rules.find(
      (r) => r.check === check.id && (!r.destinations || r.destinations.includes(destCode)) && evaluate(r.when, ctx),
    );
    if (!rule) continue;
    items.push({
      check: check.id,
      label: check.label,
      group: check.group,
      level: rule.level,
      ruleId: rule.id,
      verdict: renderRuleText(rule.verdict, vars),
      note: renderRuleText(rule.note ?? null, vars),
      verdictGeneric: renderRuleText(rule.verdict, genericVars),
      noteGeneric: renderRuleText(rule.note ?? null, genericVars),
      // showNote：页面在结论旁边直接显示 note（判断依据），如 230–240V 地区的 220V 型号
      showNote: !!rule.showNote,
      ref: rule.ref ?? null,
      // transformer：需要配降压变压器（排序时排在只需转换插头的"需配件"之后）
      transformer: !!rule.transformer,
    });
  }
  const usageItems = items.filter((i) => i.group === 'usage');
  const flightItems = items.filter((i) => i.group === 'flight');
  const usage = usageItems.length ? worst(usageItems.map((i) => i.level)) : null;
  const flight = flightItems.length ? worst(flightItems.map((i) => i.level)) : null;
  return {
    destination: destCode,
    destinationName: dest.name,
    usage,
    usageLabel: usage ? (isGoods(product) ? labels.goods : labels.usage)[usage] : msg(lang, 'pending'),
    flight,
    flightLabel: flight ? labels.flight[flight] : msg(lang, 'pending'),
    items,
  };
}

// 品类级兼容性（兼容性检查工具"按品类查询"）：统计该品类各型号结论分布
export function checkCategoryCompatibility(products, rulesData, destCode = 'CN', lang = 'zh') {
  const summary = { ok: [], accessory: [], no: [] };
  for (const p of products) {
    const r = checkCompatibility(p, rulesData, destCode, lang);
    if (r.usage) summary[r.usage].push(p.id);
  }
  return summary;
}

/**
 * 目的地的插座说明（plugNote），放在某个型号旁边显示时用。
 * 说明是针对日本 A 型扁脚插头写的（如"美国插座与日本 A 型插头通用"），型号却是 SE 等其他插头时，
 * 这句话会让人以为能直接插，所以不显示；说明里提到了该型号的插头类型（如中国大陆的说明提到 SE 型）时照常显示。
 */
export function plugNoteFor(destInfo, product) {
  const note = destInfo?.plugNote ?? null;
  const plug = product?.plug;
  if (!note || !plug || plug === 'A') return note;
  const mentions = (t) => new RegExp(`(^|[^A-Za-z])${t}\\s*型|Type ${t}\\b`).test(note);
  if (mentions(plug)) return note;
  return mentions('A') ? null : note;
}
