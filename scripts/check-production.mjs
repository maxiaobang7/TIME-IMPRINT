import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { preview } from "vite";
import { chromium, devices } from "playwright";

const server = await preview({ preview: { host: "127.0.0.1", port: 0, open: false } });
let browser;
try {
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const manifestResponse = await fetch(`${origin}/manifest.webmanifest`);
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.name, "时光印记");
  for (const asset of ["/sw.js", "/fonts/MaShanZheng-Regular.woff2", "/studio/sample-scenes.webp", ...manifest.icons.map(icon => icon.src)]) {
    const response = await fetch(origin + asset);
    assert.equal(response.status, 200, asset);
    assert.ok(!response.headers.get("content-type")?.includes("text/html"), `${asset} served HTML`);
  }
  browser = await chromium.launch({ headless: true, channel: "chromium" });
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
  await page.getByRole("button", { name: "设置", exact: true }).click();
  assert.equal(await page.getByLabel("名称", { exact: true }).inputValue(), "");
  assert.equal(await page.getByLabel("生日", { exact: true }).inputValue(), "");
  await page.getByRole("button", { name: "隐藏", exact: true }).click();
  await page.getByRole("button", { name: "继续编辑照片", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "地点", exact: true }).getAttribute("aria-pressed"), "false");
  assert.equal(await page.getByRole("button", { name: "经纬度", exact: true }).getAttribute("aria-pressed"), "false");
  await page.locator('input[type="file"]').setInputFiles("Tests/fixtures/portrait.jpg");
  await page.locator(".loading-layer").waitFor({ state: "hidden" });
  await page.getByLabel("更多导出选项").click();
  for (const [label, signature] of [["导出 PDF", "%PDF"], ["全部打包", "PK"]]) {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const file = await download;
    assert.equal(await file.failure(), null);
    const data = await readFile(await file.path());
    assert.equal(data.subarray(0, signature.length).toString(), signature);
    await page.locator(".loading-layer").waitFor({ state: "hidden" });
  }
  await page.getByLabel("更多导出选项").click();
  await page.getByRole("tab", { name: "模板", exact: true }).click();
  for (const name of ["轻盈角标", "经典日期", "时光留白", "成长日记", "纯白画廊", "旅行明信片"]) {
    await page.locator(".inspector .studio-template-grid > button").filter({ hasText: name }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "保存图片", exact: true }).click();
    assert.equal(await (await download).failure(), null);
    await page.locator(".loading-layer").waitFor({ state: "hidden" });
  }
  await mkdir(".screenshots", { recursive: true });
  await page.screenshot({ path: ".screenshots/release-desktop.png", fullPage: true });
  for (const width of [375, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Overflow at ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".screenshots/release-mobile.png", fullPage: true });
  await page.context().setOffline(true);
  page.once("dialog", dialog => dialog.accept());
  await page.reload();
  await page.locator(".home-example img").waitFor();
  await page.locator('input[type="file"]').setInputFiles("public/studio/sample-scenes.webp");
  await page.locator(".photo-frame img").waitFor();
  await page.getByRole("tab", { name: "文字", exact: true }).click();
  assert.equal(await page.getByPlaceholder("未读取到拍摄时间，可手动填写").inputValue(), "");
  assert.deepEqual(errors, []);
  const mobile = await browser.newContext({ ...devices["iPhone 13"], serviceWorkers: "block" });
  const phone = await mobile.newPage();
  phone.on("pageerror", error => errors.push(error.message));
  await phone.goto(origin);
  await phone.locator('input[type="file"]').setInputFiles("Tests/fixtures/landscape.jpg");
  await phone.locator(".loading-layer").waitFor({ state: "hidden" });
  for (const viewport of [{ width: 390, height: 844 }, { width: 932, height: 430 }]) {
    await phone.setViewportSize(viewport);
    const input = phone.getByPlaceholder("例如：杭州 西湖");
    await input.tap();
    await input.fill(`输入焦点测试 ${viewport.width}`);
    // Wait beyond the preview debounce and delayed import focus callbacks.
    await phone.waitForTimeout(400);
    assert.equal(await input.evaluate(element => document.activeElement === element), true);
    const previewBefore = await phone.locator(".photo-frame img").getAttribute("src");
    await input.fill(`连续输入 ${viewport.width}`);
    await phone.waitForTimeout(400);
    assert.equal(await phone.locator(".photo-frame img").getAttribute("src"), previewBefore);
    await phone.getByRole("tab", { name: "文字", exact: true }).tap();
    await phone.waitForFunction(previous => document.querySelector(".photo-frame img")?.getAttribute("src") !== previous, previewBefore);
    await phone.getByRole("button", { name: "保存到相册", exact: true }).tap();
    await phone.getByRole("dialog").waitFor();
    await phone.getByRole("button", { name: "关闭保存窗口" }).tap();
    await phone.getByRole("dialog").waitFor({ state: "detached" });
    assert.equal(await phone.evaluate(() => document.body.style.overflow), "");
    await input.tap();
    await input.fill("关闭保存窗口后仍可编辑");
    assert.equal(await input.evaluate(element => document.activeElement === element), true);
    await phone.getByRole("tab", { name: "文字", exact: true }).tap();
  }
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log("iPhone emulation: portrait/landscape focus, deferred preview, and editing after dialog close passed (not a physical keyboard test).");
  console.log("Production assets, EXIF and missing-date import, privacy toggles, six templates, JPEG/PDF/ZIP, mobile overflow and offline reload passed.");
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
