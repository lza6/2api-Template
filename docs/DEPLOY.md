# 部署与运行：多运行时

`template/js/core.mjs` 是**运行时无关**的核心（只用 Web 标准 API：`fetch` / `Request` / `Response` /
`ReadableStream` / `TextEncoder` / `crypto.randomUUID`）。同一个核心 + 不同入口 = 跑在任何地方。

```
                    js/core.mjs（唯一核心，改这里的 [★ PROVIDER]）
                            │  handle(request, env)
        ┌───────────┬───────┼───────┬───────────┐
   cloudflare.mjs  node.mjs  bun.mjs  deno.mjs  vercel.mjs
        │            │         │         │          │
     CF Workers   Node18+    Bun      Deno    Vercel Edge
```

## 1. Cloudflare Workers（公网，零运维）

```bash
cp wrangler.toml.example wrangler.toml   # 或直接用 js/wrangler.toml
wrangler secret put API_MASTER_KEY        # 务必设强密钥
wrangler deploy
```

入口 `targets/cloudflare.mjs`（`export default { fetch }`）。`wrangler.toml` 的 `main` 指向它。

## 2. Node.js 18+（本机/自托管）

```bash
node targets/node.mjs            # 默认 :47832
PORT=8080 API_MASTER_KEY=sk-xxx node targets/node.mjs
```

入口 `targets/node.mjs`：用内置 `node:http` + 全局 `Request/Response`（Node 18+ 原生支持），
不引入任何依赖。

## 3. Bun

```bash
bun targets/bun.mjs
PORT=8080 bun targets/bun.mjs
```

入口 `targets/bun.mjs`：用 `Bun.serve`。

## 4. Deno

```bash
deno run --allow-net --allow-env targets/deno.mjs
```

入口 `targets/deno.mjs`：用 `Deno.serve`。

## 5. Vercel Edge

把入口放到 `api/` 目录（如 `api/gateway.mjs`，`import { handle } from "../js/core.mjs"`），
或按 `vercel.json` 配置路由。Edge Runtime 提供全局 `Request/Response/fetch`。

```bash
vercel deploy
```

## 接入客户端（各运行时一致）

```
OpenAI 兼容:    <base>/v1      （/v1/chat/completions, /v1/models）
Anthropic 兼容: <base>          （/v1/messages, /v1/messages/count_tokens）
```

Claude Code：

```bash
export ANTHROPIC_BASE_URL=<你的地址>
export ANTHROPIC_API_KEY=<api key 或 sk-local>
```

## 测试

核心逻辑对任意运行时相同，用一份 smoke 即可：

```bash
node smoke.mjs     # 或 bun smoke.mjs / deno run smoke.mjs
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `API_MASTER_KEY` | 下游鉴权密钥（建议必设；空/`1` = 无鉴权，仅本地用） |
| `PORT` | 监听端口（Node/Bun/Deno，默认 47832） |

## 说明

- **本地 Rust 网关**（`template/local/`）是独立形态：单二进制、零 Node 依赖，见其 README。
- 需要常驻、跨平台、无 Node 环境 → 选本地 Rust；需要公网/边缘 → 选 JS 的 Cloudflare/Vercel；
  本机快速跑 → 选 JS 的 Node/Bun/Deno。
