import assert from "node:assert/strict";
import { preview } from "vite";
import { chromium } from "playwright";

const server = await preview({ preview: { host: "127.0.0.1", port: 0, open: false } });
let browser;
try {
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const manifestResponse = await fetch(`${origin}/manifest.webmanifest`);
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.name, "时光印记");
  for (const asset of ["/sw.js", "/fonts/MaShanZheng-Regular.ttf", "/studio/sample-scenes.png", ...manifest.icons.map(icon => icon.src)]) {
    const response = await fetch(origin + asset);
    assert.equal(response.status, 200, asset);
    assert.ok(!response.headers.get("content-type")?.includes("text/html"), `${asset} served HTML`);
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin);
  assert.equal(await page.title(), "时光印记 - 免费给宝宝照片添加时间、地点水印");
  await page.locator(".home-example img").waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.locator('input[type="file"]').setInputFiles("Tests/fixtures/landscape.jpg");
  await page.locator(".photo-frame img").waitFor();
  await page.getByRole("tab", { name: "文字", exact: true }).click();
  assert.match(await page.getByPlaceholder("未读取到拍摄时间，可手动填写").inputValue(), /2026/);
  await page.getByRole("button", { name: "保存图片", exact: true }).waitFor();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "保存图片", exact: true }).click();
  assert.equal(await (await downloaded).failure(), null);
  assert.deepEqual(errors, []);
  console.log("Production assets, manifest, service worker, EXIF import and image download passed.");
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
