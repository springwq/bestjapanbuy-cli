// 打包 CLI（dist/cli.js + dist/chunks/*）：内联 @bestjapanbuy/core、@bestjapanbuy/mcp（以及 --data 才用到的 yaml），
// @modelcontextprotocol/sdk 和 zod 作为运行时依赖保留为外部模块。
import { build } from 'esbuild';
import { readFileSync, chmodSync, rmSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const outdir = new URL('./dist', import.meta.url).pathname;
const outfile = `${outdir}/cli.js`;
rmSync(outdir, { recursive: true, force: true });

await build({
  entryPoints: [new URL('./src/cli.js', import.meta.url).pathname],
  outdir,
  entryNames: '[name]',
  chunkNames: 'chunks/[name]-[hash]',
  // 代码分割：mcp（SDK、zod）和 --data（yaml、node:fs）都是动态 import，单独成块，普通命令启动时不加载
  splitting: true,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  // yaml 为 CJS 包，内部 require('process')；ESM 输出需要提供 require
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __bjbCreateRequire } from 'node:module';\nconst require = __bjbCreateRequire(import.meta.url);" },
  external: ['@modelcontextprotocol/sdk', '@modelcontextprotocol/sdk/*', 'zod', 'zod/*'],
  define: { __BJB_VERSION__: JSON.stringify(pkg.version) },
  legalComments: 'none',
  logLevel: 'warning',
});
chmodSync(outfile, 0o755);
console.log(`built ${outfile}`);
