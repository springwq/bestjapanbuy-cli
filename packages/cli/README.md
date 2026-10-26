# bestjapanbuy

[BestJapanBuy 日本买明白](https://bestjapanbuy.com) 的命令行工具：来日本买什么、日本价格和退税后多少钱、带回国能不能用、能不能上飞机、去哪家店买。

- 无需配置，`npx` 即用（安装包放在 bestjapanbuy.com，未发布到 npm），Node.js 18 及以上
- 默认输出中文表格，加 `--json` 输出 JSON
- 每条结果都附 bestjapanbuy.com 页面链接和数据更新日期
- 内置本地 MCP 服务，可接入 Claude、Cursor 等 AI 助手

## 快速开始

先全局安装（之后用 `bestjapanbuy` 或短别名 `bjb`）：

```bash
npm i -g https://bestjapanbuy.com/cli/bestjapanbuy-latest.tgz
```

也可以不安装，每次用 `npx -y https://bestjapanbuy.com/cli/bestjapanbuy-latest.tgz <命令>`。

```bash
# 按品类搜索：海外版、预算 6 万日元以内
bestjapanbuy search rice-cooker --version overseas --budget 60000

# 型号详情（容错匹配：大小写、连字符、颜色后缀都可以）
bestjapanbuy show NW-YQH10
bestjapanbuy show nw-yqh10-ba

# 对比 2–3 个同品类型号
bestjapanbuy compare NW-YQH10 JPK-W10W

# 日本价、退税后价格、当地货币参考价（默认人民币，可指定货币或汇率）
bestjapanbuy price NW-YQH10
bestjapanbuy price NW-YQH10 --currency USD

# 带到中国大陆/香港/台湾等地能不能用、能不能上飞机
bestjapanbuy compat rice-cooker --to CN
bestjapanbuy compat JPK-W10W --to TW

# 最近的家电门店（车站名或经纬度）
bestjapanbuy stores --near shinjuku
bestjapanbuy stores --lat 35.6896 --lng 139.7006 --category rice-cooker

# 退税计算（--excl 表示价格不含税，--other 为其他境外购物金额，用于判断入境 5000 元免税额度）
bestjapanbuy refund 63600 --fx 0.0425
bestjapanbuy refund 58000 --excl --date 2026-11-15 --other 3000
```

短别名 `bjb`：

```bash
bjb show NW-YQH10 --json
```

## 命令

| 命令 | 说明 |
| --- | --- |
| `search <品类> [--version overseas\|domestic\|global] [--budget N] [--brand x] [--keyword k] [--attr 属性=值] [--limit N]` | 搜索型号 |
| `show <型号>` | 型号详情：规格、价格（含免税/退税后价格）、兼容性、评价 |
| `compare <型号1> <型号2> [型号3]` | 并排对比，`*` 标出不同之处 |
| `price <型号> [--currency CNY] [--fx N]` | 日本含税价、免税/退税后价格、当地货币参考价（只是汇率换算）和计算过程 |
| `compat <品类\|型号> [--to CN]` | 电压、插头、频率、锁区、登机逐项结论；目的地可选 CN HK MO TW SG KR US JP |
| `stores --near <车站> \| --lat N --lng N [--category c]` | 最近门店、距离和 Google 地图导航链接 |
| `refund <价格> [--fx N] [--excl] [--date YYYY-MM-DD] [--other 人民币]` | 免税价、退税额、人民币、适用规则（2026-11-01 起为离境退税方式） |
| `mcp` | 启动本地 MCP 服务（stdio） |
| `help` / `--help` / `--version` | 帮助、版本 |

通用参数：

| 参数 | 说明 |
| --- | --- |
| `--json` | 输出 JSON（适合脚本处理） |
| `--api <url>` | 数据接口地址，默认 `https://bestjapanbuy.com/api/v1`；也可设置环境变量 `BESTJAPANBUY_API` |
| `--data <目录>` | 直接读取本地 `data/` 目录（开发、测试用） |

## 接入 AI 助手（MCP）

### 远程版（无需安装，需要登录）

支持远程 MCP 的客户端直接添加下面的地址；第一次连接时会打开浏览器，在 bestjapanbuy.com 用 Google 或 X 账号登录并授权（免费）：

```
https://mcp.bestjapanbuy.com/mcp
```

### 本地版（stdio，免登录）

Claude Desktop（`claude_desktop_config.json`）、Cursor（`.cursor/mcp.json`）等：

```json
{
  "mcpServers": {
    "bestjapanbuy": {
      "command": "npx",
      "args": ["-y", "https://bestjapanbuy.com/cli/bestjapanbuy-latest.tgz", "mcp"]
    }
  }
}
```

Claude Code：

```bash
claude mcp add bestjapanbuy -- npx -y https://bestjapanbuy.com/cli/bestjapanbuy-latest.tgz mcp
# 或使用远程版（添加后在 /mcp 里选 bestjapanbuy → Authenticate 登录授权）
claude mcp add --transport http bestjapanbuy https://mcp.bestjapanbuy.com/mcp
```

提供的工具：`search_products`、`get_product`、`compare_products`、`check_compatibility`、`get_price`、`find_stores`、`calc_tax_refund`、`get_tax_free_rules`。本地版从公开 API 读取数据。

## 数据与使用条款

- 数据来自 [bestjapanbuy.com](https://bestjapanbuy.com)，使用时请注明出处。
- 价格仅供参考，以店铺为准；门店信息去前请确认。
- 开发者文档：<https://bestjapanbuy.com/developers/>

## 开发

```bash
npm install                         # 仓库根目录
npm run build -w packages/cli       # 打包到 packages/cli/dist/
node packages/cli/dist/cli.js show NW-YQH10 --data data
npm test                            # 根目录运行全部测试
```

## 许可

MIT
