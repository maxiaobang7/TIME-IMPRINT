import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "docs/screenshots");
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: "127.0.0.1", port: 0, open: false } });
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin);
  await readyHome(page);
  await screenshot(page, "desktop-home");

  // Call the actual renderer with synthetic sample photos; no user photos or metadata.
  const examples = await page.evaluate(async () => {
    const { loadSamplePhoto, sampleBaby } = await import("/src/services/sample.ts");
    const { defaultTemplates } = await import("/src/data/templates.ts");
    const { renderWatermark } = await import("/src/services/watermark.ts");
    const toData = blob => new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    const result = [];
    for (const template of defaultTemplates) {
      const photo = await loadSamplePhoto(template.id);
      const blob = await renderWatermark({ photo, style: template.style, babyProfile: sampleBaby, outputFormat: "jpeg", maxEdge: 1600 });
      result.push({ id: template.id, name: template.name, data: await toData(blob), original: photo.previewUrl });
    }
    return result;
  });
  for (const item of examples) {
    await writeFile(path.join(output, `${item.id}.jpg`), Buffer.from(item.data.split(",")[1], "base64"));
  }
  const postcard = examples.find(item => item.id === "travel-postcard");
  await page.locator('input[type="file"]').setInputFiles({ name: "海边的夏天.jpg", mimeType: "image/jpeg", buffer: Buffer.from(postcard.original.split(",")[1], "base64") });
  await page.locator(".studio-workspace").waitFor();
  await page.getByRole("tab", { name: "模板", exact: true }).click();
  await page.locator(".inspector .studio-template-grid").getByRole("button", { name: "旅行明信片" }).click();
  await page.getByRole("tab", { name: "文字", exact: true }).click();
  await page.getByPlaceholder("未读取到拍摄时间，可手动填写").fill("2026.09.22");
  await page.getByPlaceholder("例如：杭州 西湖").fill("杭州 · 西湖");
  await page.getByPlaceholder("写给未来的一句话").fill("陪你，慢慢看世界");
  await page.getByRole("tab", { name: "模板", exact: true }).click();
  await settle(page);
  await page.locator(".toast").waitFor({ state: "hidden" });
  await screenshot(page, "desktop-editor");
  await page.getByRole("tab", { name: "文字", exact: true }).click();
  await settle(page);
  await screenshot(page, "desktop-postcard-text");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "模板", exact: true }).click();
  await settle(page);
  await screenshot(page, "mobile-editor");
  await page.locator(".brand").click();
  await readyHome(page);
  await screenshot(page, "mobile-home");
  assert.deepEqual(errors, [], "Browser runtime errors");

  const gallery = await context.newPage();
  await gallery.setViewportSize({ width: 1500, height: 1100 });
  await gallery.setContent(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:44px;background:#f3f7f5;color:#263c32;font-family:"Microsoft YaHei",sans-serif}
    h1{font-size:32px;margin:0 0 10px}p{color:#63766b;margin:0 0 28px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
    figure{margin:0}img{display:block;width:100%;height:320px;object-fit:contain;background:white}figcaption{font-size:20px;text-align:center;padding:16px}
    </style><h1>时光印记 · 六款水印风格</h1><p>合成示例照片 · 当前水印引擎实际导出</p><main>${examples.map(item => `<figure><img src="${item.data}" alt="${item.name}"><figcaption>${item.name}</figcaption></figure>`).join("")}</main></html>`);
  await settle(gallery);
  await screenshot(gallery, "template-gallery");
  console.log(`Generated ${examples.length} template exports and 6 screenshots in ${output}`);
} finally {
  await browser?.close();
  await server.close();
}

async function readyHome(page) {
  await page.locator(".home-example img").waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".home-template-grid img").length === 6);
  await settle(page);
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
  });
  await page.waitForTimeout(800);
}

async function screenshot(page, name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name}: horizontal overflow`);
  await page.screenshot({ path: path.join(output, `${name}.jpg`), type: "jpeg", quality: 90, fullPage: true, animations: "disabled" });
}
