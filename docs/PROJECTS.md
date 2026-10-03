# 生态项目状态

记录 `*-2api` 家族各项目相对模板要求的达成度。**此类状态需随每次对齐更新。**

更新：2026-10-03。

## 达成度

| 要求 | perfectassistant | tokenharbor | tryingopen | creen |
|------|:---:|:---:|:---:|:---:|
| 形态 | CF + Rust | Rust | Rust | Node/Bun |
| `POST /v1/chat/completions` | ✅ | ✅ | ✅ | ✅ |
| `POST /v1/messages`（Anthropic） | ✅ | ✅ | ✅ | ➖ 非适用¹ |
| `POST /v1/messages/count_tokens` | ✅ | ✅ | ✅ | ➖ 非适用¹ |
| `docs/PROTOCOL.md`（上游契约） | ✅ | ✅ | ✅ | ✅ |
| 测试 | ✅ 27+28 | ✅ 27 | ✅ 70 | ✅ 59 |
| 契约归档 + 实测证据 | ✅ | ✅ | ✅ | ✅ |

¹ **creen 是图像/视频生成网关**（上游无文本 LLM），`/v1/messages` 不适用。
其形态（`/v1/images/generations` + 任务轮询）是模板的**扩展方向**，非缺陷。

## 结论

- 文本型网关（perfectassistant / tokenharbor / tryingopen）**均已满足**双协议 + count_tokens。
- count_tokens 端点于 2026-10-03 统一补齐（此前三者皆缺）。
- tokenharbor 的 `free_window_now_available` 时间炸弹测试已修复（改用时间注入）。

## 各项目独有能力（模板未来可吸收）

| 项目 | 独有能力 |
|------|----------|
| tokenharbor | Cookie 登录、refresh_token 链式续期、凭证池、分层并发 |
| tryingopen | 代理池轮换、健康分 EWMA、429 换出口 |
| creen | 异步任务（提交→轮询→下载）、账号择优选号、图像/视频端点 |
