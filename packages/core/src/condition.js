// 极简条件 DSL：数据文件（向导、兼容规则）用它描述条件，新增品类不改代码。
//   { field: "price.jpMin", op: "lte", value: 30000 }
//   { field: "voltage.min", op: "lte", ref: "dest.voltage" }   // 与另一个字段比较
//   { all: [...] } / { any: [...] } / { not: {...} }

export function getPath(obj, path) {
  if (!path) return undefined;
  let cur = obj;
  for (const key of path.split('.')) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

const OPS = {
  eq: (a, b) => a === b,
  ne: (a, b) => a !== b,
  lt: (a, b) => a != null && b != null && a < b,
  lte: (a, b) => a != null && b != null && a <= b,
  gt: (a, b) => a != null && b != null && a > b,
  gte: (a, b) => a != null && b != null && a >= b,
  in: (a, b) => Array.isArray(b) && b.includes(a),
  nin: (a, b) => Array.isArray(b) && !b.includes(a),
  includes: (a, b) => Array.isArray(a) && a.includes(b),
  excludes: (a, b) => !Array.isArray(a) || !a.includes(b),
  exists: (a, b) => (b === false ? a == null : a != null),
};

export function evaluate(cond, ctx) {
  if (!cond) return true;
  if (cond.all) return cond.all.every((c) => evaluate(c, ctx));
  if (cond.any) return cond.any.some((c) => evaluate(c, ctx));
  if (cond.not) return !evaluate(cond.not, ctx);
  const fn = OPS[cond.op];
  if (!fn) throw new Error(`未知条件运算符: ${cond.op}`);
  const left = getPath(ctx, cond.field);
  const right = cond.ref !== undefined ? getPath(ctx, cond.ref) : cond.value;
  return fn(left, right);
}
