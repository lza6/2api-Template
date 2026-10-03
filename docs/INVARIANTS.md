# 设计不变量（新网关验收清单）

任何 `*-2api` 网关合并前应逐条满足。每项都是可验证的行为，不是风格偏好。

## 1. 协议

- [ ] `POST /v1/chat/completions` 支持 `stream: true/false`，帧符合 OpenAI SSE 规范
- [ ] `POST /v1/messages` 支持 `stream: true/false`，事件序符合 Anthropic 规范
      （`message_start` → `content_block_start` → `content_block_delta*` → `content_block_stop` → `message_delta` → `message_stop`）
- [ ] `POST /v1/messages/count_tokens` 返回 `{input_tokens:N}`（Claude Code 会调用，见 [`CLAUDE-CODE.md`](CLAUDE-CODE.md)）
- [ ] `GET /v1/models` 返回真实目录
- [ ] `GET /healthz` 返回服务状态
- [ ] 流式响应 `Content-Type: text/event-stream; charset=utf-8`，`Cache-Control: no-cache`

## 2. 契约

- [ ] `docs/PROTOCOL.md` 存在，含端点、方法、头、请求体、响应结构、认证、限额
- [ ] 每条契约有证据（抓包文件 / 实测命令与输出），不靠记忆
- [ ] 请求字段名与上游一致（大小写敏感，如 `chatId`）
- [ ] 枚举值（语言/语气等）来自上游真实取值

## 3. 目录

- [ ] 模型/工具 id 来自实测（路由表 / JS / 接口）
- [ ] 每个 id 至少抽查过一次真实调用
- [ ] 无编造 id；展示名与 id 分离
- [ ] **全量 E2E 报告**存在，明确列出「哪些真可用/哪些失败」及原因（限额 vs 坏 id）
      （起手：`template/cloudflare/scripts/e2e-all-models.mjs`）

## 4. 错误处理

- [ ] 上游限额/登录墙哨兵 → `429 rate_limit_error`（不透传哨兵文本）
- [ ] **限流检测基于响应文本**（不少上游 200 + 文本哨兵，状态码不可靠）
- [ ] 上游空响应 → `502 upstream_error`
- [ ] 上游非 2xx → 映射为 `502`
- [ ] 空 `messages` → `400 invalid_request`
- [ ] 错误体符合对应协议（OpenAI `{error:{...}}` / Anthropic `{type:"error",...}`）
- [ ] 流式中的错误以尾帧表达，不中途断连

## 5. 安全

- [ ] 无硬编码密钥；Key 走环境变量 / config
- [ ] 未配置 key 时仅本机放行；配置后强制校验（`Authorization: Bearer` 与 `x-api-key` 均支持）
- [ ] CORS 默认关闭，按需白名单（不用 `*` 除非确有必要）
- [ ] 日志不泄露上游/下游密钥

## 6. 测试

- [ ] 非流式 + 流式各有测试
- [ ] 双协议各有测试
- [ ] 错误映射（429 / 502 / 400）有测试
- [ ] 鉴权（无 key 401 / 有 key 200）有测试
- [ ] 未知模型透传或回退有测试
- [ ] 测试用 mock 上游，**不依赖外网**（真实上游仅作发布前冒烟）

## 7. 工程

- [ ] 文件内聚（< 800 行/文件），按功能分模块
- [ ] 不可变更新，错误显式处理，边界输入校验
- [ ] README 含：编译/运行、接入示例、配置表、测试命令
- [ ] `.gitignore` 排除构建产物、抓取产物、真实 config

## 8. 双形态一致性（若同时提供 CF + 本地）

- [ ] 两者共享同一份 `docs/PROTOCOL.md`
- [ ] 模型目录内容一致
- [ ] 行为一致（同一请求在两种形态下语义相同）
