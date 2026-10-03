// =================================================================================
//  2api-Template · JS 运行时无关核心
//
//  只依赖 Web 标准 API（fetch / Request / Response / ReadableStream / TextEncoder /
//  TextDecoder / crypto.randomUUID）。因此同一份核心可跑在：
//    Cloudflare Workers · Node(18+) · Bun · Deno · Vercel Edge
//
//  对外只暴露 handle(request, env) → Response。各运行时适配器见 template/js/targets/。
//  你只需改标有  [★ PROVIDER]  的部分。
// =================================================================================

// ---------------------------------------------------------------------------------
//  [★ PROVIDER 1/4] 配置：改成你的上游
// ---------------------------------------------------------------------------------
const CONFIG = {
  PROJECT_NAME: "my-2api",
  PROJECT_VERSION: "0.1.0",

  API_MASTER_KEY: "1",                 // 建议用环境变量/secret 注入

  // --- 上游端点 ---
  UPSTREAM_URL:  "https://example.com/api/chat",   // ← 改：真实端点
  ORIGIN_URL:    "https://example.com",            // ← 改：Origin/Referer 基址
  USER_AGENT:    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",

  // --- 伪流式分块 ---
  CHUNK_CHARS: 120,
  CHUNK_DELAY_MS: 0,

  DEFAULT_MODEL: "default-model",      // ← 改：默认模型 id
};

// 上游限额/登录墙哨兵：响应含此串表示额度用尽（改成你的上游哨兵，没有就留 null）
const QUOTA_SENTINEL = null;

// ---------------------------------------------------------------------------------
//  [★ PROVIDER 2/4] 模型/工具目录：放你实测到的真实 id
// ---------------------------------------------------------------------------------
const CATALOG = {
  general: ["default-model", "another-model"],   // ← 改：真实 id（见 docs/QUICKSTART.md）
};
const ALL_MODELS = Object.values(CATALOG).flat();
const MODEL_SET = new Set(ALL_MODELS);
const isKnownModel = (id) => MODEL_SET.has(id);

// ---------------------------------------------------------------------------------
//  [★ PROVIDER 3/4] 上游适配：构造请求、解析响应
// ---------------------------------------------------------------------------------

/**
 * 从下游请求（已抽取的 prompt、model、tone、language、messages）构造上游请求
 * @returns {{url:string, init:RequestInit}}
 */
function buildUpstreamRequest({ toolId, prompt, tone, language }) {
  return {
    url: CONFIG.UPSTREAM_URL,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
        "Origin": CONFIG.ORIGIN_URL,
        "Referer": `${CONFIG.ORIGIN_URL}/`,          // ← 改：按抓包补 Referer
        "User-Agent": CONFIG.USER_AGENT,
        "Accept": "*/*",
      },
      body: JSON.stringify({
        // ← 改：真实请求体字段（注意大小写，如 chatId）
        text: prompt,
        id: toolId,
        chatId: crypto.randomUUID(),
      }),
    },
  };
}

/**
 * 从上游响应 JSON 解析出纯文本
 * @returns {string}
 */
function parseUpstreamResponse(data) {
  // ← 改：按你的上游响应结构取值
  if (typeof data === "string") return data;
  return (data.response || (Array.isArray(data.responses) ? data.responses[0] : "")) || "";
}

/** 调上游，返回 {ok,text}|{ok:false,status,message} */
async function callUpstream(ctx) {
  const { url, init } = buildUpstreamRequest(ctx);
  let response;
  try {
    response = await fetch(url, init);
  } catch (e) {
    return { ok: false, status: 502, message: `上游请求失败: ${e.message}` };
  }
  if (!response.ok) {
    const t = await response.text().catch(() => "");
    return { ok: false, status: 502, message: `上游 HTTP ${response.status}: ${t.slice(0, 200)}` };
  }
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = raw; }
  const text = parseUpstreamResponse(data);
  if (QUOTA_SENTINEL && text.includes(QUOTA_SENTINEL)) {
    return { ok: false, status: 429, message: "上游免费额度已用尽，请稍后再试或更换出口" };
  }
  if (!text || !text.trim()) return { ok: false, status: 502, message: "上游未返回有效内容" };
  return { ok: true, text };
}

// ---------------------------------------------------------------------------------
//  [★ PROVIDER 4/4] 请求 → prompt 抽取（多数情况无需改）
// ---------------------------------------------------------------------------------
function resolveToolId(requested) {
  if (!requested) return CONFIG.DEFAULT_MODEL;
  return requested; // 目录内直接用；未知按透传（目录可能更新）
}

function contentToText(content) {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((p) =>
      typeof p === "string" ? p : p && typeof p.text === "string" ? p.text : ""
    ).filter(Boolean).join("\n");
  }
  return "";
}

function extractPrompt(messages, system) {
  const parts = [];
  if (system) {
    const s = typeof system === "string" ? system : contentToText(system);
    if (s.trim()) parts.push(s);
  }
  for (const m of messages || []) {
    const t = contentToText(m.content);
    if (t.trim()) parts.push(t);
  }
  return parts.join("\n\n");
}

// =================================================================================
//  通用请求处理入口（各运行时适配器调用）—— 通常无需修改
// =================================================================================

/**
 * 处理一个 Web 标准 Request，返回 Response。
 * @param {Request} request
 * @param {Record<string,string>} [env] 环境变量（如 API_MASTER_KEY）
 * @returns {Promise<Response>}
 */
export async function handle(request, env = {}) {
  const apiKey = env.API_MASTER_KEY || CONFIG.API_MASTER_KEY;
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return corsPreflight();
  switch (url.pathname) {
    case "/": return handleUI(request, apiKey);
    case "/healthz":
      return json({ status: "ok", models: ALL_MODELS.length, upstream: CONFIG.ORIGIN_URL });
    case "/v1/models": return handleModels(request, apiKey);
    case "/v1/chat/completions": return handleOpenAI(request, apiKey);
    case "/v1/messages": return handleAnthropic(request, apiKey);
    case "/v1/messages/count_tokens": return handleCountTokens(request, apiKey);
    default: return errorResponse(`未找到路径: ${url.pathname}`, 404, "not_found");
  }
}

export { CONFIG, CATALOG, ALL_MODELS };

// ---------- OpenAI ----------
async function handleOpenAI(request, apiKey) {
  if (!verifyAuth(request, apiKey)) return errorResponse("未授权", 401, "unauthorized");
  let body;
  try { body = await request.json(); } catch { return errorResponse("无效 JSON", 400, "invalid_json"); }
  if (!body.messages?.length) return errorResponse("messages 不能为空", 400, "invalid_request");

  const model = resolveToolId(body.model);
  const prompt = extractPrompt(body.messages, null);
  const id = `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const res = await callUpstream({ toolId: model, prompt, tone: body.tone, language: body.language });

  if (!res.ok) {
    if (body.stream) return stream([openaiErrFrame(res.message, model, id, created), "data: [DONE]\n\n"]);
    return errorResponse(res.message, res.status, res.status === 429 ? "rate_limit_error" : "upstream_error");
  }
  if (body.stream) return stream(openaiFrames(res.text, model, id, created));

  return json({
    id, object: "chat.completion", created, model,
    choices: [{ index: 0, message: { role: "assistant", content: res.text }, finish_reason: "stop" }],
    usage: { prompt_tokens: est(prompt), completion_tokens: est(res.text), total_tokens: est(prompt) + est(res.text) },
  });
}

function openaiFrames(content, model, id, created) {
  const f = [];
  f.push(sse({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] }));
  for (const p of chunk(content, CONFIG.CHUNK_CHARS)) {
    if (!p) continue;
    f.push(sse({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: { content: p }, finish_reason: null }] }));
  }
  f.push(sse({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }));
  f.push("data: [DONE]\n\n");
  return f;
}
function openaiErrFrame(message, model, id, created) {
  return sse({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: { content: `[上游错误: ${message}]` }, finish_reason: "stop" }] });
}

// ---------- Anthropic ----------
async function handleAnthropic(request, apiKey) {
  if (!verifyAuth(request, apiKey)) return errorResponse("未授权", 401, "unauthorized", true);
  let body;
  try { body = await request.json(); } catch { return errorResponse("无效 JSON", 400, "invalid_json", true); }
  if (!body.messages?.length) return errorResponse("messages 不能为空", 400, "invalid_request", true);

  const model = resolveToolId(body.model);
  const prompt = extractPrompt(body.messages, body.system);
  const id = `msg_${crypto.randomUUID().replace(/-/g, "")}`;
  const inTok = est(prompt);
  const res = await callUpstream({ toolId: model, prompt, tone: body.tone, language: body.language });

  if (!res.ok) {
    if (body.stream) return stream(anthropicFrames(`[上游错误: ${res.message}]`, model, id, inTok));
    return errorResponse(res.message, res.status, res.status === 429 ? "rate_limit_error" : "upstream_error", true);
  }
  if (body.stream) return stream(anthropicFrames(res.text, model, id, inTok));

  return json({
    id, type: "message", role: "assistant", model,
    content: [{ type: "text", text: res.text }],
    stop_reason: "end_turn", stop_sequence: null,
    usage: { input_tokens: inTok, output_tokens: est(res.text) },
  });
}

function anthropicFrames(content, model, id, inTok) {
  const ev = (name, p) => `event: ${name}\ndata: ${JSON.stringify(p)}\n\n`;
  const f = [];
  f.push(ev("message_start", { type: "message_start", message: { id, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: inTok, output_tokens: 0 } } }));
  f.push(ev("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }));
  for (const p of chunk(content, CONFIG.CHUNK_CHARS)) {
    if (!p) continue;
    f.push(ev("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: p } }));
  }
  f.push(ev("content_block_stop", { type: "content_block_stop", index: 0 }));
  f.push(ev("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: est(content) } }));
  f.push(ev("message_stop", { type: "message_stop" }));
  return f;
}

// ---------- Claude Code 兼容 ----------
async function handleCountTokens(request, apiKey) {
  if (!verifyAuth(request, apiKey)) return errorResponse("未授权", 401, "unauthorized", true);
  let body;
  try { body = await request.json(); } catch { return errorResponse("无效 JSON", 400, "invalid_json", true); }
  const prompt = extractPrompt(body.messages || [], body.system);
  return json({ input_tokens: est(prompt) });
}

// ---------- 工具 ----------
function stream(frames, ms = CONFIG.CHUNK_DELAY_MS) {  const enc = new TextEncoder();
  const rs = new ReadableStream({
    async start(c) {
      for (const f of frames) { c.enqueue(enc.encode(f)); if (ms > 0) await new Promise(r => setTimeout(r, ms)); }
      c.close();
    },
  });
  return new Response(rs, { headers: cors({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" }) });
}
const sse = (o) => `data: ${JSON.stringify(o)}\n\n`;
function chunk(text, size) {
  const chars = Array.from(text); const out = [];
  for (let i = 0; i < chars.length; i += size) out.push(chars.slice(i, i + size).join(""));
  if (!out.length) out.push("");
  return out;
}
const est = (t) => Math.max(1, Math.floor(Array.from(t || "").length / 4));

function handleModels(request, apiKey) {
  if (!verifyAuth(request, apiKey)) return errorResponse("未授权", 401, "unauthorized");
  const data = ALL_MODELS.map((id) => ({
    id, object: "model", created: 1735689600, owned_by: CONFIG.PROJECT_NAME,
    meta: { category: Object.keys(CATALOG).find((c) => CATALOG[c].includes(id)) || "other" },
  }));
  return json({ object: "list", data });
}

function verifyAuth(request, validKey) {
  if (!validKey || validKey === "1") return true;
  const a = request.headers.get("Authorization");
  const x = request.headers.get("x-api-key");
  return a === `Bearer ${validKey}` || x === validKey;
}
function json(obj) { return new Response(JSON.stringify(obj), { headers: cors({ "Content-Type": "application/json" }) }); }
function errorResponse(message, status, code, anthropic = false) {
  const body = anthropic ? { type: "error", error: { type: code, message } } : { error: { message, type: code, code } };
  return new Response(JSON.stringify(body), { status, headers: cors({ "Content-Type": "application/json" }) });
}
function corsPreflight() { return new Response(null, { status: 204, headers: cors() }); }
function cors(h = {}) {
  return { ...h, "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, anthropic-version" };
}

// ---------- 控制面板（通用，可留可删） ----------
function handleUI(request, apiKey) {
  const origin = new URL(request.url).origin;
  const modelsJson = JSON.stringify(ALL_MODELS);
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${CONFIG.PROJECT_NAME}</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#0f1115;color:#e6e8ec;height:100vh;display:flex;flex-direction:column}
header{padding:16px 20px;border-bottom:1px solid #2a2f3a;font-weight:600}
main{flex:1;display:flex;flex-direction:column;padding:20px;overflow:hidden;max-width:900px;margin:0 auto;width:100%}
.out{flex:1;overflow-y:auto;background:#171a21;border:1px solid #2a2f3a;border-radius:8px;padding:14px;margin-bottom:12px;white-space:pre-wrap}
.m{margin-bottom:8px}.u{color:#f0b429;font-weight:600}.e{color:#f85149}.s{color:#8b93a3;font-size:12px}
.inp{display:flex;gap:8px}textarea{flex:1;background:#242833;border:1px solid #2a2f3a;color:#e6e8ec;padding:8px;border-radius:6px;resize:none;font-family:inherit}
button{background:#f0b429;color:#000;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer}
code{background:#242833;padding:2px 6px;border-radius:4px;font-size:12px;color:#f0b429}</style></head>
<body><header>${CONFIG.PROJECT_NAME} · v${CONFIG.PROJECT_VERSION}</header>
<main><div class="out" id="out"><div class="s">端点: ${origin}/v1 · 模型 ${ALL_MODELS.length} 个</div>
<div class="s">Key: ${apiKey}</div></div>
<div class="inp"><textarea id="ta" rows="2" placeholder="输入…（Enter 发送）"></textarea><button onclick="send()">发送</button></div></main>
<script>const MODELS=${modelsJson},O='${origin}';
const out=document.getElementById('out');
function mk(c){const d=document.createElement('div');d.className='m '+c;out.appendChild(d);out.scrollTop=out.scrollHeight;return d}
async function send(){const ta=document.getElementById('ta'),t=ta.value.trim();if(!t)return;ta.value='';mk('u').textContent=t;const ai=mk('');
try{const r=await fetch(O+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer ${apiKey}'},body:JSON.stringify({model:MODELS[0],messages:[{role:'user',content:t}],stream:true})});
if(!r.ok){mk('e').textContent='错误 '+r.status;return}const rd=r.body.getReader(),dec=new TextDecoder();let b='';
while(1){const{done,value}=await rd.read();if(done)break;b+=dec.decode(value,{stream:true});const ls=b.split('\\n');b=ls.pop();
for(const l of ls){if(!l.startsWith('data: '))continue;const d=l.slice(6);if(d==='[DONE]')continue;try{const c=JSON.parse(d).choices?.[0]?.delta?.content;if(c){ai.textContent+=c;out.scrollTop=out.scrollHeight}}catch(e){}}}}
catch(e){mk('e').textContent='失败: '+e.message}}
document.getElementById('ta').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
