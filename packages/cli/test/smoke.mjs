// 冒烟测试：构建后的命令行能启动、能打印帮助和版本（不联网）
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const cli = new URL('../dist/cli.js', import.meta.url).pathname;
const help = execFileSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
for (const c of ['search', 'show', 'compare', 'price', 'compat', 'stores', 'refund', 'mcp']) assert.match(help, new RegExp(`\\b${c}\\b`));
assert.match(execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf8' }), /\d+\.\d+\.\d+/);
console.log('smoke ok');
