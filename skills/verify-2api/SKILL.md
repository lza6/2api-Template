---
name: verify-2api
description: 验证一个 2api 网关是否达标并给出证据。用于「测一下这个 2api 能不能用」「哪些模型真的可用」「验收这个网关」这类任务。产出：真实 E2E 报告 + 逐条 INVARIANTS 验收结果。
---

# verify-2api

对某个 2api 网关做**证据驱动**的验证，产出可审计结论。不靠「看起来对」，靠实际运行。

## 何时使用

- 用户问「这个 2api 到底能不能用 / 哪些模型可用」
- 新 provider 合并前的验收
- 怀疑某个网关「声称支持但实际不通」时

## 流程

### 1. 单元/集成测试（不触网）

```bash
# Rust 网关
cd <项目> && cargo test
# Node/Bun 网关
bun test test/unit   # 或 package.json 的 test 脚本
# CF Worker
node <smoke 脚本>
```

要求：**全部通过**。若有失败，先判定是「预先存在」还是「本次引入」——用 `git stash` 对比。

### 2. 全量模型真实 E2E（触网，关键）

对**每一个**模型/工具 id 发**真实**请求，产出「哪些真可用 / 哪些失败及原因」：

```bash
node scripts/e2e-all-models.mjs        # 见模板 template/cloudflare/scripts/
```

判定要点：
- **限额 ≠ 故障**：上游限流返回的哨兵文本要识别出来，单独归类（如「60 次/小时/IP」）
- **时序**：记录每个 id 的耗时，标出异常慢的（影响超时配置）
- **证据**：保留原始响应片段

⚠️ 全量跑可能耗尽上游额度；如实记录，不要为此删减样本。

### 3. 客户端侧合规（Claude Code）

```bash
# 非流式
curl -s <base>/v1/messages -H 'content-type: application/json' \
  -d '{"model":"<id>","max_tokens":50,"messages":[{"role":"user","content":"hi"}]}'
# 流式（检查事件序）
curl -sN <base>/v1/messages -H 'content-type: application/json' \
  -d '{"model":"<id>","max_tokens":50,"messages":[{"role":"user","content":"hi"}],"stream":true}'
# count_tokens
curl -s <base>/v1/messages/count_tokens -H 'content-type: application/json' \
  -d '{"model":"<id>","messages":[{"role":"user","content":"hi"}]}'
```

期望：流式输出完整事件序（`message_start`→…→`message_stop`）；count_tokens 返回 `{input_tokens:N}`。

### 4. 错误路径

用 mock 上游（不要真触发）验证：
- 限额哨兵 → `429`（且不透传哨兵文本）
- 空响应 → `502`
- 空 messages → `400`
- 鉴权：配置 key 后无 key → `401`，带 key → `200`

### 5. 逐条 INVARIANTS

打开 `docs/INVARIANTS.md`，逐条打勾，附证据（命令 + 输出）。

## 产出格式

```markdown
# 验证报告 · <项目> · <日期>

## 结论
- 达标 / 部分达标 / 不达标

## 测试
- cargo test: N 通过 / M 失败
- 全量 E2E: X / Y 可用（Z 为限流，W 为失败）

## 逐条 INVARIANTS
| 项 | 结果 | 证据 |
|----|------|------|
| ... | ✅/❌ | 命令/输出 |

## 风险与未验证项
- ...
```

## 硬规则

1. **未实际运行 ≠ 通过**：每条「通过」附真实命令与输出。
2. **区分「已验证 / 合理推断 / 待验证」**：限流而没测到的模型属「合理推断可用」，不写「已验证」。
3. **限额要识别为限额**，不误报为坏 id。
4. **不删减样本**为让结果好看。
