//! [★ PROVIDER 3/4] 上游 HTTP 客户端 —— 改成你的上游契约
//!
//! 这是模板中唯一需要按目标站点重写的核心文件。其余（协议转换、路由、面板）通用。
//!
//! 实现要点：
//!  1. 在 `AiRequest` 里定义上游请求体字段（**注意抓包原文的字段名大小写**，如 `chatId`）
//!  2. 在 `AiResponse` 里定义响应结构 + 取值逻辑（`best_text`）
//!  3. 在 `call_free` 里构造请求（端点、头、体）
//!  4. 若上游有额度哨兵，用 `QUOTA_SENTINEL` + `is_quota_gated` 检测

use crate::config::Config;
use anyhow::{anyhow, Context, Result};
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, ORIGIN, REFERER, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// 上游额度/登录墙哨兵：响应含此串表示额度用尽。没有就设为空串。
pub const QUOTA_SENTINEL: &str = "";
pub const DEFAULT_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

// ---------------- [改] 请求体：按抓包原文定义 ----------------
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AiRequest {
    pub text: String,
    pub id: String,
    // 注意字段名大小写：上游若用 camelCase，务必 #[serde(rename = "chatId")]
    #[serde(rename = "chatId", default, skip_serializing_if = "Option::is_none")]
    pub chat_id: Option<String>,
    // 按需增加：tone/language/... 字段
}

// ---------------- [改] 响应体：按上游结构定义 ----------------
#[derive(Debug, Clone, Deserialize, Default)]
pub struct AiResponse {
    #[serde(default)]
    pub response: Option<String>,
    #[serde(default)]
    pub responses: Option<Vec<String>>,
}

impl AiResponse {
    /// [改] 取最终文本：按你的上游结构取值
    pub fn best_text(&self) -> String {
        if let Some(r) = &self.response {
            if !r.trim().is_empty() {
                return r.clone();
            }
        }
        if let Some(list) = &self.responses {
            for r in list {
                if !r.trim().is_empty() {
                    return r.clone();
                }
            }
        }
        String::new()
    }

    /// 命中额度哨兵？
    pub fn is_quota_gated(&self) -> bool {
        if QUOTA_SENTINEL.is_empty() {
            return false;
        }
        let hit = |s: &str| s.contains(QUOTA_SENTINEL);
        self.response.as_deref().map(hit).unwrap_or(false)
            || self.responses.as_ref().map(|l| l.iter().any(|s| hit(s))).unwrap_or(false)
    }
}

#[derive(Debug, Clone)]
pub struct UpstreamClient {
    http: reqwest::Client,
    url: String,
    origin: String,
}

impl UpstreamClient {
    pub fn new(cfg: &Config) -> Result<Self> {
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(cfg.request_timeout_sec))
            .user_agent(DEFAULT_UA)
            .default_headers(default_headers(&cfg.upstream_origin()))
            .build()?;
        Ok(Self {
            http,
            url: cfg.upstream_free_url(),
            origin: cfg.upstream_origin(),
        })
    }

    pub fn origin(&self) -> &str {
        &self.origin
    }

    /// [改] 调用上游并解析。端点/头/体按你的抓包填写。
    pub async fn call_free(&self, req: &AiRequest, referer_id: &str) -> Result<AiResponse> {
        let referer = format!("{}/{}", self.origin, referer_id); // ← 改：按抓包构造 Referer
        let mut headers = HeaderMap::new();
        if let Ok(v) = HeaderValue::from_str(&referer) {
            headers.insert(REFERER, v);
        }
        let resp = self
            .http
            .post(&self.url)
            .headers(headers)
            .json(req) // ← 若上游要 text/plain，改成 .header(CONTENT_TYPE,"text/plain").body(serde_json::to_string(req)?)
            .send()
            .await
            .context("上游请求失败")?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(anyhow!("上游 HTTP {status}: {}", truncate(&text, 300)));
        }
        serde_json::from_str(&text).with_context(|| format!("解析上游响应失败: {}", truncate(&text, 300)))
    }

    /// 健康检查（可换成轻量请求）
    pub async fn check_health(&self) -> Result<()> {
        let req = AiRequest {
            text: "ping".into(),
            id: "default-model".into(),
            chat_id: Some(uuid::Uuid::new_v4().to_string()),
        };
        let r = self.call_free(&req, "default-model").await?;
        if r.best_text().is_empty() {
            return Err(anyhow!("上游健康检查未返回内容"));
        }
        Ok(())
    }
}

fn default_headers(origin: &str) -> HeaderMap {
    let mut h = HeaderMap::new();
    h.insert(USER_AGENT, HeaderValue::from_static(DEFAULT_UA));
    h.insert("accept", HeaderValue::from_static("*/*"));
    h.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    h.insert(
        ORIGIN,
        HeaderValue::from_str(origin).unwrap_or(HeaderValue::from_static("https://example.com")),
    );
    h
}

fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_string()
    } else {
        format!("{}...", s.chars().take(n).collect::<String>())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn best_text_prefers_response() {
        let r = AiResponse { response: Some("a".into()), responses: Some(vec!["b".into()]) };
        assert_eq!(r.best_text(), "a");
    }

    #[test]
    fn best_text_falls_back() {
        let r = AiResponse { response: None, responses: Some(vec!["".into(), "c".into()]) };
        assert_eq!(r.best_text(), "c");
    }

    #[test]
    fn request_field_names_case_sensitive() {
        let req = AiRequest { text: "hi".into(), id: "m".into(), chat_id: Some("x".into()) };
        let v: serde_json::Value = serde_json::to_value(&req).unwrap();
        assert_eq!(v["chatId"], "x");
    }
}
