# Claude Code 接入指南

Claude Code 用 **Anthropic Messages API**，不是 OpenAI 格式。要让 Claude Code 用你的 2api 网关，
网关需实现以下端点并满足若干细节。

## 必需端点

| 端点 | 说明 | Claude Code 用途 |
|------|------|------------------|
| `POST /v1/messages` | Anthropic 消息（流式/非流式） | 主对话 |
| `POST /v1/messages/count_tokens` | 返回 `{input_tokens:N}` | 发送前预估 token |

`count_tokens` 是 Claude Code 会主动调用的端点，缺了会有兼容问题。返回估算值即可
（无需真实 tokenizer，按 ≈4 字符 1 token）。

## 接入方式

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:47832
export ANTHROPIC_API_KEY=sk-local   # 未配置 api_keys 时随意填
claude
```

## 流式事件序（必须严格）

```
message_start
content_block_start        (index 0, type text)
content_block_delta   × N  (delta.type = text_delta)
content_block_stop
message_delta              (stop_reason = end_turn)
message_stop
```

模板的 `protocol/anthropic_sse.rs`（本地版）与 `anthropicFrames()`（CF 版）已实现。

## 请求体要点

Claude Code 发送的 `/v1/messages` 请求含：

| 字段 | 说明 | 处理 |
|------|------|------|
| `model` | 模型/工具 id | 映射到你的目录 |
| `system` | 系统提示（字符串或数组） | 拼进 prompt 最前 |
| `messages` | `[{role, content}]`，content 可为字符串或 parts 数组 | 抽取纯文本 |
| `max_tokens` | 输出上限 | 多数上游忽略，可透传或忽略 |
| `tools` | 工具定义（数组） | 若上游无工具调用，忽略即可 |
| `stream` | 是否流式 | 分别处理 |

**注意**：Claude Code 会发 `tools`（如读写文件）。若你的上游不支持函数调用，
直接在 prompt 抽取时忽略 `tools` 字段即可 —— Claude Code 会退化为纯文本对话，
仍可用（只是不能驱动工具）。

## 已知限制

| 限制 | 影响 | 缓解 |
|------|------|------|
| 上游无原生流式 | 首字延迟 = 上游响应时间 | 伪流式（拿到完整响应后切块下发） |
| 上游无 tool_calls | Claude Code 工具（编辑文件等）不可用 | 无法缓解，纯对话可用 |
| 上下文长度受上游限制 | 长对话可能截断 | 按上游能力提示用户 |
| 上游限额（如 60/小时/IP） | 高频使用会 429 | 网关转译为明确 429 消息 |

## 验收测试

```bash
# 本地版
curl -sN http://127.0.0.1:47832/v1/messages \
  -H 'content-type: application/json' \
  -d '{"model":"summarize","max_tokens":100,"messages":[{"role":"user","content":"hi"}],"stream":true}'

curl -s http://127.0.0.1:47832/v1/messages/count_tokens \
  -H 'content-type: application/json' \
  -d '{"model":"summarize","messages":[{"role":"user","content":"hello"}]}'
```

期望：前者输出 `event: message_start … event: message_stop`；后者返回 `{"input_tokens":N}`。
