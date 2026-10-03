# 本地 Rust 网关骨架

把任意站点的免费 AI 服务转成 OpenAI/Anthropic 兼容的**本地单二进制网关**。
协议引擎已就绪，只需填 4 处 `[★ PROVIDER]`。

## 快速开始

```bash
# 1. 编译
cargo build --release          # 或 build.bat

# 2. 配置
cp config.example.json config.json   # 改上游地址与模型 id

# 3. 运行
./target/release/my2api --config config.json
```

默认监听 `http://127.0.0.1:47832`，面板 <http://127.0.0.1:47832/>。

## 要改的 4 处

| 文件 | 标记 | 改什么 |
|------|------|--------|
| `src/config.rs` | `[★ PROVIDER 1/4]` | 上游 base url、免费端点路径、默认模型 |
| `src/models.rs` | `[★ PROVIDER 2/4]` | 真实模型/工具 id 目录 |
| `src/upstream.rs` | `[★ PROVIDER 3/4]` | 请求体字段、响应解析、端点/头 |
| `src/api.rs` | `[★ PROVIDER]` | `call_upstream` 字段补全、`resolve_model` 策略 |

其余（`protocol/`、路由、鉴权、CORS、面板）通用，通常不用动。

## 模块职责

| 文件 | 职责 | 是否需改 |
|------|------|----------|
| `main.rs` | 入口：装配 state、启动 axum | 否 |
| `config.rs` | config.json + 环境变量 | ★ |
| `models.rs` | 模型目录 | ★ |
| `upstream.rs` | 上游客户端 + 契约解析 | ★ |
| `api.rs` | 路由、鉴权、请求/响应桥接 | 部分 |
| `protocol/openai_sse.rs` | OpenAI 非流式 + 伪流式 SSE | 否 |
| `protocol/anthropic_sse.rs` | Anthropic 非流式 + 伪流式 SSE | 否 |
| `web.rs` | 控制面板 | 否 |
| `errors.rs` | OpenAI/Anthropic 兼容错误 | 否 |

## 测试

```bash
cargo test    # 23 项：单元 + 集成（mock 上游，不触网）
```

## 接入客户端

**OpenAI SDK / Cursor / Continue**

```
Base URL: http://127.0.0.1:47832/v1
API Key:  sk-local
```

**Claude Code**

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:47832
export ANTHROPIC_API_KEY=sk-local
```

配置依据见 `../docs/QUICKSTART.md`；验收清单见 `../docs/INVARIANTS.md`。
