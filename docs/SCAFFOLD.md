# 脚手架：一条命令生成新 2api 项目

`scripts/new-2api.mjs` 从模板生成一个新项目骨架。

## 用法

```bash
# 同时生成 JS + 本地 Rust 两种形态（默认）
node scripts/new-2api.mjs mysite-2api

# 只生成 JS（Cloudflare / Node / Bun / Deno / Vercel）
node scripts/new-2api.mjs mysite-2api --js

# 只生成本地 Rust 版
node scripts/new-2api.mjs mysite-2api --local

# 指定目标目录
node scripts/new-2api.mjs mysite-2api ../mysite-2api --both
```

## 生成内容

```
mysite-2api/
├── README.md              下一步清单
├── .gitignore
├── docs/
│   └── PROTOCOL.md        契约归档模板（待填）
├── js/                    （--js / 默认）一份核心，多运行时
│   ├── core.mjs           双协议骨架（改这里的 [★ PROVIDER]）
│   ├── targets/           cloudflare.mjs / node.mjs / bun.mjs / deno.mjs / vercel.mjs
│   ├── smoke.mjs          冒烟测试
│   ├── wrangler.toml
│   └── scripts/e2e-all-models.mjs
└── local/                 （--local / 默认）Rust 网关
    ├── Cargo.toml         crate 名自动转换（mysite-2api → mysite2api）
    ├── src/ 4 处 [★ PROVIDER]
    └── tests/gateway.rs
```

## 自动替换

- `my-2api` / `my-2api-js` → 你的项目名
- `my2api` → 你的 crate 名（去除非字母数字）

Cargo.lock 不复制（首次 `cargo build` 生成）。

## 生成后

1. 逆向目标站点，把契约写进 `docs/PROTOCOL.md`（见 `docs/QUICKSTART.md`）
2. 改 `[★ PROVIDER]`：JS 版在 `js/core.mjs`；Rust 版在 `local/src/{config,models,upstream,api}.rs`
3. 跑测试：`cd js && node smoke.mjs` / `cd local && cargo test`
4. 全量 E2E：`node js/scripts/e2e-all-models.mjs`
5. 逐条对照 `docs/INVARIANTS.md` 验收
6. 选运行时跑/部署：见 `docs/DEPLOY.md`

## 验证

生成器本身已验证：`new-2api.mjs demo-2api --both` 生成的项目
`node js/smoke.mjs` 14 项、`cargo test` 24 项全过。
