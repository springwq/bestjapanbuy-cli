// 极简表格输出：东亚宽字符（汉字、假名、全角符号等）按 2 列宽计算。

function isWide(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

function isZeroWidth(cp) {
  return (cp >= 0x0300 && cp <= 0x036f) || cp === 0x200b || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f);
}

/** 字符串在终端中的显示宽度 */
export function strWidth(s) {
  let w = 0;
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    if (isZeroWidth(cp)) continue;
    w += isWide(cp) ? 2 : 1;
  }
  return w;
}

/** 截断到指定显示宽度，超出时以 … 结尾 */
export function truncate(s, max) {
  s = String(s);
  if (strWidth(s) <= max) return s;
  let out = '';
  let w = 0;
  for (const ch of s) {
    const cw = strWidth(ch);
    if (w + cw > max - 1) break;
    out += ch;
    w += cw;
  }
  return out + '…';
}

export function padEnd(s, width) {
  s = String(s);
  return s + ' '.repeat(Math.max(0, width - strWidth(s)));
}

/**
 * 渲染表格。
 * @param {string[]} headers
 * @param {Array<Array<any>>} rows
 * @param {{ maxWidth?: number[] | number }} opts 每列最大显示宽度（最后一列默认不截断，便于显示链接；数组中显式给出时截断）
 */
export function table(headers, rows, opts = {}) {
  const cell = (v) => (v == null || v === '' ? '-' : String(v).replace(/\s*\n\s*/g, ' '));
  const n = headers.length;
  const maxOf = (i) => {
    if (Array.isArray(opts.maxWidth) && opts.maxWidth[i] != null) return opts.maxWidth[i];
    if (i === n - 1) return Infinity;
    return Array.isArray(opts.maxWidth) ? 40 : opts.maxWidth ?? 40;
  };
  const body = rows.map((r) => headers.map((_, i) => truncate(cell(r[i]), maxOf(i))));
  const widths = headers.map((h, i) => Math.max(strWidth(h), ...body.map((r) => strWidth(r[i]))));
  const line = (cells) =>
    cells
      .map((c, i) => (i === n - 1 ? c : padEnd(c, widths[i])))
      .join('  ')
      .trimEnd();
  return [line(headers), widths.map((w) => '-'.repeat(w)).join('  '), ...body.map(line)].join('\n');
}

/** 两列"项目 / 内容"表 */
export function kvTable(pairs, opts = {}) {
  const rows = pairs.filter(Boolean);
  const kw = Math.max(...rows.map(([k]) => strWidth(k)));
  return rows.map(([k, v]) => `${padEnd(k, kw)}  ${v == null || v === '' ? '-' : truncate(String(v), opts.maxWidth ?? 200)}`).join('\n');
}
