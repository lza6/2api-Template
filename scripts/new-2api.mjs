// 2api 脚手架：一条命令从模板生成一个新的 2api 项目。
//
// 用法:
//   node new-2api.mjs <项目名> [目标目录] [--local] [--cf] [--keep-git]
//
// 例:
//   node new-2api.mjs mysite-2api ../mysite-2api --local
//   node new-2api.mjs mysite-2api --both
//
// 行为:
//   · 复制 template/local 和/或 template/cloudflare 到目标目录（默认两者）
//   · 替换占位：my-2api→<名>、my2api→<crate名>、example.com→<待填> 保留为 TODO
//   · 生成 docs/ 骨架（PROTOCOL.md / E2E.md 待填）与 .gitignore
//   · 打印「下一步」清单（对应 docs/QUICKSTART.md）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const positional = argv.filter((a) => !a.startsWith("--"));
  const name = positional[0];
  const destArg = positional[1];
  const wantLocal = flags.has("--local") || flags.has("--both") || (!flags.has("--cf") && !flags.has("--local"));
  const wantCf = flags.has("--cf") || flags.has("--both") || (!flags.has("--cf") && !flags.has("--local"));
  return { name, destArg, wantLocal, wantCf, keepGit: flags.has("--keep-git") };
}

function toCrate(name) {
  // mysite-2api → mysite2api；仅保留 [a-z0-9]
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function copyDir(src, dst, replacers) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "target" || entry.name === ".git" || entry.name === "node_modules") continue;
      copyDir(s, d, replacers);
    } else {
      if (entry.name === "Cargo.lock") continue; // 由首次 build 生成
      let content = fs.readFileSync(s, "utf8");
      for (const [from, to] of replacers) content = content.split(from).join(to);
      fs.writeFileSync(d, content);
    }
  }
}

function main() {
  const { name, destArg, wantLocal, wantCf } = parseArgs(process.argv.slice(2));
  if (!name) {
    console.error("用法: node new-2api.mjs <项目名> [目标目录] [--local|--cf|--both]");
    process.exit(1);
  }
  const dest = path.resolve(destArg || path.join("..", name));
  if (fs.existsSync(dest) && fs.readdirSync(dest).length) {
    console.error(`目标目录非空: ${dest}\n请换一个目录或先清空。`);
    process.exit(1);
  }
  const crate = toCrate(name);
  const replacers = [
    ["my-2api", name],
    ["my2api", crate],
  ];

  console.log(`生成项目: ${name}`);
  console.log(`  crate 名: ${crate}`);
  console.log(`  目标:     ${dest}`);
  console.log(`  形态:     ${[wantCf && "cloudflare", wantLocal && "local"].filter(Boolean).join(" + ")}`);

  fs.mkdirSync(dest, { recursive: true });

  if (wantCf) {
    copyDir(path.join(TEMPLATE_ROOT, "template", "cloudflare"), path.join(dest, "cloudflare"), replacers);
  }
  if (wantLocal) {
    copyDir(path.join(TEMPLATE_ROOT, "template", "local"), path.join(dest, "local"), replacers);
  }

  // docs 骨架
  const docsDir = path.join(dest, "docs");
  fs.mkdirSync(docsDir, { recursive: true });
  fs.copyFileSync(path.join(TEMPLATE_ROOT, "docs", "PROTOCOL.template.md"), path.join(docsDir, "PROTOCOL.md"));

  // 根 .gitignore
  fs.writeFileSync(path.join(dest, ".gitignore"), [
    "node_modules/", "dist/", ".wrangler/", "target/", "config.json", "captures/",
    ".DS_Store", "*.log", "",
  ].join("\n"));

  // 根 README
  fs.writeFileSync(path.join(dest, "README.md"), `# ${name}

把 <目标站点> 的免费 AI 服务转为 OpenAI / Anthropic 兼容 API。

> 由 [2api-Template](https://github.com/lza6/2api-Template) 生成。

## 形态

${wantCf ? "- `cloudflare/` — Cloudflare Worker（公网部署）\n" : ""}${wantLocal ? "- `local/` — 本地 Rust 网关（本机使用）\n" : ""}
## 下一步（对照 2api-Template/docs/QUICKSTART.md）

1. **逆向上游** → 用 \`skills/reverse-2api\` 抓包，把契约写进 \`docs/PROTOCOL.md\`
2. **采集目录** → 实测真实模型/工具 id
3. **填 4 处 \`[★ PROVIDER]\`** → ${wantLocal ? "`local/src/config.rs`、`local/src/models.rs`、`local/src/upstream.rs`、`local/src/api.rs`" : "`cloudflare/worker.js` 的 CONFIG / CATALOG / buildUpstreamRequest / parseUpstreamResponse"}
4. **全量 E2E** → \`node cloudflare/scripts/e2e-all-models.mjs\`（或对齐你的形态），把结论写进 \`docs/E2E.md\`
5. **验收** → 逐条对照 2api-Template 的 \`docs/INVARIANTS.md\`

## 测试

${wantCf ? "\`\`\`bash\ncd cloudflare && node smoke.mjs\n\`\`\`\n" : ""}${wantLocal ? "\`\`\`bash\ncd local && cargo test\n\`\`\`\n" : ""}
`);

  // 完成提示
  console.log("\n完成。下一步:");
  console.log("  1. cd " + path.relative(process.cwd(), dest));
  if (wantLocal) console.log("  2. 编辑 local/src/{config,models,upstream,api}.rs 的 [★ PROVIDER]");
  if (wantCf) console.log("  2. 编辑 cloudflare/worker.js 的 [★ PROVIDER]");
  console.log("  3. 填写 docs/PROTOCOL.md（逆向契约）");
  console.log("  4. 跑测试 → 对照 docs/INVARIANTS.md 验收");
  console.log("\n详见 2api-Template/docs/QUICKSTART.md");
}

main();
