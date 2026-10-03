---
name: reverse-2api
description: 把一个站点的免费 AI 服务逆向为 OpenAI/Anthropic 兼容网关。用于「把 X 站做成 2api」「逆向某站的对话接口」「新增一个 2api provider」这类任务。产出：上游协议笔记 + 可运行的 CF Worker / 本地网关骨架。
---

# reverse-2api

将目标站点的免费 AI 服务（对话 / 生成）逆向为统一的 OpenAI + Anthropic 兼容网关。

## 何时使用

- 用户要「把 <站点> 做成 2api」「逆向 <站点> 的对话接口」
- 用户要在 `2api-Template` 基础上新增一个 provider
- 用户遇到某个 2api 项目「模型列表不对 / 请求 400 / 返回奇怪内容」需要重查契约

## 流程（严格按序）

### 1. 侦察（不写代码）

用 CDP 抓取工具抓目标站点的对话页与网络包：

```bash
node <GetSourceCode>/test/run-capture.js "https://<站点>/<对话页>" ./captures/<name>
```

若对话由 iframe / 独立路由承载，抓**那个**页面（例如 `/<站点>/iframe/<tool>`）。

**产出**：`source/`（JS）、`network.har`、`page.html`。先读 HAR 与 JS，别急着写代码。

### 2. 定位真实端点与调用代码

在抓到的 JS 里搜索：`fetch(`、`axios`、`/api/`、端点路径字符串。
优先找「发消息」触发的那个调用点。确认：

- 端点 URL、方法、请求头（Origin / Referer / UA 常被校验）
- 请求体字段（`JSON.stringify({...})` 的完整对象）
- 响应结构与取值路径

### 3. 实测验证契约（**强制**）

用一次真实请求确认，不要只读代码猜：

```bash
node -e '
fetch("<端点>", { method:"POST",
  headers:{ "Content-Type":"...", "Origin":"...", "Referer":"...", "User-Agent":"..." },
  body: JSON.stringify({ ... }) })
 .then(r=>r.text()).then(t=>console.log(r.status, t.slice(0,500)))'
```

**免费端点可做最小单次调用**（1 次）。付费端点：改用 mock，不发起真实付费请求。

### 4. 采集模型/工具目录

- 找目录接口（`__manifest`、`/models`、`/api/catalog`、首页 JS chunk 里的 id 数组）
- **逐个抽查** id 有效（返回符合预期的内容）
- 记录分类与展示名（展示名可由 id 派生）

### 5. 归档协议

把 1–4 的结果写进项目的 `docs/PROTOCOL.md`（用模板 `docs/PROTOCOL.template.md`）。
**这一步不可跳过** —— 它是后续维护与 CF/本地双形态的共同依据。

### 6. 填骨架

- 选形态：公网 → `template/cloudflare/`；本地 → `template/local/`
- 改 3 处：上游适配、模型目录、配置
- 协议转换与错误映射骨架已就绪，通常不用改

### 7. 测试

```bash
npm test              # CF 版
cd local && cargo test # 本地版
```

对照 `docs/INVARIANTS.md` 逐条验收。发布前可对真实上游做 1–2 次冒烟。

## 硬规则

1. **不编造**：模型 id、字段名、枚举值必须来自实测或抓包原文。
2. **证据驱动**：每个契约结论附抓包文件或实测输出。
3. **付费红线**：不发起真实付费请求；用 mock 覆盖 success/timeout/rate_limit/error。
4. **限额哨兵**：若上游用哨兵字符串表示额度用尽，检测它并转 `429`，别透传。
5. **零硬编码密钥**。
6. **可测**：mock 上游的测试不依赖外网。

## 常见错误（务必避免）

| 错误 | 正确做法 |
|------|----------|
| 用展示名当 id（`social-media-post`） | 用真实 id（`social-media-post-ideas`） |
| 字段用 snake_case（`chat_id`） | 照抓包：`chatId` |
| 枚举填非法值（`language:"chinese"`） | 抄上游枚举列表 |
| 只读 JS 不实测 | 发 1 次真实请求确认 |
| 手抄模型列表 | 从目录接口 / JS 提取 |
| 限额文本当正文 | 检测哨兵 → 429 |
