import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { assembleDataset } from './dataset.js';

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}
// 只列出该目录下的文件，不进入子目录（data/articles/en/ 等译文目录不会混进中文文章）
function listFiles(dir, ext) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext) && statSync(join(dir, f)).isFile())
    .sort()
    .map((f) => join(dir, f));
}

const I18N_LANGS = ['en', 'zh-tw'];

/** 读取一种语言的覆盖层：data/i18n/{lang}/** 和 data/articles/{lang}/*.md。目录不存在时返回空覆盖层。 */
export function loadOverlay(dataDir, lang) {
  const dir = join(dataDir, 'i18n', lang);
  const byFile = (sub) => Object.fromEntries(listFiles(join(dir, sub), '.json').map((f) => [basename(f, '.json'), readJson(f)]));
  const opt = (name) => (existsSync(join(dir, name)) ? readJson(join(dir, name)) : null);
  const merge = (sub) => Object.assign({}, ...Object.values(byFile(sub)));
  return {
    products: merge('products'),
    reviews: merge('reviews'),
    // 按文件名分组保留一份，校验脚本用来检查"型号是否在对应品类文件里"
    productFiles: byFile('products'),
    reviewFiles: byFile('reviews'),
    categories: byFile('categories'),
    rules: opt('rules.json'),
    stores: opt('stores.json'),
    meta: opt('meta.json'),
    sources: opt('sources.json'),
    // 繁体版的术语表 { 简体: 繁体 }（只有 zh-tw 用，见 site/src/lib/hant.js）
    terms: opt('terms.json'),
    // 繁体版 OpenCC 之后的字形替换 { 繁体字: 改用的字 }（如 臺 → 台）
    variants: opt('variants.json'),
    articles: listFiles(join(dataDir, 'articles', lang), '.md').map(parseArticle),
  };
}

/** Markdown + YAML frontmatter */
export function parseArticle(file) {
  const text = readFileSync(file, 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file} 缺少 frontmatter`);
  const fm = parseYaml(m[1]);
  return { slug: basename(file, '.md'), ...fm, body: m[2].trim() };
}

/** 读取 data/ 目录的原始数据（不做计算），供校验脚本使用 */
export function loadRaw(dataDir) {
  const merge = (dir) => Object.assign({}, ...listFiles(join(dataDir, dir), '.json').map(readJson));
  return {
    meta: readJson(join(dataDir, 'meta.json')),
    brands: readJson(join(dataDir, 'brands.json')),
    categories: listFiles(join(dataDir, 'categories'), '.json').map(readJson),
    products: listFiles(join(dataDir, 'products'), '.json').flatMap(readJson),
    prices: merge('prices'),
    reviews: merge('reviews'),
    images: merge('images'),
    rules: readJson(join(dataDir, 'rules', 'compat.json')),
    stores: readJson(join(dataDir, 'stores', 'stores.json')),
    stations: readJson(join(dataDir, 'stores', 'stations.json')),
    chains: existsSync(join(dataDir, 'stores', 'chains.json')) ? readJson(join(dataDir, 'stores', 'chains.json')) : {},
    taxFreeGuide: existsSync(join(dataDir, 'stores', 'tax-free.json')) ? readJson(join(dataDir, 'stores', 'tax-free.json')) : null,
    articles: listFiles(join(dataDir, 'articles'), '.md').map(parseArticle),
    changelog: existsSync(join(dataDir, 'changelog.json')) ? readJson(join(dataDir, 'changelog.json')) : [],
    i18n: Object.fromEntries(I18N_LANGS.map((l) => [l, loadOverlay(dataDir, l)])),
  };
}

export function loadDataset(dataDir) {
  return assembleDataset(loadRaw(dataDir));
}
