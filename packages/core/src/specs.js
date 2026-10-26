import { fmtJpy, exclFromIncl } from './money.js';
import { isGoods } from './dataset.js';
import { msg, isZh } from './messages.js';
import { ratingSummary } from './rating.js';
import { priceBasis } from './price.js';

// 电器专属规格：非电器商品（日用品、食品、药品）不输出这些行
export const APPLIANCE_SPEC_KEYS = ['version', 'voltage', 'frequency', 'plug', 'watt', 'battery'];

export function versionLabels(lang = 'zh') {
  return { overseas: msg(lang, 'version.overseas'), domestic: msg(lang, 'version.domestic'), global: msg(lang, 'version.global') };
}
export const VERSION_LABELS = versionLabels('zh');
export const PENDING = msg('zh', 'pending');

export function voltageText(v, lang = 'zh') {
  if (!v) return msg(lang, 'pending');
  return v.min === v.max ? `${v.min}V` : `${v.min}–${v.max}V`;
}

export function attrText(def, value, lang = 'zh') {
  if (value == null || value === '') return msg(lang, 'pending');
  if (def.type === 'boolean') return msg(lang, value ? 'spec.yes' : 'spec.no');
  if (def.type === 'enum') {
    const vals = Array.isArray(value) ? value : [value];
    return vals.map((v) => def.options?.find((o) => o.value === v)?.label ?? v).join(msg(lang, 'listSep'));
  }
  if (def.type === 'number') return `${value}${def.unit ?? ''}`;
  return String(value);
}

/** 品牌显示：当前语言的名称在前，其余语言跟在后面 */
function brandText(b, lang) {
  const order = lang === 'en' ? ['en', 'ja', 'zh'] : ['zh', 'ja', 'en'];
  // 中文版保持原来的"中 / 日 / 英"三段；英文版不重复中文名
  const keys = isZh(lang) ? order : order.slice(0, 2);
  return [...new Set(keys.map((k) => b[k]).filter(Boolean))].join(' / ');
}

/** 规格表：通用规格 + 品类专属规格。返回 [{ key, label, value }]
 *  非电器商品不输出电器规格（版本、电压、频率、插头、功率、电池），也不输出待补充的发售年份 */
export function specRows(product, category, brands, lang = 'zh') {
  const M = (k, v) => msg(lang, k, v);
  const pending = M('pending');
  const b = brands[product.brand];
  const goods = isGoods(product);
  const battery = product.battery
    ? `${product.battery.type === 'li-ion' ? M('spec.battery.li-ion') : product.battery.type}${product.battery.wh ? M('spec.battery.wh', { wh: product.battery.wh }) : ''}`
    : M('spec.battery.none');
  const rows = [
    { key: 'brand', label: M('spec.brand'), value: b ? (isZh(lang) ? `${b.zh} / ${b.ja} / ${b.en}` : brandText(b, lang)) : product.brand },
    { key: 'model', label: M('spec.model'), value: product.model },
    { key: 'version', label: M('spec.version'), value: versionLabels(lang)[product.version] ?? pending },
    { key: 'voltage', label: M('spec.voltage'), value: voltageText(product.voltage, lang) },
    { key: 'frequency', label: M('spec.frequency'), value: product.frequency ? `${product.frequency}Hz` : pending },
    { key: 'plug', label: M('spec.plug'), value: product.plug ? M('spec.plugType', { plug: product.plug }) : pending },
    { key: 'watt', label: M('spec.watt'), value: product.watt ? `${product.watt}W` : pending },
    { key: 'battery', label: M('spec.battery'), value: battery },
    { key: 'releaseYear', label: M('spec.releaseYear'), value: product.releaseYear ? M('spec.year', { year: product.releaseYear }) : pending },
  ].filter((r) => !goods || !(APPLIANCE_SPEC_KEYS.includes(r.key) || (r.key === 'releaseYear' && !product.releaseYear)));
  for (const def of category.attributes)
    rows.push({ key: `attrs.${def.key}`, label: def.label, value: attrText(def, product.attrs?.[def.key], lang) });
  return rows;
}

/** 对比表：2–3 个同品类型号，按行列出所有规格，并标记不同的值。
 *  英文版不比较"带回中国大陆使用"（针对中国大陆的结论），改为显示免税价/退税后价格。 */
export function compareProducts(products, category, brands, lang = 'zh', opts = {}) {
  const M = (k, v) => msg(lang, k, v);
  const pending = M('pending');
  if (products.length < 2 || products.length > 3) throw new Error(M('compare.err.count'));
  if (new Set(products.map((p) => p.category)).size > 1) throw new Error(M('compare.err.category'));
  const price = { key: 'price', label: M('compare.price'), get: (p) => (priceBasis(p).jpy != null ? fmtJpy(priceBasis(p).jpy, lang) : pending) };
  const rating = { key: 'rating', label: M('compare.rating'), get: (p) => (p.review?.rating != null ? ratingSummary(p.review, lang) : pending) };
  const extra =
    isZh(lang)
      ? [
          price,
          { key: 'usage', label: M('compare.usage', { d: opts.homeName ?? M('home.cn') }), get: (p) => p.compat?.usageLabel ?? pending },
          // 中文版沿用原来的写法
          { key: 'rating', label: M('compare.rating'), get: (p) => (p.review ? `${p.review.rating}/${p.review.scale}（${p.review.source.name}）` : pending) },
        ]
      : [
          price,
          {
            key: 'taxFree',
            label: M('compare.taxFree'),
            get: (p) => {
              // 主价格（#144）：有厂家定价或店价时按它算
              const incl = priceBasis(p).jpy;
              if (incl == null) return pending;
              // 税率：品类单独设置（食品 8%）优先，否则用 opts.consumptionTaxRate（默认 10%）
              const rate = category.taxRate ?? opts.consumptionTaxRate ?? 0.1;
              return fmtJpy(exclFromIncl(incl, rate), lang);
            },
          },
          rating,
        ];
  const specTables = products.map((p) => specRows(p, category, brands, lang));
  const rows = [];
  for (const e of extra) {
    const values = products.map(e.get);
    rows.push({ key: e.key, label: e.label, values, differs: new Set(values).size > 1 });
  }
  specTables[0].forEach((row, i) => {
    const values = specTables.map((t) => t[i].value);
    rows.push({ key: row.key, label: row.label, values, differs: new Set(values).size > 1 });
  });
  return { products: products.map((p) => ({ id: p.id, model: p.model, brand: p.brand })), rows };
}

/**
 * model 是不是厂家型号（只有字母、数字、连字符等，如 NW-YQH10、ES-LVHX、1124834）。
 * 化妆品、药品、食品的 model 常是日文商品名（肌ラボ 極潤ヒアルロン液 170mL），不能当型号（mpn）用（#99）。
 */
export function isMakerModel(model) {
  return /^[A-Za-z0-9][A-Za-z0-9 ./+-]*$/.test(String(model ?? '').trim());
}

/** 别名里的 13 位 JAN（EAN-13，校验位正确）；没有时返回 null（#99） */
export function gtin13Of(product) {
  for (const a of product.aliases ?? []) {
    const s = String(a).trim();
    if (!/^\d{13}$/.test(s)) continue;
    const sum = [...s.slice(0, 12)].reduce((t, d, i) => t + Number(d) * (i % 2 ? 3 : 1), 0);
    if ((10 - (sum % 10)) % 10 === Number(s[12])) return s;
  }
  return null;
}
