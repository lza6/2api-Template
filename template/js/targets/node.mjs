// Node.js 入口（Node 18+，用内置 http 模块 + 全局 fetch/Request/Response）。
// 运行: node targets/node.mjs
// 环境变量: PORT（默认 47832）、API_MASTER_KEY
import http from "node:http";
import { handle } from "../core.mjs";

const PORT = Number(process.env.PORT || 47832);
const env = { API_MASTER_KEY: process.env.API_MASTER_KEY || "" };

const server = http.createServer(async (req, res) => {
  try {
    // 构造 Web 标准 Request
    const url = `http://${req.headers.host || `127.0.0.1:${PORT}`}${req.url}`;
    const method = req.method || "GET";
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
      else if (v != null) headers.set(k, v);
    }
    const hasBody = method !== "GET" && method !== "HEAD";
    const body = hasBody ? await readBody(req) : undefined;
    const request = new Request(url, { method, headers, body });

    const response = await handle(request, env);

    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    if (response.body) {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    }
    res.end();
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: { message: "内部错误", type: "internal_error" } }));
  }
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

server.listen(PORT, () => {
  console.log(`2api 网关已启动: http://127.0.0.1:${PORT}`);
  console.log(`  OpenAI:    http://127.0.0.1:${PORT}/v1`);
  console.log(`  Anthropic: http://127.0.0.1:${PORT}`);
});
