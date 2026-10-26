// BestJapanBuy MCP 服务：8 个只读工具。远程版见 http.js，本地 stdio 版由 CLI `bestjapanbuy mcp` 启动。
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as tools from './tools.js';

export * from './tools.js';

export const SERVER_NAME = 'bestjapanbuy';
export const SERVER_VERSION = '0.1.0';

const INSTRUCTIONS = `BestJapanBuy（日本买明白，https://bestjapanbuy.com）：来日本买什么：日本家电/好物推荐、日本价格和退税后价格、能否带回去使用、门店和免税退税信息。
What to buy in Japan: product picks, Japan prices and tax-free prices, compatibility abroad (voltage/plug/flight), nearby stores, and tax-free rules.
Every result includes a bestjapanbuy.com page URL and dataUpdatedAt; please cite the URL (source: bestjapanbuy.com). Prices are for reference only.`;

const productRef = z.string().min(1).describe('型号id（如 zojirushi-nw-yqh10）或型号字符串（如 NW-YQH10，容错匹配）/ product id or model number (fuzzy)');
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function fail(e) {
  const body =
    e instanceof tools.BjbError
      ? { error: e.message, code: e.code, ...(e.suggestions ? { suggestions: e.suggestions } : {}) }
      : { error: `内部错误 / internal error: ${e?.message ?? e}`, code: 'internal' };
  return { content: [{ type: 'text', text: JSON.stringify(body) }], isError: true };
}

/**
 * @param {() => object | Promise<object>} getDataset 返回已组装的 dataset（可异步、可每次返回最新数据）
 */
export function createServer(getDataset) {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS });

  const register = (name, title, description, inputSchema, fn) =>
    server.registerTool(name, { title, description, inputSchema, annotations: { title, ...READ_ONLY } }, async (args) => {
      try {
        const ds = await getDataset();
        return ok(fn(ds, args ?? {}));
      } catch (e) {
        return fail(e);
      }
    });

  register(
    'search_products',
    'Search products',
    '按品类、版本、价格区间、品牌、专属属性、关键词搜索日本家电型号，返回日本价格、带回中国大陆能否使用和页面链接。' +
      'Search Japanese appliance models by category, version (overseas 海外版 220V / domestic 本土版 100V / global 全球电压), JPY price range, brand, category attributes and keyword. ' +
      'Returns Japan price, China usage verdict and bestjapanbuy.com URL for each model. Call with no arguments to see the category list.',
    {
      category: z.string().optional().describe('品类id，如 rice-cooker / category id, e.g. rice-cooker'),
      version: z.enum(['overseas', 'domestic', 'global']).optional().describe('overseas 海外版 / domestic 日本本土版 / global 全球电压'),
      minPrice: z.number().nonnegative().optional().describe('最低日本含税价（日元）/ min Japan price, JPY tax-included'),
      maxPrice: z.number().nonnegative().optional().describe('最高日本含税价（日元，即预算）/ max Japan price (budget), JPY'),
      brand: z.string().optional().describe('品牌id或名称，如 zojirushi / 象印 / brand id or name'),
      attrs: z
        .record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
        .optional()
        .describe('品类专属属性，如 {"capacity":"5.5","heating":"pressure-ih"} / category attributes filter'),
      keyword: z.string().optional().describe('关键词（型号、名称、品牌）/ keyword (model, name, brand)'),
      limit: z.number().int().min(1).max(100).optional().describe('返回条数，默认20 / max results, default 20'),
    },
    tools.searchProducts,
  );

  register(
    'get_product',
    'Get product',
    '按型号id或型号字符串（容错：忽略大小写、连字符、颜色后缀）获取完整信息：规格、日本价格和免税/退税后价格、评价、带回国兼容性、对应海外版/本土版、相关问答。' +
      'Get full details of a model by id or model string (fuzzy: case, hyphens, color suffix ignored): specs, Japan prices and tax-free price, reviews, China compatibility, counterpart models, related articles.',
    {
      id: z.string().optional().describe('型号id，如 zojirushi-nw-yqh10 / product id'),
      model: z.string().optional().describe('型号字符串，如 NW-YQH10-BA / model number'),
    },
    tools.getProduct,
  );

  register(
    'compare_products',
    'Compare products',
    '并排对比 2–3 个同品类型号的规格、价格、能否带回使用，并列出不同之处。Compare 2–3 models of the same category side by side; returns spec rows and the differing fields.',
    { ids: z.array(z.string().min(1)).min(2).max(3).describe('2–3 个型号id或型号 / 2–3 product ids or model numbers') },
    tools.compareProducts,
  );

  register(
    'check_compatibility',
    'Check compatibility',
    '判断型号（或整个品类）带到目的地能否使用：电压、插头、频率、锁区，以及能否带上飞机。目的地默认中国大陆 CN，可选 CN HK MO TW SG KR US JP。' +
      'Check whether a model (or every model in a category) works at a destination — voltage, plug, frequency, region lock — and whether it can be taken on a flight. Destination defaults to CN (mainland China); also HK MO TW SG KR US JP.',
    {
      product: productRef.optional(),
      category: z.string().optional().describe('品类id（不指定型号时按品类统计）/ category id (used when no product given)'),
      destination: z.string().optional().describe('目的地代码，默认 CN / destination code, default CN'),
    },
    tools.checkCompatibility,
  );

  const priceArgs = {
    product: productRef,
    currency: z.string().regex(/^[A-Za-z]{3}$/).optional().describe('当地货币参考价的货币（ISO 4217），默认 CNY，如 USD HKD TWD KRW / currency for the local reference price, default CNY'),
    fx: z.number().positive().optional().describe('自定义汇率：1 日元兑该货币，如 0.0425；默认使用站点汇率 / custom JPY→currency rate, default site rate'),
  };

  register(
    'get_price',
    'Get price',
    '型号的日本含税价、免税/退税后价格（不含税价）和当地货币参考价（按汇率换算，默认人民币），附计算过程和来源。不和任何地方的价格比较。' +
      'Japan tax-included price, tax-free / after-refund price and a local-currency reference (exchange-rate conversion, default CNY) for a model, with step-by-step calculation and sources. No price comparison with other countries.',
    priceArgs,
    tools.getPrice,
  );

  register(
    'find_stores',
    'Find stores',
    '按经纬度或车站名（如 shinjuku、umeda、namba、hakata、sapporo、narita-airport、新宿）查找最近的门店（电器店、药妆店、百货、机场免税店，覆盖东京、大阪、京都、福冈、札幌、那霸和主要机场），返回距离、交通、营业时间、是否免税和 Google 地图导航链接。' +
      'Find the nearest stores in Japan (electronics, drugstores, department stores, airport duty-free; Tokyo, Osaka, Kyoto, Fukuoka, Sapporo, Naha and major airports) by lat/lng or station name; returns distance, access, hours, tax-free status and Google Maps navigation link.',
    {
      lat: z.number().min(-90).max(90).optional().describe('纬度 / latitude'),
      lng: z.number().min(-180).max(180).optional().describe('经度 / longitude'),
      station: z.string().optional().describe('车站名或id，如 shinjuku / umeda / hakata / sapporo / kansai-airport / 新宿 / station name or id'),
      city: z.string().optional().describe('只返回该城市的门店：tokyo / osaka / kyoto / fukuoka / sapporo / naha / airport / only stores in this city'),
      chain: z.string().optional().describe('连锁店id，如 bic-camera / don-quijote / matsukiyo / chain id'),
      category: z.string().optional().describe('品类id，只返回有该品类的门店 / only stores carrying this category'),
      limit: z.number().int().min(1).max(50).optional().describe('返回门店数，默认5 / number of stores, default 5'),
    },
    tools.findStores,
  );

  register(
    'calc_tax_refund',
    'Tax refund',
    '计算日本免税价、退税额、人民币金额，以及是否超过中国入境免税额度（5000元），按购买日期套用当时的免税规则（2026-11-01 起为离境退税方式）。' +
      'Calculate Japan tax-free price, refund amount, CNY amount and whether China customs duty-free allowance is exceeded; applies the tax-free rule in effect on the purchase date (refund scheme from 2026-11-01).',
    {
      price: z.number().positive().describe('价格（日元）/ price in JPY'),
      taxIncluded: z.boolean().optional().describe('价格是否含税，默认 true / whether price includes consumption tax, default true'),
      fx: z.number().positive().optional().describe('汇率：1日元兑人民币 / JPY→CNY rate'),
      date: dateStr.optional().describe('购买日期 YYYY-MM-DD，默认今天 / purchase date, default today'),
      otherCny: z.number().nonnegative().optional().describe('本次出境其他境外购物金额（人民币），用于判断入境免税额度 / other overseas purchases in CNY'),
      taxRate: z.union([z.literal(0.08), z.literal(0.1)]).optional().describe('消费税率：食品 0.08（轻减税率），其他 0.1；默认按 product 的品类，否则 0.1 / consumption tax rate: 0.08 for food, 0.1 otherwise'),
      product: z.string().optional().describe('型号或id（可选），用于按品类自动选择税率 / model or id, used to pick the tax rate by category'),
    },
    tools.calcTaxRefund,
  );

  register(
    'get_tax_free_rules',
    'Tax-free rules',
    '返回指定购买日期适用的日本免税规则、条件和办理流程（含 2026年11月1日起的新规），以及中国入境免税额度说明。' +
      'Get the Japan tax-free shopping rules and steps in effect on a purchase date (including the new refund scheme from 2026-11-01), plus China customs allowance.',
    { date: dateStr.optional().describe('购买日期 YYYY-MM-DD，默认今天 / purchase date, default today') },
    tools.getTaxFreeRules,
  );

  return server;
}
