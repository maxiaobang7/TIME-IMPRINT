import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

async function source(path) {
  const output = await build({
    entryPoints: [path],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
  );
}
const { printLayout } = await source("src/services/print-layout.ts");
const { getOfflineRegion } = await source("src/services/location.ts");
const { renderWatermark, drawIcon } = await source("src/services/watermark.ts");
const { defaultTemplates } = await source("src/data/templates.ts");
const storage = await source("src/utils/storage.ts");
const { withPrintDensity } = await source("src/services/image-density.ts");
const { isAppleMobile, canShareImage, shareBlob } = await source("src/services/export.ts");

test("album save detects iPhone and desktop-mode iPad without changing desktop or Android", () => {
  assert.equal(isAppleMobile({ userAgent: "Mozilla iPhone", platform: "iPhone", maxTouchPoints: 5 }), true);
  assert.equal(isAppleMobile({ userAgent: "Mozilla Macintosh", platform: "MacIntel", maxTouchPoints: 5 }), true);
  assert.equal(isAppleMobile({ userAgent: "Mozilla Macintosh", platform: "MacIntel", maxTouchPoints: 0 }), false);
  assert.equal(isAppleMobile({ userAgent: "Mozilla Android", platform: "Linux", maxTouchPoints: 5 }), false);
});

test("album sharing requires secure context and file support; cancellation remains cancellation", async () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const blob = new Blob(["image"], { type: "image/jpeg" });
  let called = 0;
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: false } });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
      canShare: ({ files }) => files[0].type === "image/jpeg",
      share: () => { called++; return Promise.reject(new DOMException("cancelled", "AbortError")); },
    } });
    assert.equal(canShareImage(blob, "photo.jpg"), false);
    window.isSecureContext = true;
    assert.equal(canShareImage(blob, "photo.jpg"), true);
    const pending = shareBlob(blob, "photo.jpg");
    assert.equal(called, 1);
    await assert.rejects(pending, { name: "AbortError" });
    navigator.canShare = () => false;
    assert.equal(canShareImage(blob, "photo.jpg"), false);
    navigator.canShare = () => { throw new Error("unsupported"); };
    assert.equal(canShareImage(blob, "photo.jpg"), false);
  } finally {
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow); else delete globalThis.window;
    if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator); else delete globalThis.navigator;
  }
});
const { drawPostcard } = await source("src/services/postcard.ts");

test("postcard uses editable message and signature; empty strings stay hidden", () => {
  const labels = [];
  let arcs = 0;
  const context = new Proxy({
    measureText: text => ({ width: text.length * 20 }),
    fillText: text => labels.push(text),
    arc: () => arcs++,
  }, { get: (target, key) => target[key] ?? (() => {}), set: (target, key, value) => { target[key] = value; return true; } });
  const style = { ...defaultTemplates.find(item => item.id === "travel-postcard").style };
  const options = { style, photo: { postcardMessage: "我们一起去看海", postcardSignature: "爸爸妈妈" }, babyProfile: { name: "小满" } };
  const box = { x: 20, y: 700, width: 960, height: 120, unit: 800 };
  drawPostcard(context, options, [], box);
  assert.deepEqual(labels, ["我们一起去看海", "爸爸妈妈"]);
  assert.equal(arcs, 3);
  labels.length = 0;
  arcs = 0;
  drawPostcard(context, { ...options, style: { ...style, postcardStamp: false }, photo: { postcardMessage: "", postcardSignature: "" } }, [], box);
  assert.deepEqual(labels, []);
  assert.equal(arcs, 0);
});

test("other template font sizes and colours remain unchanged", () => {
  assert.deepEqual(defaultTemplates.slice(0, 5).map(item => [item.style.fontSizeRatio, item.style.textColor]), [
    [0.03, "#ffffff"], [0.025, "#ffffff"], [0.032, "#252827"], [0.032, "#65494e"], [0.032, "#252827"],
  ]);
});

test("watermark symbols are distinct outlined paths and clock stays unchanged", () => {
  const paths = [];
  for (const type of ["clock", "heart", "pin", "target", "star"]) {
    const calls = [];
    const ctx = new Proxy({ fillStyle: "#fff" }, {
      get: (target, key) => target[key] ?? ((...args) => calls.push([key, ...args])),
      set: (target, key, value) => { target[key] = value; return true; }
    });
    drawIcon(ctx, type, 10, 20, 30);
    assert.equal(calls.filter(call => call[0] === "fill").length, 0);
    assert.ok(calls.some(call => call[0] === "stroke"));
    assert.equal(calls[0][0], "save");
    assert.equal(calls.at(-1)[0], "restore");
    if (type === "clock") {
      assert.deepEqual(calls.find(call => call[0] === "arc"), ["arc", 25, 20, 10.799999999999999, 0, Math.PI * 2]);
      assert.equal(calls.filter(call => call[0] === "stroke").length, 2);
    }
    paths.push(JSON.stringify(calls));
  }
  assert.equal(new Set(paths).size, 5);
});

for (const [size, expected] of [
  ["3", [900, 600]],
  ["5", [1500, 1050]],
  ["6", [1800, 1200]],
]) {
  test(`${size} inch output uses 300 dpi and follows orientation`, () => {
    const landscape = printLayout(4000, 3000, {
      size,
      fit: "contain",
      marginMm: 3,
    });
    const portrait = printLayout(3000, 4000, {
      size,
      fit: "contain",
      marginMm: 3,
    });
    assert.deepEqual([landscape.width, landscape.height], expected);
    assert.deepEqual(
      [portrait.width, portrait.height],
      [...expected].reverse(),
    );
    assert.ok(Math.abs(landscape.margin - 35.433) < 0.01);
  });
}
test("contain keeps all content; cover fills the paper after centered crop", () => {
  const contain = printLayout(4000, 3000, {
    size: "6",
    fit: "contain",
    marginMm: 3,
  });
  assert.equal(contain.x, 100);
  assert.equal(contain.y, 0);
  const cover = printLayout(4000, 3000, {
    size: "6",
    fit: "cover",
    marginMm: 3,
  });
  assert.equal(cover.x, 0);
  assert.equal(cover.y, -75);
});
test("original proportion retains pixels without enlargement and caps long edge", () => {
  assert.deepEqual(
    [printLayout(6000, 4000).width, printLayout(6000, 4000).height],
    [3200, 2133],
  );
  assert.equal(printLayout(1200, 800).width, 1200);
  assert.throws(() => printLayout(0, 200));
});
test("invalid, overseas and uncovered coordinates do not invent a city", () => {
  for (const [lat, lon] of [
    [NaN, 120],
    [200, 120],
    [30, 200],
    [0, 0],
    [40, -74],
  ])
    assert.equal(getOfflineRegion(lat, lon), undefined);
  assert.ok(getOfflineRegion(30.2741, 120.1551)?.city.includes("杭州"));
});
test("manual location memory matches proximity first, then the same region", () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  storage.saveLocationAlias(30.27, 120.15, "西湖", "浙江|杭州");
  assert.equal(storage.loadLocationAlias(30.5, 120.4, "浙江|杭州"), "西湖");
  assert.equal(storage.loadLocationAlias(31, 121, "上海|上海"), undefined);
  storage.clearLocationAliases();
  assert.equal(
    storage.loadLocationAlias(30.27, 120.15, "浙江|杭州"),
    undefined,
  );
});

test("JPEG density is inserted without altering the original image data", async () => {
  const original = new Uint8Array([255, 216, 255, 217]);
  const output = new Uint8Array(
    await (
      await withPrintDensity(new Blob([original], { type: "image/jpeg" }))
    ).arrayBuffer(),
  );
  assert.deepEqual([...output.slice(0, 2)], [255, 216]);
  assert.equal(String.fromCharCode(...output.slice(6, 11)), "JFIF\0");
  assert.deepEqual([...output.slice(13, 18)], [1, 1, 44, 1, 44]);
  assert.deepEqual([...output.slice(-2)], [255, 217]);
});

test("existing JPEG density is replaced rather than duplicated", async () => {
  const jpeg = new Blob(
    [
      new Uint8Array([
        255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
        255, 217,
      ]),
    ],
    { type: "image/jpeg" },
  );
  const result = await withPrintDensity(jpeg);
  assert.equal(result.size, jpeg.size);
  const data = new Uint8Array(await result.arrayBuffer());
  assert.deepEqual([...data.slice(13, 18)], [1, 1, 44, 1, 44]);
});

test("blocked storage does not crash photo editing", () => {
  globalThis.localStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  assert.doesNotThrow(() => storage.saveStyle(defaultTemplates[0].style));
  assert.doesNotThrow(() => storage.saveLocationAlias(30, 120, "测试"));
  assert.doesNotThrow(() => storage.clearLocationAliases());
  assert.equal(storage.loadLocationSettings().provider, "offline");
});

for (const position of [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "bottom-center",
]) {
  test(`all text stays inside print-safe area at ${position}`, async () => {
    let font = "";
    const labels = [];
    const context = new Proxy(
      {
        measureText: (text) => ({
          width:
            Array.from(text).length *
            Number(font.match(/[\d.]+(?=px)/)?.[0] ?? 12),
        }),
        fillText: (text, x, y, maxWidth) =>
          labels.push({
            text,
            x,
            y,
            maxWidth,
            fontSize: Number(font.match(/[\d.]+(?=px)/)?.[0]),
          }),
      },
      {
        get: (target, key) =>
          key === "font" ? font : (target[key] ?? (() => {})),
        set: (target, key, value) => {
          if (key === "font") font = value;
          else target[key] = value;
          return true;
        },
      },
    );
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob: (callback, type) => callback(new Blob(["test"], { type })),
    };
    globalThis.document = { createElement: () => canvas };
    globalThis.Image = class {
      naturalWidth = 3000;
      naturalHeight = 4000;
      set src(_) {
        queueMicrotask(() => this.onload());
      }
    };
    const photo = {
      previewUrl: "fixture",
      editedDateText: "2026年9月21日 12:00",
      editedLocationText: "很长的地点".repeat(30),
      editedCoordinateText: "30.27, 120.15",
      eventNote: "成长记录",
      meta: {},
    };
    const blob = await renderWatermark({
      photo,
      style: {
        ...defaultTemplates.find((item) => item.id === "growth-steps").style,
        showCoordinate: true,
        layout: "overlay",
        position,
        fontSizeRatio: 0.07,
      },
      babyProfile: { name: "宝宝", birthday: "2024-05-20" },
      outputFormat: "png",
      printSettings: { size: "3", fit: "cover", marginMm: 10 },
    });
    assert.equal(blob.type, "image/png");
    assert.equal(canvas.width, 600);
    const margin = (10 / 25.4) * 300;
    assert.equal(labels.length, 5);
    for (const line of labels) {
      assert.ok(line.x >= margin);
      assert.ok(line.x + line.maxWidth <= canvas.width - margin + 0.01);
      assert.ok(line.y - line.fontSize / 2 >= margin);
      assert.ok(line.y + line.fontSize / 2 <= canvas.height - margin);
    }
  });
}

test("legacy saved styles keep overlay layout instead of invisible white paper text", () => {
  globalThis.localStorage = {
    getItem: () =>
      JSON.stringify({ textColor: "#ffffff", position: "bottom-right" }),
  };
  const style = storage.loadStyle(defaultTemplates[0].style);
  assert.equal(style.layout, "overlay");
  assert.equal(style.textColor, "#ffffff");
});

for (const size of ["3", "5", "6"]) {
  for (const landscape of [false, true]) {
    test(`paper caption stays print-safe: ${size} inch, landscape=${landscape}`, async () => {
      const labels = [];
      const state = {};
      const fontSize = () =>
        Number(state.font?.match(/[\d.]+(?=px)/)?.[0] ?? 12);
      const context = new Proxy(
        {
          measureText: (text) => ({
            width: Array.from(text).length * fontSize(),
          }),
          fillText: (text, x, y) =>
            labels.push({
              text,
              x,
              y,
              width: Array.from(text).length * fontSize(),
              font: fontSize(),
              align: state.textAlign,
            }),
        },
        {
          get: (target, key) => state[key] ?? target[key] ?? (() => {}),
          set: (_target, key, value) => {
            state[key] = value;
            return true;
          },
        },
      );
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => context,
        toBlob: (callback, type) => callback(new Blob(["test"], { type })),
      };
      globalThis.document = { createElement: () => canvas };
      globalThis.Image = class {
        naturalWidth = landscape ? 4000 : 3000;
        naturalHeight = landscape ? 3000 : 4000;
        set src(_) {
          queueMicrotask(() => this.onload());
        }
      };
      const photo = {
        previewUrl: "fixture",
        editedDateText: "2026年9月21日",
        editedLocationText: "测试地点".repeat(80),
        editedCoordinateText: "30.27, 120.15",
        eventNote: "成长记录",
        meta: {},
      };
      for (const template of defaultTemplates.filter(
        (item) => item.style.layout === "paper",
      )) {
        for (const position of [
          "bottom-left",
          "bottom-center",
          "bottom-right",
        ]) {
          labels.length = 0;
          await renderWatermark({
            photo,
            style: { ...template.style, position },
            babyProfile: { name: "宝宝", birthday: "2024-05-20" },
            outputFormat: "png",
            printSettings: { size, fit: "contain", marginMm: 10 },
          });
          assert.equal(
            labels.length,
            template.style.frame === "postcard" ? 5 : ["film", "gallery"].includes(template.style.frame) ? 3 : 2,
          );
          const margin = (10 / 25.4) * 300;
          for (const label of labels) {
            const left =
              label.align === "right"
                ? label.x - label.width
                : label.align === "center"
                  ? label.x - label.width / 2
                  : label.x;
            assert.ok(left >= margin - 0.01);
            assert.ok(left + label.width <= canvas.width - margin + 0.01);
            assert.ok(label.y - label.font / 2 >= margin);
            assert.ok(label.y + label.font / 2 <= canvas.height - margin);
          }
        }
      }
    });
  }
}

test("template order and default match the requested catalogue", () => {
  assert.deepEqual(
    defaultTemplates.slice(0, 4).map((item) => item.name),
    ["轻盈角标", "经典日期", "时光留白", "成长日记"],
  );
  assert.equal(defaultTemplates.length, 6);
  assert.ok(defaultTemplates.every(item => !["noir", "film"].includes(item.style.frame)));
  assert.equal(defaultTemplates[0].style.layout, "overlay");
  assert.equal(new Set(defaultTemplates.map((item) => item.id)).size, 6);
});

test("free-size frames add borders without changing the source image ratio", async () => {
  const { frameGeometry } = await source("src/services/watermark-frame.ts");
  for (const template of defaultTemplates.filter(
    (item) => item.style.layout === "paper",
  )) {
    for (const [width, height] of [
      [1600, 1000],
      [1000, 1600],
      [1200, 1200],
    ]) {
      const box = frameGeometry(width, height, template.style.frame);
      assert.equal(box.width - 2 * box.inset, width);
      assert.equal(box.height - box.top - box.footer, height);
    }
  }
});

test("frame controls preserve image geometry and physical paper defaults", async () => {
  const { frameGeometry, frameSpacing } = await source("src/services/watermark-frame.ts");
  for (const [size, shortMm, borderMm, footerMm] of [["3", 50.8, 3, 12], ["5", 88.9, 5, 18], ["6", 101.6, 6, 21]]) {
    const spacing = frameSpacing(shortMm * 300 / 25.4, "postcard", {}, size);
    assert.ok(Math.abs(spacing.inset * 25.4 / 300 - borderMm) < 0.001);
    assert.ok(Math.abs(spacing.footer * 25.4 / 300 - footerMm) < 0.001);
    const preview = frameSpacing(shortMm * 2, "postcard", {}, size);
    assert.ok(Math.abs(preview.inset / (shortMm * 2) - spacing.inset / (shortMm * 300 / 25.4)) < 0.00001);
  }
  for (const frameWidth of ["narrow", "standard", "wide"]) {
    for (const frameFooterScale of [0.85, 1, 1.5]) {
      const geometry = frameGeometry(1000, 1600, "postcard", { frameWidth, frameFooterScale });
      assert.ok(Math.abs(geometry.width - geometry.inset * 2 - 1000) < 0.001);
      assert.ok(Math.abs(geometry.height - geometry.top - geometry.footer - 1600) < 0.001);
    }
  }
  assert.ok(frameSpacing(1000, "postcard", { frameWidth: "wide" }).inset > frameSpacing(1000, "postcard").inset);
  assert.equal(frameSpacing(1000, "postcard", { frameFooterScale: NaN }).footer, frameSpacing(1000, "postcard").footer);
});
