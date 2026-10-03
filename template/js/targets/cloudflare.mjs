// Cloudflare Workers 入口。
// wrangler.toml 的 main 指向本文件。核心逻辑在 ../core.mjs
import { handle } from "../core.mjs";

export default {
  fetch(request, env) {
    return handle(request, env || {});
  },
};
