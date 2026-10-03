# 快速开始：5 步从零到可用网关

以「把某站点的免费 AI 服务转成 OpenAI/Anthropic 兼容 API」为目标。

---

## 第 1 步 · 侦察上游

打开目标站点，确认「免费、免登录」的对话端点。两种常见情况：

- **前端直连 API**：F12 → Network，发一条消息，找到 POST 请求
- **服务端转发**：前端调自己的后端，后端再调模型（需要看 JS 找真实端点）

工具：`skills/reverse-2api/`（基于 CDP 抓取）。抓取命令：

```bash
node <GetSourceCode>/test/run-capture.js "https://目标站点/对话页" ./captures/target
```

**产出**：`source/`（JS）、`network.har`（网络包）、`page.html`。

---

## 第 2 步 · 提取契约

在抓到的 JS 里搜索调用点（`fetch(`、`/api/`、端点路径），确认：

| 要确认的东西 | 怎么确认 |
|--------------|----------|
| 端点 URL | HAR 里的请求，或 JS 里 `fetch("...")` 的字符串 |
| 请求方法 / 头 | HAR 的 `request.headers`（Origin/Referer/UA 常被校验） |
| 请求体字段 | JS 里 `JSON.stringify({...})` 的对象；HAR 的 `postData.text` |
| 响应结构 | HAR 的 `response.content.text`，或 JS 里对响应的 `.json()` 后取值 |
| 认证 | 是否需 Cookie / API Key / 签名 |
| 限额/风控 | 429、注册墙哨兵字符串、验证码 |

**关键**：用一次真实请求验证契约（curl / node fetch），别只读 JS 猜。

```bash
node -e '
fetch("https://目标/端点",{method:"POST",headers:{...},body:JSON.stringify({...})})
  .then(r=>r.text()).then(t=>console.log(t.slice(0,400)))'
```

把这些全部写进 `docs/PROTOCOL.md`（见 [`PROTOCOL.template.md`](PROTOCOL.template.md)）。**这是最重要的一步。**

---

## 第 3 步 · 采集模型/工具目录

如果上游有多个模型/工具（不同 id → 不同提示词模板）：

- 找目录接口（如 `__manifest`、`/models`、`/api/catalog`）
- 或在首页 JS chunk 里搜模型 id 数组
- **逐个抽查**：用真实请求验证 id 有效（返回符合预期的内容）

**禁忌**：不要手抄模型名当 id，不要编造。旧项目常犯的错就是把展示名 `social media post` 当成 id `social-media-post`，而真实 id 是 `social-media-post-ideas`。

---

## 第 4 步 · 选形态，填 provider

| 需求 | 选 | 复制 |
|------|-----|------|
| 公网一键部署、零运维 | Cloudflare Worker | `template/cloudflare/worker.js` |
| 本机 `127.0.0.1`、单二进制 | Rust 网关 | `template/local/` |

在骨架里改 3 处：

1. **上游适配**：`upstream.js` / `src/upstream.rs` —— 端点、头、请求体构造、响应解析
2. **模型目录**：`models.js` / `src/models.rs` —— 第 3 步采集的 id
3. **配置**：`config.example.json` / `wrangler.toml`

协议转换（OpenAI/Anthropic、伪流式、错误映射）骨架已实现，通常**不用改**。

---

## 第 5 步 · 测试与接入

```bash
# Cloudflare 版
npm test                    # mock 上游冒烟

# 本地版
cd local && cargo test      # 单元 + 集成
```

对着 [`INVARIANTS.md`](INVARIANTS.md) 逐条勾选。然后：

**OpenAI 客户端**

```
Base URL: http://127.0.0.1:4783x/v1
API Key:  sk-local
```

**Claude Code**

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:4783x
export ANTHROPIC_API_KEY=sk-local
```

---

## 常见坑

| 坑 | 症状 | 解 |
|----|------|-----|
| 字段名 camelCase | 传 `chat_id` 上游收不到 | 按抓包原样：`chatId` |
| 非法枚举值 | `language:"chinese"` 上游忽略/报错 | 抄上游枚举列表 |
| 模型 id 编造 | 返回奇怪/默认结果 | 用真实 id（第 3 步实测） |
| Origin/Referer 缺失 | 403 / 挑战 | 按抓包补齐头 |
| 限额哨兵当正文 | 用户看到「请注册」 | 检测哨兵 → 返回 429 |
| 无流式却声称流式 | 客户端逐字但首字很慢 | 伪流式：拿到完整响应再切块下发 |
