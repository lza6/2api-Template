// 全量模型真实 E2E：逐个打上游，产出「哪些真的可用」报告。
// 适配你的上游：改下面 UPSTREAM / buildRequest；目录从 worker.js 的 CATALOG 读取。
// 用法: node scripts/e2e-all-models.mjs [--json]
import { CATALOG } from "../core.mjs";

const MODELS = Object.values(CATALOG).flat();
const jsonMode = process.argv.includes("--json");

// [★ 改] 上游端点与请求构造
const UPSTREAM = "https://example.com/api/chat";
const PROMPT = "Reply with one short useful sentence.";

function buildRequest(id) {
  return {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
      "Origin": "https://example.com",
      "Referer": `https://example.com/${id}`,
      "User-Agent": "Mozilla/5.0 Chrome/151.0.0.0",
      "Accept": "*/*",
    },
    body: JSON.stringify({ text: PROMPT, id, chatId: crypto.randomUUID() }),
  };
}

// [★ 改] 从响应解析文本 + 判断是否命中限额哨兵
function parseResponse(raw) {
  let text = "", quota = false, parsed = false;
  try {
    const j = JSON.parse(raw);
    parsed = true;
    text = (j.response && String(j.response)) ||
      (Array.isArray(j.responses) ? (j.responses.find((x) => x && String(x).trim()) || "") : "");
    // [★ 改] 换成你的上游哨兵
    quota = /sign up to continue|request limit/i.test(text);
  } catch { /* non-json */ }
  return { text, quota, parsed };
}

async function testOne(id) {
  const t0 = Date.now();
  try {
    const r = await fetch(UPSTREAM, { ...buildRequest(id), signal: AbortSignal.timeout(40000) });
    const { text, quota } = parseResponse(await r.text());
    return { id, ok: r.ok && !!text && !quota, status: r.status, ms: Date.now() - t0, quota,
             snippet: text.slice(0, 60).replace(/\s+/g, " ") };
  } catch (e) {
    return { id, ok: false, status: 0, ms: Date.now() - t0, error: e.message };
  }
}

const results = [];
for (const id of MODELS) {
  const r = await testOne(id);
  results.push(r);
  if (!jsonMode) {
    const mark = r.ok ? "OK " : (r.quota ? "QUOTA" : "FAIL");
    process.stdout.write(`  ${mark.padEnd(6)} ${id.padEnd(32)} ${String(r.ms).padStart(6)}ms  ${r.snippet || r.error || ""}\n`);
  }
  await new Promise((s) => setTimeout(s, 900)); // 温和间隔，避免触发限流
}

const ok = results.filter((r) => r.ok);
const quota = results.filter((r) => r.quota);
const fail = results.filter((r) => !r.ok && !r.quota);

if (jsonMode) {
  console.log(JSON.stringify({ total: MODELS.length, ok: ok.length, quota: quota.length, fail: fail.length, results }, null, 2));
} else {
  console.log(`\n=== 汇总 ===`);
  console.log(`可用 ${ok.length} / ${MODELS.length}`);
  if (quota.length) console.log(`命中限额 ${quota.length}: ${quota.map((r) => r.id).join(", ")}`);
  if (fail.length) console.log(`失败 ${fail.length}: ${fail.map((r) => r.id + "(" + (r.status || "ERR") + ")").join(", ")}`);
}
