// Vercel Edge Function 入口。
// 放到 api/ 目录（如 api/gateway.mjs），或按你的 vercel.json 路由配置。
// Vercel Edge Runtime 提供全局 Request/Response/fetch，直接返回 Web 响应。
import { handle } from "../core.mjs";

export const config = { runtime: "edge" };

export default function (request) {
  return handle(request, process.env);
}
