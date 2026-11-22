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
const { getOfflineRegion, reverseGeocode } = await source("src/services/location.ts");

test("AMap fallback uses JSON and a fresh timeout without switching providers", async () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const oldFetch = globalThis.fetch;
  const requests = [];
  try {
    globalThis.window = { setTimeout: () => 1, clearTimeout: () => {} };
    globalThis.document = {
      createElement: () => ({ remove() {} }),
      head: { appendChild(script) { assert.ok(new URL(script.src).searchParams.has("callback")); script.onerror(); } },
    };
    globalThis.fetch = async (url, options) => {
      requests.push(url);
      assert.equal(new URL(url).searchParams.has("callback"), false);
      assert.equal(options.signal.aborted, false);
      return { ok: true, json: async () => ({ status: "1", regeocode: { addressComponent: { city: "杭州" } } }) };
    };
    const input = { latitude: 30, longitude: 120, settings: { provider: "amap", amapKey: "", privacyLevel: "cityOnly", fields: [] } };
    assert.equal(await reverseGeocode(input), undefined);
    assert.equal(requests.length, 0);
    assert.equal(await reverseGeocode({ ...input, settings: { ...input.settings, amapKey: "test" } }), "杭州");
    assert.equal(requests.length, 1);
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    globalThis.fetch = oldFetch;
  }
});
const { renderWatermark, drawIcon, buildWatermarkLines } = await source("src/services/watermark.ts");
const { defaultTemplates } = await source("src/data/templates.ts");
const storage = await source("src/utils/storage.ts");
const { formatCaptureDate, babyAgeText, parseCaptureDate } = await source("src/utils/date.ts");

test("edited capture dates drive age, including photos without EXIF", () => {
  const style = { ...defaultTemplates[0].style, showBabyAge: true };
  const baby = { name: "宝宝", birthday: "2024-01-31" };
  const photo = { meta: { capturedAt: new Date(2020, 0, 1) }, editedDateText: "2024-03-01 10:30" };
  assert.equal(buildWatermarkLines(photo, style, baby)[0].text, "宝宝 · 1个月1天");
  assert.equal(buildWatermarkLines({ ...photo, meta: {}, editedDateText: "2026年1月31日" }, style, baby)[0].text, "宝宝 · 2岁0个月");
  for (const text of ["", "自定义日期", "2026-02-30", "2026-13-01", "2026-01-01 24:01"]) {
    assert.equal(parseCaptureDate(text), undefined);
    assert.equal(buildWatermarkLines({ ...photo, editedDateText: text }, style, baby)[0].text, "宝宝");
  }
  for (const text of ["2024-02-29", "2024.02.29", "2024/2/29", "2024年2月29日 09:10"]) {
    assert.equal(parseCaptureDate(text)?.getDate(), 29);
  }
});

test("month-end birthdays never produce negative age days", () => {
  assert.equal(babyAgeText("2026-01-31", new Date(2026, 2, 1)), "1个月1天");
  assert.equal(babyAgeText("2024-01-31", new Date(2024, 1, 29)), "1个月0天");
  assert.equal(babyAgeText("2024-02-29", new Date(2025, 1, 28)), "1岁0个月");
  assert.equal(babyAgeText("2026-01-31", new Date(2026, 0, 31)), "第 1 天");
});

test("missing or invalid EXIF dates stay empty instead of becoming today", () => {
  assert.equal(formatCaptureDate(), "");
  assert.equal(formatCaptureDate(new Date("invalid")), "");
  assert.equal(formatCaptureDate(new Date(2026, 8, 23, 10, 5)), "2026年9月23日 10:05");
});

test("new users do not export the demo baby's identity", () => {
  assert.deepEqual(storage.loadBabyProfile(), { name: "", birthday: "" });
});
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
    [0.03, "#ffffff"], [0.048, "#ffffff"], [0.034, "#252827"], [0.032, "#65494e"], [0.034, "#252827"],
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
test("manual location memory matches nearby coordinates but never another spot in the same city", () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  storage.saveLocationAlias(30.27, 120.15, "西湖", "浙江|杭州");
  assert.equal(storage.loadLocationAlias(30.2701, 120.1501, "浙江|杭州"), "西湖");
  assert.equal(storage.loadLocationAlias(30.5, 120.4, "浙江|杭州"), undefined);
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
      toBlob: (callback, type) => { canvas.outputWidth = canvas.width; canvas.outputHeight = canvas.height; callback(new Blob(["test"], { type })); },
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
    assert.equal(canvas.outputWidth, 600);
    assert.equal(canvas.width, 1);
    assert.equal(canvas.height, 1);
    const margin = (10 / 25.4) * 300;
    assert.equal(labels.length, 5);
    for (const line of labels) {
      assert.ok(line.x >= margin);
      assert.ok(line.x + line.maxWidth <= canvas.outputWidth - margin + 0.01);
      assert.ok(line.y - line.fontSize / 2 >= margin);
      assert.ok(line.y + line.fontSize / 2 <= canvas.outputHeight - margin);
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
        toBlob: (callback, type) => { canvas.outputWidth = canvas.width; canvas.outputHeight = canvas.height; callback(new Blob(["test"], { type })); },
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
          const expected = { postcard: 5, film: 3, camera: 3 }[template.style.frame] ?? 2;
          assert.equal(labels.length, expected, template.id);
          const margin = (10 / 25.4) * 300;
          for (const label of labels) {
            const left =
              label.align === "right"
                ? label.x - label.width
                : label.align === "center"
                  ? label.x - label.width / 2
                  : label.x;
            assert.ok(left >= margin - 0.01);
            assert.ok(left + label.width <= canvas.outputWidth - margin + 0.01);
            assert.ok(label.y - label.font / 2 >= margin);
            assert.ok(label.y + label.font / 2 <= canvas.outputHeight - margin);
          }
        }
      }
    });
  }
}

test("template order and default match the requested catalogue", () => {
  assert.deepEqual(
    defaultTemplates.slice(0, 4).map((item) => item.name),
    ["轻盈角标", "电影字幕", "时光留白", "成长日记"],
  );
  assert.deepEqual(
    defaultTemplates.slice(4).map((item) => item.name),
    ["纯白画廊", "旅行明信片", "胶片日期", "拍立得", "相机参数", "杂志大字"],
  );
  assert.ok(defaultTemplates.every(item => !["noir", "film"].includes(item.style.frame)));
  assert.equal(defaultTemplates[0].style.layout, "overlay");
  assert.equal(new Set(defaultTemplates.map((item) => item.id)).size, defaultTemplates.length);
});

test("mini program swaps the EXIF camera bar for the life info bar", async () => {
  const { allTemplates, defaultTemplates } = await source("src/data/templates.ts");
  const mp = allTemplates.filter((item) => item.platform !== "web").map((item) => item.id);
  assert.ok(!mp.includes("camera-bar") && mp.includes("info-bar"));
  assert.ok(!defaultTemplates.some((item) => item.id === "info-bar"));
  assert.equal(mp.length, defaultTemplates.length);
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
      assert.ok(Math.abs(box.width - 2 * box.inset - width) < 1e-6);
      assert.ok(Math.abs(box.height - box.top - box.footer - height) < 1e-6);
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

test("overlay styles keep every label inside the print-safe area", async () => {
  for (const id of ["film-date", "big-date"]) {
    for (const position of ["top-left", "top-center", "bottom-right", "bottom-left"]) {
      let font = "";
      const labels = [];
      const context = new Proxy({
        measureText: (text) => ({ width: Array.from(text).length * Number(font.match(/[\d.]+(?=px)/)?.[0] ?? 12) }),
        fillText: (text, x, y, maxWidth) => labels.push({ text, x, y, maxWidth, size: Number(font.match(/[\d.]+(?=px)/)?.[0]) }),
        createLinearGradient: () => ({ addColorStop() {} }),
      }, {
        get: (target, key) => key === "font" ? font : (target[key] ?? (() => {})),
        set: (target, key, value) => { if (key === "font") font = value; else target[key] = value; return true; },
      });
      const canvas = { width: 0, height: 0, getContext: () => context, toBlob: (callback, type) => { canvas.outputWidth = canvas.width; canvas.outputHeight = canvas.height; callback(new Blob(["x"], { type })); } };
      globalThis.document = { createElement: () => canvas };
      globalThis.Image = class { naturalWidth = 4000; naturalHeight = 3000; set src(_) { queueMicrotask(() => this.onload()); } };
      const style = { ...defaultTemplates.find((item) => item.id === id).style, position, fontSizeRatio: 0.07 };
      await renderWatermark({
        photo: { previewUrl: "x", editedDateText: "2026年9月21日 12:00", editedLocationText: "很长的地点".repeat(20), editedCoordinateText: "", eventNote: "生日", meta: {} },
        style, babyProfile: { name: "", birthday: "" }, outputFormat: "png",
        printSettings: { size: "5", fit: "cover", marginMm: 5 },
      });
      const margin = (5 / 25.4) * 300;
      assert.ok(labels.length >= 1, id);
      for (const label of labels) {
        assert.ok(label.x >= margin - 0.01, `${id} ${position} left`);
        assert.ok(label.x + label.maxWidth <= canvas.outputWidth - margin + 0.01, `${id} ${position} right`);
        assert.ok(label.y - label.size / 2 >= margin - 0.01, `${id} ${position} top`);
        assert.ok(label.y + label.size / 2 <= canvas.outputHeight - margin + 0.01, `${id} ${position} bottom`);
      }
    }
  }
});

test("date formats and film date text", async () => {
  const { formatDateAs, parseAnyDate, filmDateText } = await source("src/utils/date.ts");
  const date = new Date(2026, 8, 2, 7, 5);
  assert.equal(formatDateAs(date, "dot"), "2026.09.02");
  assert.equal(formatDateAs(date, "dash"), "2026-09-02 07:05");
  assert.equal(formatDateAs(date, "english"), "Sep 2, 2026");
  assert.equal(formatDateAs(date, "date"), "2026年9月2日");
  assert.equal(parseAnyDate("Sep 2, 2026").getDate(), 2);
  assert.equal(parseAnyDate("Feb 30, 2026"), undefined);
  assert.equal(filmDateText(date), "'26 9 02");
});

test("camera names drop redundant brands", async () => {
  const { cameraName } = await source("src/services/watermark-frame.ts");
  assert.equal(cameraName({ cameraMake: "Apple", cameraModel: "iPhone 16 Pro" }), "iPhone 16 Pro");
  assert.equal(cameraName({ cameraMake: "Canon", cameraModel: "Canon EOS R6" }), "Canon EOS R6");
  assert.equal(cameraName({ cameraMake: "SONY", cameraModel: "ILCE-7M4" }), "SONY ILCE-7M4");
  assert.equal(cameraName({}), "");
});

test("baby age works with every offered date format", async () => {
  const { buildWatermarkLines } = await source("src/services/watermark.ts");
  const { dateFormats, formatDateAs } = await source("src/utils/date.ts");
  const style = { ...defaultTemplates[0].style, showBabyAge: true };
  const at = new Date(2026, 8, 22, 16, 30);
  for (const format of dateFormats) {
    const photo = { editedDateText: formatDateAs(at, format.id), editedLocationText: "", editedCoordinateText: "", eventNote: "", meta: {} };
    const lines = buildWatermarkLines(photo, style, { name: "小满", birthday: "2024-08-01" });
    assert.equal(lines[0].text, "小满 · 2岁1个月", format.id);
  }
});

test("light EXIF reader matches exifr on the import fixtures", async () => {
  const { readFile } = await import("node:fs/promises");
  const { readJpegInfo } = await source("src/utils/exif-lite.ts");
  const exifr = (await import("exifr")).default;
  for (const [name, width, height] of [["landscape", 1600, 1000], ["portrait", 1000, 1600]]) {
    const bytes = await readFile(`Tests/fixtures/${name}.jpg`);
    const info = readJpegInfo(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const reference = await exifr.parse(bytes, { gps: true });
    assert.equal(info.meta.capturedAt.getTime(), reference.DateTimeOriginal.getTime());
    assert.ok(Math.abs(info.meta.latitude - reference.latitude) < 1e-9);
    assert.ok(Math.abs(info.meta.longitude - reference.longitude) < 1e-9);
    assert.equal(info.storedWidth, width);
    assert.equal(info.storedHeight, height);
    assert.equal(info.orientation, 1);
  }
});

test("light EXIF reader handles big-endian camera tags, orientation and junk", async () => {
  const { readJpegInfo } = await source("src/utils/exif-lite.ts");
  // Big-endian TIFF: IFD0 {Make, Model, Orientation=6, ExifIFD}; ExifIFD {DateTimeOriginal, ExposureTime, FNumber, ISO, FocalLength}
  const tiff = [];
  const u16 = (v) => tiff.push(v >> 8, v & 255);
  const u32 = (v) => tiff.push(v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255);
  const make = "Apple\0", model = "iPhone 16 Pro\0", date = "2026:09:22 16:30:05\0";
  const ifd0 = 8, ifd0Size = 2 + 4 * 12 + 4;
  const makeAt = ifd0 + ifd0Size, modelAt = makeAt + make.length, exifAt = modelAt + model.length;
  const exifSize = 2 + 5 * 12 + 4;
  const dateAt = exifAt + exifSize, ratAt = dateAt + date.length;
  tiff.push(0x4d, 0x4d); u16(42); u32(ifd0);
  u16(4);
  u16(0x010f); u16(2); u32(make.length); u32(makeAt);
  u16(0x0110); u16(2); u32(model.length); u32(modelAt);
  u16(0x0112); u16(3); u32(1); u16(6); u16(0);
  u16(0x8769); u16(4); u32(1); u32(exifAt);
  u32(0);
  for (const c of make + model) tiff.push(c.charCodeAt(0));
  u16(5);
  u16(0x9003); u16(2); u32(date.length); u32(dateAt);
  u16(0x829a); u16(5); u32(1); u32(ratAt);
  u16(0x829d); u16(5); u32(1); u32(ratAt + 8);
  u16(0x8827); u16(3); u32(1); u16(80); u16(0);
  u16(0x920a); u16(5); u32(1); u32(ratAt + 16);
  u32(0);
  for (const c of date) tiff.push(c.charCodeAt(0));
  u32(1); u32(640); u32(18); u32(10); u32(24); u32(1);
  const app1 = [...Buffer.from("Exif\0\0"), ...tiff];
  const sof = [0xff, 0xc0, 0, 11, 8, 0x0b, 0xb8, 0x0f, 0xa0, 1, 1, 0x11, 0];
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 255, ...app1, ...sof, 0xff, 0xd9]);
  const info = readJpegInfo(jpeg.buffer);
  assert.equal(info.meta.cameraMake, "Apple");
  assert.equal(info.meta.cameraModel, "iPhone 16 Pro");
  assert.equal(info.orientation, 6);
  assert.equal(info.meta.capturedAt.getTime(), new Date(2026, 8, 22, 16, 30, 5).getTime());
  assert.equal(info.meta.exposure, "24mm  f/1.8  1/640s  ISO80");
  assert.equal(info.storedWidth, 4000);
  assert.equal(info.storedHeight, 3000);
  // Truncated input and non-JPEG bytes never throw.
  assert.deepEqual(readJpegInfo(jpeg.buffer.slice(0, 40)).meta.capturedAt, undefined);
  assert.equal(readJpegInfo(new Uint8Array([137, 80, 78, 71]).buffer).orientation, 1);
});

test("map picks become short place labels", async () => {
  const { placeLabel } = await source("src/utils/place.ts");
  assert.equal(placeLabel("西湖风景区", "浙江省杭州市西湖区龙井路1号"), "杭州 西湖风景区");
  assert.equal(placeLabel("故宫博物院", "北京市东城区景山前街4号"), "北京 故宫博物院");
  assert.equal(placeLabel("杭州东站", "浙江省杭州市上城区天城路1号"), "杭州东站");
  assert.equal(placeLabel("大理古城", "云南省大理白族自治州大理市复兴路"), "大理古城");
  assert.equal(placeLabel("龙井路1号", "浙江省杭州市西湖区龙井路1号"), "杭州 西湖区");
  assert.equal(placeLabel("", "广东省深圳市南山区"), "深圳");
  assert.equal(placeLabel("维多利亚港", "香港特别行政区油尖旺区"), "维多利亚港");
});

test("collage grid fits every cell inside the page and centers a short last row", async () => {
  const { collageGeometry, drawCollage } = await source("src/services/collage.ts");
  for (const count of [2, 3, 4, 5, 7, 9, 12]) {
    const g = collageGeometry(count, { layout: "grid", title: "成长", subtitle: "2025 — 2026", width: 1800 });
    assert.equal(g.cells.length, count);
    assert.equal(g.columns, count <= 4 ? 2 : 3);
    for (const cell of g.cells) {
      assert.ok(cell.x >= g.pad - 0.01 && cell.x + cell.width <= g.width - g.pad + 0.01, `x in bounds for ${count}`);
      assert.ok(cell.y >= g.pad + g.header - 0.01 && cell.y + cell.height <= g.height - g.footer + 0.01, `y in bounds for ${count}`);
    }
    const last = g.cells.at(-1);
    const lastRow = g.cells.filter((cell) => cell.y === last.y);
    const left = lastRow[0].x - g.pad;
    const right = g.width - g.pad - (last.x + last.width);
    assert.ok(Math.abs(left - right) < 0.01, `last row centered for ${count}`);
  }
  const compare = collageGeometry(2, { layout: "compare", title: "", subtitle: "", width: 1600 });
  assert.equal(compare.header, 0);
  assert.ok(compare.cells[0].height > compare.cells[0].width);

  const calls = [];
  const ctx = new Proxy({ measureText: (text) => ({ width: text.length * 10 }) }, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => calls.push([key, ...args]);
    },
    set() { return true; },
  });
  const image = { width: 400, height: 300 };
  const g = collageGeometry(3, { layout: "grid", title: "标题", subtitle: "", width: 900 });
  drawCollage(ctx, { width: g.width, height: g.height }, [{ image, label: "3个月" }, { image, label: "" }, { image, label: "1岁" }], { layout: "grid", title: "标题", subtitle: "", theme: "cream", width: 900 });
  const draws = calls.filter(([name]) => name === "drawImage");
  assert.equal(draws.length, 3);
  for (const [, , sx, sy, sw, sh] of draws) {
    // Cover crop stays inside the source image.
    assert.ok(sx >= 0 && sy >= 0 && sx + sw <= 400.01 && sy + sh <= 300.01);
  }
  const texts = calls.filter(([name]) => name === "fillText").map(([, text]) => text);
  assert.deepEqual(texts, ["标题", "3个月", "1岁", "时光印记 · TIME IMPRINT"]);
});

test("every collage layout keeps photos inside the page at its size limits", async () => {
  const { collageGeometry, collageLimits, drawCollage } = await source("src/services/collage.ts");
  const ctx = new Proxy({ measureText: (text) => ({ width: text.length * 10 }) }, {
    get(target, key) {
      if (key in target) return target[key];
      return () => {};
    },
    set() { return true; },
  });
  for (const [layout, { min, max }] of Object.entries(collageLimits)) {
    for (const count of new Set([min, Math.ceil((min + max) / 2), max])) {
      const options = { layout, title: "标题", subtitle: "副标题", theme: "pink", width: 1800 };
      const g = collageGeometry(count, options);
      assert.equal(g.cells.filter(Boolean).length, count, `${layout} ${count}`);
      for (const cell of g.cells) {
        const box = cell.card ?? cell;
        assert.ok(box.x >= g.pad - 0.01 && box.x + box.width <= g.width - g.pad + 0.01, `${layout} ${count} x`);
        assert.ok(box.y >= g.pad + g.header - 0.01 && box.y + box.height <= g.height - g.footer + 0.01, `${layout} ${count} y`);
      }
      const image = { width: 400, height: 300 };
      drawCollage(ctx, g, Array.from({ length: count }, () => ({ image, label: "1岁" })), options);
    }
  }
});
