# 脚手架：一条命令生成新 2api 项目

`scripts/new-2api.mjs` 从模板生成一个新项目骨架。

## 用法

```bash
# 同时生成 CF + 本地两种形态（默认）
node scripts/new-2api.mjs mysite-2api

# 只生成本地 Rust 版
node scripts/new-2api.mjs mysite-2api --local

# 只生成 Cloudflare 版
node scripts/new-2api.mjs mysite-2api --cf

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
├── cloudflare/            （--cf / 默认）
│   ├── worker.js          双协议骨架
│   ├── smoke.mjs          冒烟测试
│   ├── wrangler.toml
│   └── scripts/e2e-all-models.mjs
└── local/                 （--local / 默认）
    ├── Cargo.toml         crate 名自动转换（mysite-2api → mysite2api）
    ├── src/ 4 处 [★ PROVIDER]
    └── tests/gateway.rs
```

## 自动替换

- `my-2api` → 你的项目名
- `my2api` → 你的 crate 名（去除非字母数字）

Cargo.lock 不复制（首次 `cargo build` 生成）。

## 生成后

1. 逆向目标站点，把契约写进 `docs/PROTOCOL.md`（见 `docs/QUICKSTART.md`）
2. 改 4 处 `[★ PROVIDER]`
3. 跑测试：`cd local && cargo test` / `cd cloudflare && node smoke.mjs`
4. 全量 E2E：`node cloudflare/scripts/e2e-all-models.mjs`
5. 逐条对照 `docs/INVARIANTS.md` 验收

## 验证

生成器本身已在 CI 方式下验证：`new-2api.mjs demo-2api --both` 生成的项目
`cargo test` 24 项全过、`node smoke.mjs` 14 项全过。
