// Deno 入口。
// 运行: deno run --allow-net --allow-env targets/deno.mjs
// 环境变量: PORT（默认 47832）、API_MASTER_KEY
import { handle } from "../core.mjs";

const PORT = Number(Deno.env.get("PORT") || 47832);
const env = { API_MASTER_KEY: Deno.env.get("API_MASTER_KEY") || "" };

Deno.serve({ port: PORT, hostname: "127.0.0.1" }, (request) => handle(request, env));

console.log(`2api 网关已启动: http://127.0.0.1:${PORT}`);
console.log(`  OpenAI:    http://127.0.0.1:${PORT}/v1`);
console.log(`  Anthropic: http://127.0.0.1:${PORT}`);
