// BestJapanBuy 命令行：bestjapanbuy / bjb
import { parseArgs } from 'node:util';
import { fmtJpy, fmtCny, VERSION_LABELS, getCategory } from '@bestjapanbuy/core';
import { loadDatasetFromApi, DEFAULT_API } from '@bestjapanbuy/core/load-api';
import * as tools from '@bestjapanbuy/mcp/tools';
import { table, kvTable } from './table.js';

/* global __BJB_VERSION__ */
const VERSION = typeof __BJB_VERSION__ !== 'undefined' ? __BJB_VERSION__ : '0.0.0-dev';

const HELP = `BestJapanBuy 日本买明白 · 命令行 v${VERSION}
来日本买什么：好物推荐、退税后多少钱、能不能带回国用、去哪买。数据来自 https://bestjapanbuy.com

用法：bestjapanbuy <命令> [参数]（短别名 bjb）

命令：
  search <品类> [--version overseas|domestic|global] [--budget 日元] [--brand 品牌] [--keyword 关键词]
                [--attr 属性=值 ...] [--limit N]     按条件搜索型号
  show <型号>                                        型号详情（规格、价格、兼容性）
  compare <型号1> <型号2> [型号3]                     并排对比 2–3 个同品类型号
  price <型号> [--currency CNY] [--fx 汇率]           日本价、退税后价格、当地货币参考价（含计算过程）
  compat <品类|型号> [--to CN]                        带到目的地能不能用、能不能上飞机
  stores --near <车站> | --lat <纬度> --lng <经度> [--category 品类] [--limit N]
                                                     最近的家电门店及导航链接
  refund <价格> [--fx 汇率] [--excl] [--date YYYY-MM-DD] [--other 人民币]
                                                     退税计算（--excl 表示价格不含税）
  mcp                                                启动本地 MCP 服务（stdio）
  help                                               显示帮助

通用参数：
  --json           输出 JSON
  --api <url>      数据接口地址（默认 ${DEFAULT_API}，也可用环境变量 BESTJAPANBUY_API）
  --data <目录>    读取本地 data/ 目录（开发、测试用）
  -h, --help       显示帮助
  -v, --version    显示版本

示例：
  npx bestjapanbuy search rice-cooker --version overseas --budget 60000
  npx bestjapanbuy show NW-YQH10
  npx bestjapanbuy compare NW-YQH10 JPK-W10W
  npx bestjapanbuy price NW-YQH10
  npx bestjapanbuy compat rice-cooker --to CN
  npx bestjapanbuy stores --near shinjuku
  npx bestjapanbuy refund 63600 --fx 0.0425
`;

const OPTIONS = {
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  api: { type: 'string' },
  data: { type: 'string' },
  version: { type: 'string' },
  budget: { type: 'string' },
  brand: { type: 'string' },
  keyword: { type: 'string' },
  attr: { type: 'string', multiple: true },
  limit: { type: 'string' },
  fx: { type: 'string' },
  currency: { type: 'string' },
  to: { type: 'string' },
  near: { type: 'string' },
  lat: { type: 'string' },
  lng: { type: 'string' },
  category: { type: 'string' },
  excl: { type: 'boolean' },
  date: { type: 'string' },
  other: { type: 'string' },
};

class UsageError extends Error {}

function num(v, name, { positive = false } = {}) {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/[,，_]/g, ''));
  if (!Number.isFinite(n) || (positive && n <= 0) || n < 0) throw new UsageError(`参数 ${name} 需要${positive ? '正数' : '数字'}，收到：${v}`);
  return n;
}

function need(v, msg) {
  if (v == null || v === '') throw new UsageError(msg);
  return v;
}

async function loadData(values) {
  if (values.data) {
    const { loadDataset } = await import('@bestjapanbuy/core/load-fs');
    try {
      return loadDataset(values.data);
    } catch (e) {
      throw new Error(`读取本地数据目录失败：${values.data}（${e.message}）`);
    }
  }
  const api = values.api ?? process.env.BESTJAPANBUY_API ?? DEFAULT_API;
  try {
    return await loadDatasetFromApi(api);
  } catch (e) {
    throw new Error(
      `无法从数据接口获取数据：${api}\n原因：${[e.message, e.cause?.code ?? e.cause?.errors?.[0]?.code].filter(Boolean).join(" ")}\n请检查网络连接，或用 --api <url> 指定其他接口地址（也可设置环境变量 BESTJAPANBUY_API）。`,
    );
  }
}

// ---------------------------------------------------------------- 输出

const yen = (n) => (n == null ? '待补充' : fmtJpy(n));
const rmb = (n) => (n == null ? '待补充' : fmtCny(n));

function footer(ds) {
  return `\n数据更新：${ds.meta.updatedAt} · 来源 bestjapanbuy.com · 价格仅供参考，以店铺为准`;
}

function productRows(list) {
  return list.map((p) => [p.model, p.brand, p.versionLabel, yen(p.jpPriceJpy), p.usageInCN, p.rating, p.url]);
}
const PRODUCT_HEAD = ['型号', '品牌', '版本', '日本价(含税)', '带回国', '评分', '链接'];

const render = {
  search(ds, r) {
    const cat = r.query.category ? getCategory(ds, r.query.category) : null;
    const out = [];
    out.push(`${cat ? cat.name.zh : '全部品类'} · 共 ${r.total} 个型号${r.total > r.returned ? `（显示前 ${r.returned} 个）` : ''}`);
    if (!r.total) {
      out.push(r.hint ? '没有符合条件的型号，可以放宽条件。' : '');
      if (r.categories) out.push('可选品类：' + r.categories.map((c) => `${c.id}（${c.name.zh}）`).join('、'));
    } else out.push('', table(PRODUCT_HEAD, productRows(r.results), { maxWidth: [16, 10, 8, 14, 12, 6] }));
    if (r.categoryUrl) out.push('', `品类页：${r.categoryUrl}`);
    return out.join('\n');
  },

  show(ds, r) {
    const p = r.product;
    const out = [`${p.brand.zh ?? p.brand.id} ${p.model}${p.name?.zh ? ` · ${p.name.zh}` : ''}${p.status === 'discontinued' ? '（可能已停售）' : ''}`];
    if (p.summary) out.push(p.summary);
    out.push(`页面：${p.url}`, '');
    out.push('【规格】', kvTable((p.specs ?? []).map((s) => [s.label, s.value])), '');
    const pr = p.price;
    out.push(
      '【价格】',
      kvTable([
        ['日本参考价（含税）', pr?.jp ? `${yen(pr.jp.min)}${pr.jp.max && pr.jp.max !== pr.jp.min ? ` – ${yen(pr.jp.max)}` : ''}（${pr.jp.source?.name ?? '来源待补充'}，${pr.jp.date ?? ''}）` : '待补充'],
        ['免税价 / 退税后', yen(pr?.taxFreeJpy)],
        pr?.needsReview ? ['提示', '价格待复核'] : null,
      ]),
      '',
    );
    if (p.compatibilityCN) {
      const c = p.compatibilityCN;
      out.push(`【带回${c.destinationName}】使用：${c.usageLabel} · 登机：${c.flightLabel}`);
      out.push(table(['检查项', '结论', '说明'], c.items.map((i) => [i.label, levelText(i.level), i.verdict + (i.note ? `（${i.note}）` : '')])), '');
    }
    if (p.review) {
      out.push(`【评价】${p.review.rating}/${p.review.scale ?? 5}${p.review.count ? `（${p.review.count} 条）` : ''} · ${p.review.source?.name ?? ''}`);
      for (const x of p.review.pros ?? []) out.push(`  + ${x}`);
      for (const x of p.review.cons ?? []) out.push(`  - ${x}`);
      out.push('');
    }
    if (p.goodFor) out.push(`适合：${p.goodFor}`);
    if (p.notFor) out.push(`不适合：${p.notFor}`);
    if (p.counterparts.length) out.push('', '【对应型号】', table(PRODUCT_HEAD, productRows(p.counterparts), { maxWidth: [16, 10, 8, 14, 12, 6] }));
    if (p.articles.length) out.push('', '【相关问答】', ...p.articles.map((a) => `  ${a.question}  ${a.url}`));
    return out.join('\n').replace(/\n+$/, '');
  },

  compare(ds, r) {
    const head = ['项目', ...r.products.map((p) => p.model)];
    const rows = r.rows.map((row) => [(row.differs ? '* ' : '  ') + row.label, ...row.values]);
    return [
      `对比：${r.products.map((p) => `${p.brand} ${p.model}`).join(' vs ')}（* 表示不同）`,
      '',
      table(head, rows, { maxWidth: head.map((_, i) => (i === 0 ? 24 : 34)) }),
      '',
      ...r.products.map((p) => `${p.model}：${p.url}`),
      `对比页：${r.compareUrl}`,
    ].join('\n');
  },

  price(ds, r) {
    return [
      `${r.product.brand} ${r.product.model} · 日本价格`,
      '',
      ...r.explanation.map((l) => `  ${l}`),
      ...(r.needsReview ? ['', '提示：价格待复核'] : []),
      '',
      `页面：${r.url}`,
    ].join('\n');
  },

  compat(ds, r) {
    const info = r.destinationInfo;
    const destLine = `${r.destinationName}：${info.voltage}V / ${info.frequency}Hz / 插座 ${info.plugs.join('、')} 型`;
    if (r.product) {
      return [
        `${r.product.brand} ${r.product.model} → ${r.destinationName}`,
        `使用：${r.usageLabel} · 登机：${r.flightLabel}`,
        destLine,
        '',
        table(['检查项', '结论', '说明'], r.items.map((i) => [i.label, levelText(i.level), i.verdict + (i.note ? `（${i.note}）` : '')])),
        ...(info.plugNote ? ['', `插头说明：${info.plugNote}`] : []),
        '',
        `页面：${r.url}`,
      ].join('\n');
    }
    const rows = [
      ...r.ok.map((p) => [p.model, p.brand, VERSION_LABELS[p.version] ?? '-', '可以直接用', p.url]),
      ...r.accessory.map((p) => [p.model, p.brand, VERSION_LABELS[p.version] ?? '-', '需要配件', p.url]),
      ...r.no.map((p) => [p.model, p.brand, VERSION_LABELS[p.version] ?? '-', '不能用', p.url]),
    ];
    return [
      `${r.category.name} → ${r.destinationName}：共 ${r.counts.total} 个型号，可以直接用 ${r.counts.ok}，需要配件 ${r.counts.accessory}，不能用 ${r.counts.no}`,
      destLine,
      '',
      table(['型号', '品牌', '版本', '结论', '链接'], rows, { maxWidth: [16, 10, 8, 10] }),
      ...(r.carryHome?.length ? ['', '带回国注意事项：', ...r.carryHome.map((t) => `  · ${t}`)] : []),
      '',
      `品类页：${r.category.url}`,
    ].join('\n');
  },

  stores(ds, r) {
    const from = r.origin.station ? `${r.origin.name}（${r.origin.station}）` : `${r.origin.lat}, ${r.origin.lng}`;
    return [
      `离 ${from} 最近的门店：`,
      '',
      table(
        ['门店', '距离', '交通', '营业时间', '导航'],
        r.stores.map((s) => [s.name, `${s.distanceKm}km`, s.access, s.hours, s.mapUrl]),
        { maxWidth: [24, 8, 28, 14] },
      ),
      '',
      '门店信息去前请确认。',
      `门店地图：${r.storesUrl}`,
    ].join('\n');
  },

  refund(ds, r) {
    return [
      `退税计算（${r.date}，${r.rule.name}）`,
      '',
      kvTable([
        ['含税价', yen(r.taxIncludedPrice)],
        ['免税价（不含税）', yen(r.taxFreePrice)],
        ['退税额', `${yen(r.refund)}（约 ${rmb(r.refundCny)}）`],
        ['免税价折合人民币', `${rmb(r.taxFreeCny)}（汇率 ${r.fx}，${r.fxDate}）`],
        ['是否满足免税门槛', r.eligible ? `是（不含税满 ${yen(r.minPurchaseExcl)}）` : `否（同一店铺同一天不含税需满 ${yen(r.minPurchaseExcl)}）`],
        r.otherCny ? ['其他境外购物', rmb(r.otherCny)] : null,
        ['入境合计', `${rmb(r.totalOverseasCny)} / 免税额度 ${rmb(r.cnAllowance)}${r.overAllowance ? '（超过额度，需申报）' : '（未超过）'}`],
      ]),
      '',
      `规则：${r.rule.summary}`,
      '',
      `退税计算器：${r.toolUrl}`,
      `免税指南：${r.guideUrl}`,
    ].join('\n');
  },
};

function levelText(l) {
  return { ok: '✓ 可以', accessory: '△ 需配件/有条件', no: '✗ 不行' }[l] ?? l;
}

// ---------------------------------------------------------------- 命令

function isCategory(ds, q) {
  const s = String(q).trim().toLowerCase();
  return ds.categories.some((c) => c.id === s || c.name.zh === q || c.name.ja === q || c.name.en?.toLowerCase() === s);
}

const COMMANDS = {
  search(ds, pos, v) {
    const attrs = {};
    for (const a of v.attr ?? []) {
      const m = a.match(/^([^=]+)=(.*)$/);
      if (!m) throw new UsageError(`--attr 格式应为 属性=值，收到：${a}`);
      attrs[m[1].trim()] = m[2].trim();
    }
    if (v.version && !VERSION_LABELS[v.version]) throw new UsageError('--version 只能是 overseas（海外版）、domestic（本土版）或 global（全球电压）');
    return tools.searchProducts(ds, {
      category: pos[0],
      version: v.version,
      maxPrice: num(v.budget, '--budget'),
      brand: v.brand,
      keyword: v.keyword,
      attrs: Object.keys(attrs).length ? attrs : undefined,
      limit: num(v.limit, '--limit', { positive: true }),
    });
  },
  show(ds, pos) {
    return tools.getProduct(ds, { model: need(pos.join(' '), '请提供型号，例如：bestjapanbuy show NW-YQH10') });
  },
  compare(ds, pos) {
    if (pos.length < 2 || pos.length > 3) throw new UsageError('compare 需要 2–3 个型号，例如：bestjapanbuy compare NW-YQH10 JPK-W10W');
    return tools.compareProducts(ds, { ids: pos });
  },
  price(ds, pos, v) {
    return tools.getPrice(ds, { product: need(pos.join(' '), '请提供型号，例如：bestjapanbuy price NW-YQH10'), currency: v.currency, fx: num(v.fx, '--fx', { positive: true }) });
  },
  compat(ds, pos, v) {
    const q = need(pos.join(' '), '请提供品类或型号，例如：bestjapanbuy compat rice-cooker --to CN');
    return isCategory(ds, q)
      ? tools.checkCompatibility(ds, { category: q, destination: v.to })
      : tools.checkCompatibility(ds, { product: q, destination: v.to });
  },
  stores(ds, pos, v) {
    const lat = num(v.lat, '--lat');
    const lng = num(v.lng, '--lng');
    if ((lat == null) !== (lng == null)) throw new UsageError('--lat 和 --lng 需要同时提供');
    const station = v.near ?? pos[0];
    if (lat == null && !station) throw new UsageError('请用 --near <车站> 或 --lat <纬度> --lng <经度> 指定位置，例如：bestjapanbuy stores --near shinjuku');
    return tools.findStores(ds, { lat, lng, station: lat == null ? station : undefined, category: v.category, limit: num(v.limit, '--limit', { positive: true }) });
  },
  refund(ds, pos, v) {
    const price = num(need(pos[0], '请提供价格（日元），例如：bestjapanbuy refund 63600'), '价格', { positive: true });
    if (v.date && !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) throw new UsageError('--date 格式应为 YYYY-MM-DD');
    return tools.calcTaxRefund(ds, {
      price,
      taxIncluded: !v.excl,
      fx: num(v.fx, '--fx', { positive: true }),
      date: v.date,
      otherCny: num(v.other, '--other'),
    });
  },
};

async function runMcp(values) {
  const [{ StdioServerTransport }, { createServer }] = await Promise.all([
    import('@modelcontextprotocol/sdk/server/stdio.js'),
    import('@bestjapanbuy/mcp'),
  ]);
  let pending = null;
  const getDataset = () => {
    if (!pending)
      pending = loadData(values).catch((e) => {
        pending = null; // 下次调用重试
        throw e;
      });
    return pending;
  };
  getDataset().catch((e) => process.stderr.write(`[bestjapanbuy] ${e.message}\n`));
  const server = createServer(getDataset);
  await server.connect(new StdioServerTransport());
  process.stderr.write(`[bestjapanbuy] MCP 服务已启动（stdio）v${VERSION}\n`);
}

export async function main(argv = process.argv.slice(2)) {
  if (argv[0] === '--version' || argv[0] === '-v') {
    console.log(VERSION);
    return 0;
  }
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (e) {
    const opt = e.message.match(/'(-[^']*)'/)?.[1];
    console.error(`参数错误：${opt ? `无法识别或缺少值的参数 ${opt}` : e.message}\n运行 bestjapanbuy help 查看用法。`);
    return 2;
  }
  const { values, positionals } = parsed;
  const [cmd, ...pos] = positionals;
  if (!cmd || cmd === 'help' || values.help) {
    console.log(HELP);
    return 0;
  }
  if (cmd === 'version') {
    console.log(VERSION);
    return 0;
  }
  if (cmd === 'mcp') {
    await runMcp(values);
    return null; // 保持运行
  }
  const fn = COMMANDS[cmd];
  if (!fn) {
    console.error(`未知命令：${cmd}\n运行 bestjapanbuy help 查看用法。`);
    return 2;
  }
  try {
    const ds = await loadData(values);
    const result = fn(ds, pos, values);
    console.log(values.json ? JSON.stringify(result, null, 2) : (render[cmd] ?? render.price)(ds, result) + footer(ds));
    return 0;
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(`参数错误：${e.message}`);
      return 2;
    }
    if (e instanceof tools.BjbError) {
      if (values.json) console.log(JSON.stringify({ error: e.message, code: e.code, suggestions: e.suggestions ?? [] }, null, 2));
      else {
        console.error(e.message.split('。可能是')[0]);
        if (e.suggestions?.length) console.error('可能是：\n' + e.suggestions.map((s) => `  ${s.title}  ${s.url}`).join('\n'));
      }
      return 1;
    }
    console.error(e.message);
    return 1;
  }
}

const code = await main();
if (code != null) process.exitCode = code;
