// Builds the WeChat mini program into miniprogram/dist.
// TypeScript entries are bundled with esbuild (shared drawing code from src/
// is inlined); WXML/WXSS/JSON and template previews are copied as-is.
//   node scripts/build-miniprogram.mjs          one-off build
//   node scripts/build-miniprogram.mjs --watch  rebuild on change
import { context, build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, watch } from "node:fs";
import { dirname, join, relative } from "node:path";

const root = "miniprogram/src";
const out = "miniprogram/dist";
const watchMode = process.argv.includes("--watch");
const entryPoints = ["app.ts", ...readdirSync(join(root, "pages")).map((page) => `pages/${page}/index.ts`)]
  .map((entry) => join(root, entry));

const options = {
  entryPoints,
  outbase: root,
  outdir: out,
  bundle: true,
  format: "cjs",
  platform: "neutral",
  mainFields: ["module", "main"],
  target: "es2017",
  charset: "utf8",
  legalComments: "none",
  minify: !watchMode,
  sourcemap: watchMode ? "inline" : false,
  logLevel: "info",
};

function copyStatic() {
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (!path.endsWith(".ts")) {
        const target = join(out, relative(root, path));
        mkdirSync(dirname(target), { recursive: true });
        cpSync(path, target);
      }
    }
  };
  walk(root);
}

if (existsSync(out)) rmSync(out, { recursive: true, force: true });
copyStatic();
if (watchMode) {
  const ctx = await context(options);
  await ctx.watch();
  watch(root, { recursive: true }, (_event, file) => {
    if (file && !file.endsWith(".ts")) {
      try { copyStatic(); } catch (error) { console.error(error); }
    }
  });
  console.log(`Watching ${root} → ${out}`);
} else {
  await build(options);
  let bytes = 0;
  const walk = (dir) => readdirSync(dir).forEach((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path); else bytes += statSync(path).size;
  });
  walk(out);
  console.log(`Mini program built: ${out} (${(bytes / 1024).toFixed(0)} KB, limit 2048 KB)`);
  if (bytes > 2 * 1024 * 1024) process.exitCode = 1;
}
