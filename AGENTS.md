# AGENTS.md · 2api-Template

本仓库是 `*-2api` 项目的统一模板。**在此仓库（或其生成的项目）中工作时，遵循以下流程。**

## 这是什么

把任意站点的免费 AI 服务逆向为 **OpenAI（`/v1/chat/completions`）+ Anthropic（`/v1/messages`）兼容网关**。
两种骨架：**JS 核心**（`template/js/`，一份代码跑 CF / Node / Bun / Deno / Vercel）与**本地 Rust 网关**（`template/local/`）。

## 核心工作流（新 provider）

1. **逆向** → 用 `skills/reverse-2api/`（CDP 抓包 → 定位端点 → **实测**契约 → 采集目录）
2. **归档** → 契约写进 `docs/PROTOCOL.md`（模板见 `docs/PROTOCOL.template.md`）
3. **生成** → `node scripts/new-2api.mjs <名> --both`
4. **填骨架** → 只改 4 处 `[★ PROVIDER]`（config / models / upstream / api）
5. **验证** → 跑测试 + 全量 E2E（`scripts/e2e-all-models.mjs`）→ 结论写 `docs/E2E.md`
6. **验收** → 逐条对照 `docs/INVARIANTS.md`

## 硬规则（违反即返工）

- **不编造**：模型 id / 字段名 / 枚举值必须来自实测或抓包原文（大小写敏感，如 `chatId`）
- **证据驱动**：契约结论必附抓包文件或实测输出；「可用」必须有真实调用证据
- **限流靠文本**：不少上游限流返回 200 + 文本哨兵，不能只看状态码
- **付费红线**：不发起真实付费请求；用 mock 覆盖 success/timeout/rate_limit/error
- **双协议 + count_tokens**：`/v1/messages` 与 `/v1/messages/count_tokens` 是 Claude Code 兼容的必需项
- **可测**：mock 上游的测试不依赖外网
- **零硬编码密钥**

## 关键文件

| 文件 | 用途 |
|------|------|
| `docs/QUICKSTART.md` | 5 步流程（先读） |
| `docs/INVARIANTS.md` | 验收清单 |
| `docs/ARCHITECTURE.md` | 分层与设计 |
| `docs/CLAUDE-CODE.md` | Claude Code 接入细节 |
| `docs/SCAFFOLD.md` | 脚手架用法 |
| `skills/reverse-2api/SKILL.md` | 逆向技能 |
| `examples/README.md` | 参考实现（不同上游形态） |

## 已有参考实现

见 `examples/README.md`。不同上游形态（匿名 / Cookie / 代理池 / 生成类）对应不同参考。
