//! [★ PROVIDER 1/4] 配置解析（config.json + 环境变量覆盖）
//!
//! 改成你的上游：base url、免费端点路径、默认模型。

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    /// 项目标识（用于 /v1/models 的 owned_by）
    #[serde(default = "default_slug")]
    pub slug: String,
    /// 监听地址
    #[serde(default = "default_listen")]
    pub listen_addr: String,
    /// [改] 上游 base（Origin 由此派生）
    #[serde(default = "default_upstream")]
    pub upstream_base_url: String,
    /// [改] 上游免费端点路径
    #[serde(default = "default_free_path")]
    pub upstream_free_path: String,
    /// 下游 API Key（配置后客户端必须带；空 = 仅本机放行）
    #[serde(default)]
    pub api_keys: Vec<String>,
    /// [改] 默认模型 id
    #[serde(default = "default_model")]
    pub default_model: String,
    /// 伪流式分块字符数
    #[serde(default = "default_chunk")]
    pub pseudo_chunk_chars: usize,
    /// 伪流式分块间隔（毫秒）
    #[serde(default = "default_delay")]
    pub pseudo_chunk_delay_ms: u64,
    /// 上游请求超时（秒）
    #[serde(default = "default_timeout")]
    pub request_timeout_sec: u64,
    /// CORS 允许来源（空 = 关闭；"*" 或具体 origin）
    #[serde(default)]
    pub cors_allow_origins: Vec<String>,
    /// 跳过启动时上游健康检查
    #[serde(default = "default_true")]
    pub skip_upstream_check: bool,
    /// 未知模型是否透传上游（否则回退默认）
    #[serde(default = "default_true")]
    pub pass_through_unknown_models: bool,
}

fn default_slug() -> String { "my-2api".into() }
fn default_listen() -> String { "127.0.0.1:47832".into() }
fn default_upstream() -> String { "https://example.com".into() }
fn default_free_path() -> String { "/api/chat".into() }
fn default_model() -> String { "default-model".into() }
fn default_chunk() -> usize { 120 }
fn default_delay() -> u64 { 0 }
fn default_timeout() -> u64 { 120 }
fn default_true() -> bool { true }

impl Default for Config {
    fn default() -> Self {
        Self {
            slug: default_slug(),
            listen_addr: default_listen(),
            upstream_base_url: default_upstream(),
            upstream_free_path: default_free_path(),
            api_keys: vec![],
            default_model: default_model(),
            pseudo_chunk_chars: default_chunk(),
            pseudo_chunk_delay_ms: default_delay(),
            request_timeout_sec: default_timeout(),
            cors_allow_origins: vec![],
            skip_upstream_check: default_true(),
            pass_through_unknown_models: default_true(),
        }
    }
}

impl Config {
    pub fn load(path: Option<&std::path::Path>) -> Result<Self> {
        let mut cfg: Config = match path {
            Some(p) if p.exists() => {
                let raw = std::fs::read_to_string(p)
                    .with_context(|| format!("读取配置文件失败: {}", p.display()))?;
                serde_json::from_str(&raw).with_context(|| format!("解析配置文件失败: {}", p.display()))?
            }
            _ => Config::default(),
        };
        if let Ok(v) = std::env::var("LISTEN_ADDR") { cfg.listen_addr = v; }
        if let Ok(v) = std::env::var("UPSTREAM_BASE_URL") { cfg.upstream_base_url = v; }
        if let Ok(v) = std::env::var("API_KEYS") { cfg.api_keys = split_csv(&v); }
        if let Ok(v) = std::env::var("CORS_ALLOW_ORIGINS") { cfg.cors_allow_origins = split_csv(&v); }
        if let Ok(v) = std::env::var("DEFAULT_MODEL") { cfg.default_model = v; }
        Ok(cfg)
    }

    pub fn resolve_config_path() -> Option<PathBuf> {
        let local = PathBuf::from("config.json");
        if local.exists() {
            return Some(local);
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                let cand = dir.join("config.json");
                if cand.exists() {
                    return Some(cand);
                }
            }
        }
        None
    }

    pub fn slug(&self) -> &str { &self.slug }
    pub fn upstream_origin(&self) -> String { self.upstream_base_url.trim_end_matches('/').to_string() }
    pub fn upstream_free_url(&self) -> String { format!("{}{}", self.upstream_origin(), self.upstream_free_path) }
}

fn split_csv(v: &str) -> Vec<String> {
    v.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()
}
