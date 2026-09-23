import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const root = resolve("dist");
const files = (await readdir(root, { recursive: true }))
  .filter(file => /\.(js|css|html|png|webp|woff2|webmanifest)$/.test(file) && file !== "sw.js")
  .sort();
const hash = createHash("sha256");
for (const file of files) {
  hash.update(file);
  hash.update(await readFile(resolve(root, file)));
}
// Fonts and HEIC decoding are cached on first use, not downloaded by the homepage.
const assets = files.filter(file => !/\.woff2$|heic2any-/.test(file)).map(file => "/" + file.replaceAll("\\", "/"));
assets.push("/");
const worker = await readFile(resolve(root, "sw.js"), "utf8");
hash.update(worker);
await writeFile(resolve(root, "sw.js"), worker
  .replace('"time-imprint-studio-v12"', JSON.stringify("time-imprint-" + hash.digest("hex").slice(0, 16)))
  .replace('["/", "/manifest.webmanifest"]', JSON.stringify(assets)));
console.log(`Prepared ${assets.length} offline assets with a content-based cache version.`);
