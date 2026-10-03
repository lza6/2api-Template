// Cloudflare Worker 冒烟测试：mock 上游 fetch，验证双协议与错误映射。
// 用法: node smoke.mjs
import worker from "./worker.js";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n} ${x}`)); };

// mock 上游：把 UPSTREAM_URL 指向的 fetch 拦截
let mode = "ok";
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes("example.com") || String(url).includes("/api/")) {
    const bodies = {
      ok:    JSON.stringify({ response: "hello from mock", responses: ["hello from mock"] }),
      quota: JSON.stringify({ response: "QUOTA_SENTINEL_HERE", responses: ["QUOTA_SENTINEL_HERE"] }),
      empty: JSON.stringify({ response: "", responses: [] }),
    };
    return new Response(mode === "empty" ? bodies.empty : mode === "quota" ? bodies.quota : bodies.ok, { status: 200 });
  }
  return realFetch(url, opts);
};

// 若使用 QUOTA_SENTINEL，请同时把 worker.js 的 QUOTA_SENTINEL 设成 "QUOTA_SENTINEL_HERE" 以测试
const env = { API_MASTER_KEY: "1" };
const call = (p, init) => worker.fetch(new Request("https://gw.example" + p, init), env, {});
const jpost = (p, body) => call(p, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer 1" }, body: JSON.stringify(body) });

console.log("== 基础 ==");
{ const r = await call("/healthz"); const j = JSON.parse(await r.text()); ok("healthz ok", j.status === "ok"); }
{ const r = await call("/v1/models", { headers: { Authorization: "Bearer 1" } }); const j = JSON.parse(await r.text()); ok("models 非空", j.data.length >= 1); }

console.log("== OpenAI 非流式 ==");
{ mode = "ok"; const r = await jpost("/v1/chat/completions", { model: "default-model", messages: [{ role: "user", content: "hi" }] });
  const j = JSON.parse(await r.text()); ok("200", r.status === 200); ok("content", j.choices[0].message.content === "hello from mock"); }

console.log("== OpenAI 流式 ==");
{ const r = await jpost("/v1/chat/completions", { model: "default-model", messages: [{ role: "user", content: "hi" }], stream: true });
  const s = await r.text(); ok("SSE", r.headers.get("content-type").includes("text/event-stream"));
  ok("含 role", s.includes('"role":"assistant"')); ok("含 [DONE]", s.trimEnd().endsWith("[DONE]")); }

console.log("== Anthropic ==");
{ const r = await jpost("/v1/messages", { model: "default-model", max_tokens: 50, messages: [{ role: "user", content: "hi" }] });
  const j = JSON.parse(await r.text()); ok("type message", j.type === "message"); ok("text", j.content[0].text === "hello from mock"); }
{ const r = await jpost("/v1/messages", { model: "default-model", max_tokens: 50, messages: [{ role: "user", content: "hi" }], stream: true });
  const s = await r.text(); ok("含 message_start", s.includes("event: message_start")); ok("含 message_stop", s.includes("event: message_stop")); }

console.log("== 错误映射 ==");
{ mode = "empty"; const r = await jpost("/v1/chat/completions", { model: "default-model", messages: [{ role: "user", content: "hi" }] }); ok("空上游→502", r.status === 502, String(r.status)); mode = "ok"; }
{ const r = await jpost("/v1/chat/completions", { messages: [] }); ok("空 messages→400", r.status === 400, String(r.status)); }

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
