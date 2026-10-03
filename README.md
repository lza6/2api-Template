# 2api-Template

> 把任意站点的免费 AI 服务，快速沉淀为**统一、可维护的 OpenAI / Anthropic 兼容网关**。
> 一套方法论 + 双形态骨架（Cloudflare Worker + 本地 Rust）+ 逆向技能。

## 为什么需要它

`*-2api` 类项目（把 X 站点的免费模型转成 OpenAI 兼容 API）极易陷入混乱：

- 每个上游都是一次从零逆向 —— 契约、签名、会话、限流各写各的
- 单文件越堆越长，CF 版 / 本地版 / Rust 版 / Node 版各自为政
- 模型列表靠手抄，编造不存在的模型 id，`language` 等字段填非法值
- 没有测试，上游一改就崩

本模板把「**一次逆向 → 双形态产出 → 可测可维护**」固化为可复用流程。

## 三层结构

```
2api-Template/
├── AGENTS.md        在此仓库工作时的流程与硬规则（自动加载）
├── docs/            方法论：逆向、验收、架构、Claude Code 接入、生态状态
├── skills/          技能（reverse-2api 逆向 / verify-2api 验证）
├── scripts/         new-2api.mjs 脚手架生成器
├── template/        双形态骨架（复制即用）
│   ├── cloudflare/  Cloudflare Worker 单文件版
│   └── local/       本地 Rust 网关（axum）
└── examples/        成熟案例索引
```

## 快速开始

```bash
# 一条命令生成新项目（默认 CF + 本地双形态）
node scripts/new-2api.mjs mysite-2api

# 或手动：
# 1. 读 docs/QUICKSTART.md —— 5 步从零到可用网关
# 2. 用 skills/reverse-2api/ 逆向上游契约
# 3. 复制 template/cloudflare/ 或 template/local/，填 4 处 [★ PROVIDER]
# 4. 跑测试、对照 docs/INVARIANTS.md 验收
# 5. 接入客户端（Claude Code 见 docs/CLAUDE-CODE.md）
```

详见 [`docs/SCAFFOLD.md`](docs/SCAFFOLD.md)。

## 设计不变量（新网关必须满足）

无论上游是谁，产出的网关都应满足：

| 不变量 | 说明 |
|--------|------|
| **双协议** | 同时提供 `/v1/chat/completions`（OpenAI）与 `/v1/messages`（Anthropic），让 Claude Code / Cursor / 各类 SDK 直接接入 |
| **契约归档** | 上游请求/响应结构写进 `docs/PROTOCOL.md`，附抓包证据；不靠记忆 |
| **目录真实** | 模型/工具 id 来自实测（路由表 / JS / 接口），不手抄、不编造 |
| **伪流式** | 上游非流式时，网关切块 + 定时下发 SSE，模拟打字机 |
| **错误映射** | 上游限额/登录墙/空响应 → 明确 HTTP 状态（429 / 502）+ 可读消息，不透传哨兵文本 |
| **鉴权可选** | 未配置 key 时仅本机放行；配置后强制校验 |
| **测试** | 至少覆盖：非流式/流式、双协议、错误映射、鉴权、未知模型 |
| **零硬编码密钥** | Key 走环境变量 / config.json，不入库 |

## 参考实现

见 [`docs/PROJECTS.md`](docs/PROJECTS.md)（各项目达成度 + 独有能力）与 [`examples/README.md`](examples/README.md)（不同上游形态选型）。

本模板提炼自 [`perfectassistant-2api`](https://github.com/lza6/perfectassistant-2api-cfwork) 的
双形态重构：同一上游协议，CF Worker 与本地 Rust 网关共享，`docs/PROTOCOL.md` 记录逆向证据。

## 开源协议

[MIT](LICENSE)
