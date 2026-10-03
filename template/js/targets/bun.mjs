// Bun 入口。
// 运行: bun run targets/bun.mjs
// 环境变量: PORT（默认 47832）、API_MASTER_KEY
import { handle } from "../core.mjs";

const PORT = Number(process.env.PORT || 47832);
const env = { API_MASTER_KEY: process.env.API_MASTER_KEY || "" };

const server = Bun.serve({
  port: PORT,
  fetch(request) {
    return handle(request, env);
  },
});

console.log(`2api 网关已启动: ${server.url}`);
console.log(`  OpenAI:    ${server.url}v1`);
console.log(`  Anthropic: ${server.url}`);
