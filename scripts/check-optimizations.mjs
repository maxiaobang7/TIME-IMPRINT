import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { preview } from "vite";
import { chromium } from "playwright";
import JSZip from "jszip";

const server = await preview({ preview: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ channel: "chromium", headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const requests = [];
  const errors = [];
  context.on("request", request => requests.push(request.url()));
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => [...document.querySelectorAll(".home-example img, .home-template-grid img")].every(image => image.complete && image.naturalWidth));
  assert.ok(!requests.some(url => /\.woff2|\.ttf|heic2any-/.test(url)), "Home should not load editor fonts or HEIC decoding");
  await mkdir(".screenshots", { recursive: true });
  await page.screenshot({ path: ".screenshots/optimized-home.png", fullPage: true });

  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByLabel("生日", { exact: true }).fill("2024-01-31");
  await page.getByRole("button", { name: "首页", exact: true }).click();
  const landscape = await readFile("Tests/fixtures/landscape.jpg");
  const portrait = await readFile("Tests/fixtures/portrait.jpg");
  await page.locator('input[type="file"]').setInputFiles([
    { name: "landscape.jpg", mimeType: "image/jpeg", buffer: landscape },
    { name: "damaged.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not a JPEG") },
    { name: "portrait.jpg", mimeType: "image/jpeg", buffer: portrait },
  ]);
  await page.locator(".loading-layer").waitFor({ state: "hidden" });
  assert.equal(await page.locator(".film-item").count(), 2);
  assert.match(await page.locator(".import-failures").innerText(), /damaged.jpg/);
  await page.getByPlaceholder("未读取到拍摄时间，可手动填写").fill("2024-03-01 10:30");
  assert.match(await page.getByTestId("capture-age-hint").innerText(), /1个月1天/);
  await page.getByPlaceholder("未读取到拍摄时间，可手动填写").fill("2024-02-30");
  assert.match(await page.getByTestId("capture-age-hint").innerText(), /有效日期/);
  await page.getByPlaceholder("未读取到拍摄时间，可手动填写").fill("2024年3月1日 10:30");
  assert.match(await page.getByTestId("capture-age-hint").innerText(), /1个月1天/);

  async function download(label) {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const result = await pending;
    assert.equal(await result.failure(), null);
    await page.locator(".loading-layer").waitFor({ state: "hidden" });
    return readFile(await result.path());
  }
  await page.getByLabel("更多导出选项").click();
  const archive = await JSZip.loadAsync(await download("全部打包"));
  const entries = Object.values(archive.files).filter(file => !file.dir);
  assert.equal(entries.length, 2);
  for (const file of entries) {
    const bytes = await file.async("uint8array");
    const size = await page.evaluate(async data => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)]));
      const edge = Math.max(bitmap.width, bitmap.height);
      bitmap.close();
      return edge;
    }, [...bytes]);
    assert.equal(size, 1600, "ZIP must use full exports, not 1200px previews");
  }
  const pdf = await download("导出 PDF");
  assert.equal((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length, 2);
  await page.getByLabel("更多导出选项").click();

  await page.getByRole("tab", { name: "相纸", exact: true }).click();
  await page.locator(".format-select select").selectOption("png");
  await page.getByLabel("更多导出选项").click();
  const pngPdf = await download("导出 PDF");
  assert.equal((pngPdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length, 2);
  const pngZip = await JSZip.loadAsync(await download("全部打包"));
  assert.ok(Object.keys(pngZip.files).every(name => name.endsWith(".png")));
  await page.getByLabel("更多导出选项").click();
  await page.locator(".format-select select").selectOption("jpeg");
  await page.getByRole("tab", { name: "文字", exact: true }).click();

  // Simulate slow image encoding so cancellation is deterministic, independent
  // of the test machine's speed, while retaining real image decoding/encoding.
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      original.call(this, blob => setTimeout(() => callback(blob), 80), ...args);
    };
  });
  await page.locator('input[type="file"]').setInputFiles(Array.from({ length: 24 }, (_, index) => ({
    name: `batch-${index}.jpg`, mimeType: "image/jpeg", buffer: landscape,
  })));
  await page.waitForFunction(() => /正在导入 [2-9]\//.test(document.querySelector(".loading-card")?.textContent ?? ""));
  await page.getByRole("button", { name: "取消后续处理" }).click();
  await page.locator(".loading-layer").waitFor({ state: "hidden" });
  const retained = await page.locator(".film-item").count();
  assert.ok(retained > 2 && retained < 26, "Cancel retains completed imports and stops remaining photos");
  await page.getByPlaceholder("例如：杭州 西湖").fill("取消后仍可继续编辑");
  let downloadCount = 0;
  page.on("download", () => downloadCount++);
  await page.getByLabel("更多导出选项").click();
  await page.getByRole("button", { name: "全部打包", exact: true }).click();
  await page.getByRole("button", { name: "取消后续处理" }).click();
  await page.locator(".loading-layer").waitFor({ state: "hidden" });
  assert.equal(downloadCount, 0, "Cancelled export must not download a partial archive");
  assert.equal(await page.locator(".film-item").count(), retained);
  await page.getByLabel("更多导出选项").click();
  await page.screenshot({ path: ".screenshots/optimized-batch.png", fullPage: true });

  const large = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 4000; canvas.height = 3000;
    canvas.getContext("2d").fillRect(0, 0, 4000, 3000);
    const data = canvas.toDataURL("image/jpeg").split(",")[1];
    canvas.width = canvas.height = 1;
    return data;
  });
  await page.locator('input[type="file"]').setInputFiles(Array.from({ length: 8 }, (_, index) => ({
    name: `12mp-${index}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(large, "base64"),
  })));
  await page.locator(".loading-layer").waitFor({ state: "hidden" });
  assert.equal(await page.locator(".film-item").count(), retained + 8);
  await page.waitForFunction(() => {
    const image = document.querySelector(".photo-frame img");
    return image?.complete && image.naturalWidth === 1200;
  });
  const largeExport = await download("保存图片");
  const edge = await page.evaluate(async bytes => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
    const edge = Math.max(bitmap.width, bitmap.height);
    bitmap.close(); return edge;
  }, [...largeExport]);
  assert.equal(edge, 3200);
  assert.deepEqual(errors, []);
  console.log("Optimization checks passed: no homepage font/HEIC fetch, date-age updates, mixed corrupt import, full-resolution ZIP/PDF, import/export cancellation, eight 12MP images with 1200px previews and 3200px export.");
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections();
  await new Promise(resolve => server.httpServer.close(resolve));
}
