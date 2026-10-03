# 参考实现

本模板从以下真实项目中提炼。它们覆盖了不同的上游形态，可作为选型参考。

| 项目 | 形态 | 上游类型 | 关键能力 | 可借鉴点 |
|------|------|----------|----------|----------|
| [perfectassistant-2api](https://github.com/lza6/perfectassistant-2api-cfwork) | **CF + Rust** | 匿名免费端点 | 伪流式、62 工具目录 | **本模板母本**：双形态、契约归档、双协议 |
| [TokenHarbor-2api](https://github.com/lza6/TokenHarbor-2api) | Rust | Cookie 登录 | 自动续期、凭证池、分层并发 | 登录态管理、refresh_token 链式续期 |
| [Tryingopen-2api](https://github.com/lza6/Tryingopen-2api) | Rust | 匿名 + IP 限流 | 代理池轮换、429 换出口 | 代理池、健康分 EWMA、指数退避 |
| [creen-2api](https://github.com/lza6/creen-2api) | Node | 匿名 + 账号池 | 图像/视频生成、任务轮询 | 异步任务（提交→轮询→下载）、账号择优选号 |

## 选型建议

| 你的上游是… | 参考 | 模板 |
|-------------|------|------|
| 匿名免费、非流式、多工具 | perfectassistant | `template/` 直接可用 |
| 需要 Cookie / 登录态 | TokenHarbor | `template/local` + 加凭证池模块 |
| 按 IP 限流 | Tryingopen | `template/local` + 加代理池模块 |
| 图像/视频生成、异步任务 | creen | 需扩展：新增 `/v1/images/generations` + 轮询 |

## 本模板验证过的测试

- `template/js/`：`node smoke.mjs` → 13 项
- `template/local/`：`cargo test` → 23 项
- 母本 `perfectassistant-2api`：CF 冒烟 26 项 + Rust 27 项，并经真实上游端到端验证
