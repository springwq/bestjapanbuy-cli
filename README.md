# bestjapanbuy CLI

Source code of the [BestJapanBuy](https://bestjapanbuy.com) command-line tool (日本买明白 命令行工具): search Japanese products, check whether they work in your country (voltage, plug, customs, flights), estimate tax-free prices, and find stores. It also runs a local stdio MCP server for AI assistants.

This repository is a read-only mirror, synced automatically from the private source repository. Source commit: `5ad6bc86ba5bbf12c3695daa54bb04c70c6c5cfa`.

## What it does and does not do

- Reads only the public data API at `https://bestjapanbuy.com/api/v1/` (no login, no API key, no telemetry).
- Writes nothing to your disk except npm's own install.
- The local MCP server (`bestjapanbuy mcp`) speaks MCP over stdio and uses the same read-only tools.
- Not included here: the hosted MCP server at mcp.bestjapanbuy.com (OAuth sign-in), the website, data collection and deployment.

## Install

```bash
npx -y https://bestjapanbuy.com/cli/bestjapanbuy-latest.tgz --help
```

Verify the download against this source:

```bash
curl -sO https://bestjapanbuy.com/cli/bestjapanbuy-latest.tgz
curl -s https://bestjapanbuy.com/cli/bestjapanbuy-latest.tgz.sha256      # published checksum
sha256sum bestjapanbuy-latest.tgz
curl -s https://bestjapanbuy.com/cli/build.json                          # source commit of that build
```

Or build it yourself: `npm install && npm test && cd packages/cli && npm pack`.

## Layout

- `packages/cli`: commands and the esbuild bundle
- `packages/core`: data assembly, compatibility rules engine, tax-free calculation, search
- `packages/mcp/src`: the read-only tools and the local stdio MCP server

## License

MIT. Data returned by the API is © BestJapanBuy and its cited sources; see https://bestjapanbuy.com/terms/.
