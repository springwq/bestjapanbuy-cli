// core 的文案消息表（zh / en）。计算函数通过可选参数 lang 取对应语言，默认 zh，缺失的键回退到中文。
// 网站页面的 UI 文案不在这里，见 site/src/i18n/{zh,en}.json。
// 繁体中文（zh-tw）没有单独的消息表：取简体原文，再用 setTextConverter 注册的转换函数转换
// （网站构建时由 OpenCC 统一转换页面，浏览器里由 site/src/scripts/lang.js 注册构建时生成的对照表）。

export const LANGS = ['zh', 'zh-tw', 'en'];
export const DEFAULT_LANG = 'zh';
/** 繁体中文版的语言代码 */
export const HANT = 'zh-tw';

/** 中文（简体或繁体）：文字按中文版写，中文版内容同样显示 */
export function isZh(lang) {
  return lang === 'zh' || lang === HANT;
}

const converters = {};
/** 注册某语言的文字转换函数（简体 → 该语言），没有注册时返回简体原文 */
export function setTextConverter(lang, fn) {
  if (typeof fn === 'function') converters[lang] = fn;
  else delete converters[lang];
}

export const MESSAGES = {
  zh: {
    pending: '待补充',
    listSep: '、',
    'fx.user': '用户指定',
    'status.note': '截至 {date}：收录 {categories} 个品类、{products} 个型号。日本含税价覆盖 {jp} 个型号，其中 {marketMin} 个是价格.com 的网店最低价（不含运费），其余为厂家定价或官方商店、零售店价格；{msrp} 个型号同时记录了厂家定价。第三方评分 {reviews} 个（价格.com、@cosme 等）。门店 {stores} 家，其中 {storesVerified} 家已对照官网核对。价格.com 价格、评分和汇率每周一自动采集；价格变动超过 30% 或网店最低价高于厂家定价 10% 以上的标记“待确认”',
    'status.needsReview': '（目前 {needsReview} 个）。',
    'status.noReview': '（目前没有）。',

    // 价格（price.js）
    'price.noJp': '日本价暂未收录',
    'explain.jp': '日本含税价 JP¥{incl}（{source}，{date}）',
    'explain.free': '不含税价（免税价 / 退税后）= JP¥{incl} ÷ {rate} ≈ JP¥{free}',
    'explain.local': '当地货币参考价 = JP¥{free} × {fx}（汇率：1 日元兑 {cur}，{fxDate}）≈ {local}（只是汇率换算）',
    'explain.noSource': '来源待补充',
    'explain.noDate': '日期待补充',
    'explain.jp.msrp': '日本含税价 JP¥{incl}（厂家定价，{source}，{date}）',
    'explain.jp.store': '日本含税价 JP¥{incl}（店铺价，{source}，{date}）',
    'explain.jp.market-min': '日本含税价 JP¥{incl}（网店最低价，不含运费，{source}，{date}）',
    'explain.marketMin': '网店最低价 JP¥{min}（不含运费，网店不一定能免税），免税/退税后价格不按它算',
    'explain.estimated': '（按网店最低价估算，实体店通常更高）',
    'explain.estimatedMsrp': '（按网店最低价估算；厂家定价 JP¥{msrp}，实体店价格通常在两者之间）',

    // 排序依据（rank.js，#145）
    'rank.usage': '{home}：{label}',
    'rank.usage.transformer': '{home}：需配件（要配降压变压器）',
    'rank.usage.goods': '非电器商品',
    'rank.usage.unknown': '{home}能不能用待补充',
    'rank.price.yes': '有日本价',
    'rank.price.no': '日本价待补充',
    'rank.rating': '评分 {rating}/{scale}（{source} {count} 条）',
    'rank.ratingNoCount': '评分 {rating}/{scale}（{source}）',
    'rank.rating.none': '没有第三方评分',
    'rank.seller': '（品牌自营网店的评分）',
    'rank.jp': '{price}',
    'rank.jp.market-min': '网店最低价 {price}',
    'rank.jp.msrp': '厂家定价 {price}',
    'rank.jp.store': '店铺价 {price}',
    'rank.sep': ' → ',

    // 向导（guide.js）
    'guide.msg.budget': '在你的预算内没有符合条件的型号。',
    'guide.msg.none': '没有符合这些条件的型号，可以试试放宽某个条件。',
    'guide.msg.noDest': '我们收录的型号里，没有可以带回{dest}使用的。可以看看型号页的各目的地结论，或选“在日本用”。',
    'guide.reason.usage': '带回{dest}可以直接用',

    // 兼容性（compat.js）
    'compat.usage.ok': '直接用',
    'compat.usage.accessory': '需配件',
    'compat.usage.no': '不能用',
    'compat.goods.ok': '可以带入境',
    'compat.goods.accessory': '有限制',
    'compat.goods.no': '不能带入境',
    'compat.flight.ok': '可以带上飞机',
    'compat.flight.accessory': '有条件',
    'compat.flight.no': '不能带上飞机',
    'compat.badDest': '不支持的目的地: {code}',
    // 规则文案模板变量（compat.js 的 ruleVars）
    'compat.var.destVoltageAny': '200–240',
    'compat.var.recWatt': '{w} 以上',
    'compat.var.recWattUnknown': '按电饭煲功率 ÷0.8 计算',
    'compat.var.recWattHint': '（这款 {watt}，即 {w} 以上）',
    'compat.var.recWattHintUnknown': '（这款的功率待补充，以铭牌为准）',

    // 规格（specs.js）
    'version.overseas': '海外版',
    'version.domestic': '本土版',
    'version.global': '全球电压',
    'spec.brand': '品牌',
    'spec.model': '型号',
    'spec.version': '版本',
    'spec.voltage': '电压',
    'spec.frequency': '频率',
    'spec.plug': '插头',
    'spec.watt': '功率',
    'spec.battery': '电池',
    'spec.releaseYear': '发售年份',
    'spec.plugType': '{plug} 型',
    'spec.battery.li-ion': '锂电池',
    'spec.battery.wh': '，约 {wh}Wh',
    'spec.battery.none': '无内置电池',
    'spec.year': '{year}年',
    'spec.yes': '有',
    'spec.no': '无',
    'compare.price': '日本含税价',
    'compare.taxFree': '不含税价（免税价 / 退税后）',
    'compare.usage': '带回{d}使用',
    'home.cn': '中国大陆',
    'compare.rating': '评分',
    'compare.err.count': '对比需要 2–3 个型号',
    'compare.err.category': '跨品类的型号不能放在一起对比',

    // 评分（rating.js）
    'rating.summary': '{rating}/{scale}（{source}）',
    'rating.third': '第三方',

    // 退税（tax.js）
    'tax.err.noRule': '找不到 {date} 适用的免税规则',
    'tax.err.rate': '税率必须在 0 和 1 之间',
    'tax.err.price': '价格必须是正数',
  },
  en: {
    'status.note': 'As of {date}: {categories} categories and {products} models. Japan prices (tax included) cover {jp} models; {marketMin} are the lowest online-shop prices on Kakaku.com (excluding shipping), and the rest are manufacturer list prices or official-store and retail prices. {msrp} models also have the manufacturer list price recorded. {reviews} third-party ratings (Kakaku.com, @cosme and others). {stores} stores, {storesVerified} of which have been checked against official websites. Kakaku.com prices, ratings and exchange rates are collected automatically every Monday; prices that change by more than 30%, or whose lowest online price is more than 10% above the manufacturer list price, are flagged "needs review"',
    'status.needsReview': ' (currently {needsReview}).',
    'status.noReview': ' (currently none).',
    pending: 'TBD',
    listSep: ', ',
    'fx.user': 'user-specified',

    'price.noJp': 'No Japan price yet',
    'explain.jp': 'Japan price incl. tax JP¥{incl} ({source}, {date})',
    'explain.free': 'Tax-free price / after refund = JP¥{incl} ÷ {rate} ≈ JP¥{free}',
    'explain.local': 'Local currency reference = JP¥{free} × {fx} (JPY→{cur}, {fxDate}) ≈ {local} (exchange-rate conversion only)',
    'explain.noSource': 'source TBD',
    'explain.noDate': 'date TBD',
    'explain.jp.msrp': 'Japan price incl. tax JP¥{incl} (manufacturer list price, {source}, {date})',
    'explain.jp.store': 'Japan price incl. tax JP¥{incl} (store price, {source}, {date})',
    'explain.jp.market-min': 'Japan price incl. tax JP¥{incl} (lowest online price, shipping not included, {source}, {date})',
    'explain.marketMin': 'Lowest online price JP¥{min} (shipping not included, and online shops may not sell tax-free); the tax-free price is not based on it',
    'explain.estimated': ' (estimated from the lowest online price; stores usually charge more)',
    'explain.estimatedMsrp': ' (estimated from the lowest online price; the manufacturer list price is JP¥{msrp}, and store prices are usually in between)',

    'rank.usage': '{home}: {label}',
    'rank.usage.transformer': '{home}: needs an accessory (step-down transformer)',
    'rank.usage.goods': 'Not an appliance',
    'rank.usage.unknown': '{home} verdict TBD',
    'rank.price.yes': 'Has a Japan price',
    'rank.price.no': 'Japan price TBD',
    'rank.rating': 'Rating {rating}/{scale} ({source}, {count} reviews)',
    'rank.ratingNoCount': 'Rating {rating}/{scale} ({source})',
    'rank.rating.none': 'No third-party rating',
    'rank.seller': ' (rating from the brand’s own store)',
    'rank.jp': '{price}',
    'rank.jp.market-min': 'lowest online price {price}',
    'rank.jp.msrp': 'list price {price}',
    'rank.jp.store': 'store price {price}',
    'rank.sep': ' → ',

    'guide.msg.budget': 'No model matches within your budget.',
    'guide.msg.none': 'No model matches all of these. Try relaxing one of your answers.',
    'guide.msg.noDest': 'None of the models we list can be used in {dest}. Check the destination table on each model page, or choose to use it in Japan.',
    'guide.reason.usage': 'Works as is in {dest}',

    'compat.usage.ok': 'Works as is',
    'compat.usage.accessory': 'Needs an accessory',
    'compat.usage.no': 'Will not work',
    'compat.goods.ok': 'Allowed',
    'compat.goods.accessory': 'Restricted',
    'compat.goods.no': 'Not allowed in',
    'compat.flight.ok': 'OK on the plane',
    'compat.flight.accessory': 'Allowed with conditions',
    'compat.flight.no': 'Not allowed',
    'compat.badDest': 'Unsupported destination: {code}',
    'compat.var.destVoltageAny': '200–240',
    'compat.var.recWatt': 'at least {w}',
    'compat.var.recWattUnknown': 'rice cooker wattage ÷ 0.8',
    'compat.var.recWattHint': ' (this model is {watt}, so at least {w})',
    'compat.var.recWattHintUnknown': ' (this model\'s wattage is not listed yet; check the rating label)',

    'version.overseas': 'Overseas model',
    'version.domestic': 'Japan-only model',
    'version.global': 'Worldwide voltage',
    'spec.brand': 'Brand',
    'spec.model': 'Model',
    'spec.version': 'Version',
    'spec.voltage': 'Voltage',
    'spec.frequency': 'Frequency',
    'spec.plug': 'Plug',
    'spec.watt': 'Power',
    'spec.battery': 'Battery',
    'spec.releaseYear': 'Released',
    'spec.plugType': 'Type {plug}',
    'spec.battery.li-ion': 'Lithium-ion',
    'spec.battery.wh': ', about {wh}Wh',
    'spec.battery.none': 'No built-in battery',
    'spec.year': '{year}',
    'spec.yes': 'Yes',
    'spec.no': 'No',
    'compare.price': 'Japan price (incl. tax)',
    'compare.taxFree': 'Tax-free / after refund',
    'compare.usage': 'Use in mainland China',
    'home.cn': 'mainland China',
    'compare.rating': 'Rating',
    'compare.err.count': 'Pick 2–3 models to compare',
    'compare.err.category': 'Models from different categories cannot be compared',

    'rating.summary': '{rating}/{scale} ({source})',
    'rating.third': 'third party',

    'tax.err.noRule': 'No tax-free rule applies on {date}',
    'tax.err.rate': 'Tax rate must be between 0 and 1',
    'tax.err.price': 'Price must be a positive number',
  },
};

export function normLang(lang) {
  return LANGS.includes(lang) ? lang : DEFAULT_LANG;
}

/** 取消息：lang 缺失的键回退到中文；{name} 占位符用 vars 替换 */
export function msg(lang, key, vars) {
  const l = normLang(lang);
  let s = MESSAGES[l]?.[key] ?? MESSAGES.zh[key] ?? key;
  if (converters[l] && !MESSAGES[l]?.[key]) s = converters[l](s);
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s;
}
