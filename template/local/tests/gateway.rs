//! 集成测试：本地 mock 上游 + 真实路由（不触网）。
//! 覆盖：非流式/流式、双协议、错误映射、鉴权、未知模型。

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::response::IntoResponse;
use axum::routing::post;
use axum::Router;
use http_body_util::BodyExt;
use my2api::api::{build_router, AppState};
use my2api::config::Config;
use my2api::models::ModelRegistry;
use my2api::upstream::UpstreamClient;
use std::sync::Arc;
use tower::ServiceExt;

async fn spawn_mock(mode: &'static str) -> String {
    let app = Router::new().route(
        "/api/chat",
        post(move || async move {
            let body = match mode {
                "empty" => serde_json::json!({ "response": "", "responses": [] }),
                _ => serde_json::json!({ "response": "hello from mock", "responses": ["hello from mock"] }),
            };
            axum::Json(body).into_response()
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.ok(); });
    format!("http://127.0.0.1:{}", addr.port())
}

async fn make_app(mode: &'static str) -> (Router, Arc<std::sync::RwLock<Vec<String>>>) {
    let url = spawn_mock(mode).await;
    let mut cfg = Config::default();
    cfg.upstream_base_url = url;
    cfg.upstream_free_path = "/api/chat".into();
    cfg.skip_upstream_check = true;
    cfg.pseudo_chunk_delay_ms = 0;
    cfg.default_model = "default-model".into();
    let upstream = Arc::new(UpstreamClient::new(&cfg).unwrap());
    let registry = Arc::new(ModelRegistry::new(&cfg.default_model));
    let api_keys = Arc::new(std::sync::RwLock::new(Vec::<String>::new()));
    (build_router(AppState { cfg: Arc::new(cfg), upstream, registry, api_keys: api_keys.clone() }), api_keys)
}

async fn body_string(resp: axum::response::Response) -> String {
    String::from_utf8_lossy(&resp.into_body().collect().await.unwrap().to_bytes()).to_string()
}

fn post_json(uri: &str, body: serde_json::Value) -> Request<Body> {
    Request::builder().method("POST").uri(uri)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string())).unwrap()
}

#[tokio::test]
async fn count_tokens_ok() {
    let (app, _) = make_app("ok").await;
    let r = app.oneshot(post_json("/v1/messages/count_tokens",
        serde_json::json!({ "model": "default-model", "messages": [{ "role": "user", "content": "hello there count my tokens" }] }))).await.unwrap();
    assert_eq!(r.status(), StatusCode::OK);
    let v: serde_json::Value = serde_json::from_str(&body_string(r).await).unwrap();
    assert!(v["input_tokens"].as_u64().unwrap() > 0);
}

#[tokio::test]
async fn healthz_ok() {
    let (app, _) = make_app("ok").await;
    let r = app.oneshot(Request::builder().uri("/healthz").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(r.status(), StatusCode::OK);
    let v: serde_json::Value = serde_json::from_str(&body_string(r).await).unwrap();
    assert_eq!(v["status"], "ok");
}

#[tokio::test]
async fn models_nonempty() {
    let (app, _) = make_app("ok").await;
    let r = app.oneshot(Request::builder().uri("/v1/models").body(Body::empty()).unwrap()).await.unwrap();
    let v: serde_json::Value = serde_json::from_str(&body_string(r).await).unwrap();
    assert!(v["data"].as_array().unwrap().len() >= 1);
}

#[tokio::test]
async fn openai_nonstream_ok() {
    let (app, _) = make_app("ok").await;
    let r = app.oneshot(post_json("/v1/chat/completions",
        serde_json::json!({ "model": "default-model", "messages": [{ "role": "user", "content": "hi" }] }))).await.unwrap();
    assert_eq!(r.status(), StatusCode::OK);
    let v: serde_json::Value = serde_json::from_str(&body_string(r).await).unwrap();
    assert_eq!(v["choices"][0]["message"]["content"], "hello from mock");
}

#[tokio::test]
async fn openai_stream_frame_order() {
    let (app, _) = make_app("ok").await;
    let r = app.oneshot(post_json("/v1/chat/completions",
        serde_json::json!({ "model": "default-model", "messages": [{ "role": "user", "content": "hi" }], "stream": true }))).await.unwrap();
    assert_eq!(r.headers().get("content-type").unwrap(), "text/event-stream; charset=utf-8");
    let s = body_string(r).await;
    assert!(s.contains("\"role\":\"assistant\""));
    assert!(s.trim_end().ends_with("[DONE]"));
    let rebuilt: String = s.lines().filter_map(|l| l.strip_prefix("data: "))
        .filter(|d| *d != "[DONE]")
        .filter_map(|d| serde_json::from_str::<serde_json::Value>(d).ok())
        .filter_map(|j| j["choices"][0]["delta"]["content"].as_str().map(String::from))
        .collect();
    assert_eq!(rebuilt, "hello from mock");
}

#[tokio::test]
async fn anthropic_nonstream_ok() {
    let (app, _) = make_app("ok").await;
    let r = app.oneshot(post_json("/v1/messages",
        serde_json::json!({ "model": "default-model", "max_tokens": 50, "messages": [{ "role": "user", "content": "hi" }] }))).await.unwrap();
    let v: serde_json::Value = serde_json::from_str(&body_string(r).await).unwrap();
    assert_eq!(v["type"], "message");
    assert_eq!(v["content"][0]["text"], "hello from mock");
}

#[tokio::test]
async fn anthropic_stream_event_sequence() {
    let (app, _) = make_app("ok").await;
    let r = app.oneshot(post_json("/v1/messages",
        serde_json::json!({ "model": "default-model", "max_tokens": 50, "messages": [{ "role": "user", "content": "hi" }], "stream": true }))).await.unwrap();
    let s = body_string(r).await;
    assert!(s.contains("event: message_start"));
    assert!(s.contains("event: content_block_delta"));
    assert!(s.contains("event: message_stop"));
}

#[tokio::test]
async fn empty_upstream_502() {
    let (app, _) = make_app("empty").await;
    let r = app.oneshot(post_json("/v1/chat/completions",
        serde_json::json!({ "model": "default-model", "messages": [{ "role": "user", "content": "hi" }] }))).await.unwrap();
    assert_eq!(r.status(), StatusCode::BAD_GATEWAY);
}

#[tokio::test]
async fn empty_messages_400() {
    let (app, _) = make_app("ok").await;
    let r = app.oneshot(post_json("/v1/chat/completions", serde_json::json!({ "messages": [] }))).await.unwrap();
    assert_eq!(r.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn unknown_model_passthrough() {
    let (app, _) = make_app("ok").await;
    let r = app.oneshot(post_json("/v1/chat/completions",
        serde_json::json!({ "model": "brand-new", "messages": [{ "role": "user", "content": "hi" }] }))).await.unwrap();
    let v: serde_json::Value = serde_json::from_str(&body_string(r).await).unwrap();
    assert_eq!(v["model"], "brand-new");
}

#[tokio::test]
async fn api_key_enforced() {
    let (app, keys) = make_app("ok").await;
    *keys.write().unwrap() = vec!["sk-test".into()];
    let no_key = post_json("/v1/chat/completions",
        serde_json::json!({ "model": "default-model", "messages": [{ "role": "user", "content": "hi" }] }));
    assert_eq!(app.clone().oneshot(no_key).await.unwrap().status(), StatusCode::UNAUTHORIZED);

    let with_key = Request::builder().method("POST").uri("/v1/chat/completions")
        .header("content-type", "application/json").header("authorization", "Bearer sk-test")
        .body(Body::from(serde_json::json!({ "model": "default-model", "messages": [{ "role": "user", "content": "hi" }] }).to_string())).unwrap();
    assert_eq!(app.oneshot(with_key).await.unwrap().status(), StatusCode::OK);
}
