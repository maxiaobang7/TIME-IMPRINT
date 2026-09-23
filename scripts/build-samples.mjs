import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright";

const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: "chromium", headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  const assets = await page.evaluate(async () => {
    const { loadSamplePhoto, sampleBaby } = await import("/src/services/sample.ts");
    const { defaultTemplates } = await import("/src/data/templates.ts");
    const { renderWatermark } = await import("/src/services/watermark.ts");
    const results = [];
    for (const template of defaultTemplates) {
      const photo = await loadSamplePhoto(template.id);
      for (const [suffix, edge] of [["", 1200], ["-thumb", 420]]) {
        const blob = await renderWatermark({ photo, style: template.style, babyProfile: sampleBaby, outputFormat: "jpeg", maxEdge: edge });
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d").drawImage(bitmap, 0, 0);
        bitmap.close();
        results.push({ name: `${template.id}${suffix}.webp`, data: canvas.toDataURL("image/webp", 0.86).split(",")[1] });
        canvas.width = canvas.height = 1;
      }
    }
    return results;
  });
  await mkdir("public/studio/previews", { recursive: true });
  for (const asset of assets) await writeFile(`public/studio/previews/${asset.name}`, Buffer.from(asset.data, "base64"));
  console.log(`Generated ${assets.length} static template previews.`);
} finally {
  await browser?.close();
  await server.close();
}
