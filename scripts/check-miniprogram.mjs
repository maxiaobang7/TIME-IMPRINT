// Smoke test for the built mini program: loads the page bundles with a mocked
// `wx` runtime and drives import → edit → save, failing on any runtime error.
// Real rendering and device behaviour still need WeChat DevTools / a phone.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import vm from "node:vm";

const fixture = "Tests/fixtures/landscape.jpg";
const calls = [];
const storage = new Map();
const pages = {};

function fakeContext(canvas) {
  const state = { font: "10px sans-serif", fillStyle: "#000", strokeStyle: "#000" };
  return new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "measureText") return (text) => {
        const size = Number(/(\d+(?:\.\d+)?)px/.exec(target.font)?.[1] ?? 10);
        return { width: String(text).length * size * 0.6 };
      };
      if (key === "createLinearGradient") return () => ({ addColorStop() {} });
      if (key === "drawImage") return (image, ...args) => {
        assert.ok(image && image.width > 0, "drawImage got an unloaded image");
        calls.push(["drawImage", canvas.id, ...args.map(Math.round)]);
      };
      if (key === "fillText") return (text, x, y, maxWidth) => {
        assert.ok(Number.isFinite(x) && Number.isFinite(y), `bad text position for ${text}`);
        if (maxWidth !== undefined) assert.ok(maxWidth > 0, `non-positive maxWidth for ${text}`);
        calls.push(["fillText", canvas.id, String(text)]);
      };
      return () => {};
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
}

function fakeCanvas(id) {
  const canvas = {
    id,
    width: 300,
    height: 150,
    getContext: () => fakeContext(canvas),
    createImage() {
      const image = { width: 0, height: 0 };
      Object.defineProperty(image, "src", {
        set(path) {
          setTimeout(() => {
            if (!path.endsWith(".jpg")) return image.onerror?.();
            Object.assign(image, { width: 1600, height: 1000 });
            image.onload();
          }, 1);
        },
      });
      return image;
    },
  };
  return canvas;
}

const canvases = { "#preview": fakeCanvas("preview"), "#work": fakeCanvas("work"), "#collage": fakeCanvas("collage"), "#collage-work": fakeCanvas("collage-work") };
let handedOver;
const ok = (value) => Promise.resolve(value);
const wx = {
  getStorageSync: (key) => storage.get(key) ?? "",
  setStorageSync: (key, value) => storage.set(key, JSON.parse(JSON.stringify(value))),
  getWindowInfo: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 3 }),
  showLoading: () => {},
  hideLoading: () => {},
  showToast: (options) => calls.push(["toast", options.title]),
  showModal: () => ok({ confirm: false }),
  openSetting: () => ok({}),
  pageScrollTo: () => {},
  navigateTo: (options) => {
    calls.push(["navigateTo", options.url]);
    options.success?.({ eventChannel: { emit: (name, payload) => (handedOver = { name, payload: structuredClone(payload) }) } });
    return ok({});
  },
  chooseLocation: () => ok({ name: "西湖风景区", address: "浙江省杭州市西湖区龙井路1号", latitude: 30.2431, longitude: 120.1498 }),
  chooseMedia: () => ok({ tempFiles: [{ tempFilePath: fixture }] }),
  getImageInfo: ({ src }) => (src.endsWith(".jpg") ? ok({ width: 1600, height: 1000, orientation: "up" }) : Promise.reject({ errMsg: "getImageInfo:fail" })),
  getFileSystemManager: () => ({
    statSync: (path) => ({ size: statSync(path).size }),
    readFileSync: (path, _encoding, position = 0, length = Infinity) => {
      const bytes = readFileSync(path).subarray(position, position + length);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  }),
  createOffscreenCanvas: ({ width, height }) => Object.assign(fakeCanvas("offscreen"), { width, height }),
  canvasToTempFilePath: (options) => {
    assert.ok(options.canvas && options.destWidth > 1000, "export should be full size");
    calls.push(["export", options.destWidth, options.destHeight]);
    return ok({ tempFilePath: "wxfile://tmp/out.jpg" });
  },
  saveImageToPhotosAlbum: () => { calls.push(["saved"]); return ok({}); },
  canIUse: () => true,
  showShareImageMenu: () => { calls.push(["share"]); return ok({}); },
  loadFontFace: (options) => options.success?.(),
};

function load(file) {
  let options;
  const context = {
    wx,
    console,
    setTimeout,
    clearTimeout,
    App: () => {},
    Page: (value) => (options = value),
    getApp: () => ({}),
  };
  vm.runInNewContext(readFileSync(`miniprogram/dist/${file}`, "utf8"), context, { filename: file });
  return options;
}

function instance(options) {
  const page = { ...options, data: structuredClone(options.data) };
  page.setData = (patch) => {
    for (const [key, value] of Object.entries(patch)) {
      const path = key.split(".");
      let target = page.data;
      while (path.length > 1) target = target[path.shift()];
      target[path[0]] = structuredClone(value);
    }
  };
  page.createSelectorQuery = () => {
    const nodes = [];
    return {
      select: (id) => ({ fields: () => nodes.push({ node: canvases[id] }) }),
      exec: (callback) => callback(nodes),
    };
  };
  return page;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
const event = (dataset = {}, detail = {}, type = "tap") => ({ currentTarget: { dataset }, detail, type });

load("app.js");
pages.home = instance(load("pages/home/index.js"));
pages.home.onLoad();
pages.home.onChoose(event({ id: "film-date" }));
assert.equal(pages.home.data.templateId, "film-date");
await pages.home.onPick();
assert.ok(calls.some(([name, url]) => name === "navigateTo" && url.includes("paths=")));

const editor = instance(load("pages/editor/index.js"));
const query = { paths: encodeURIComponent(JSON.stringify([fixture, "missing.png"])) };
editor.onLoad(query);
assert.equal(editor.data.templateId, "film-date", "editor should open with the template picked on home");
editor.onReady();
await settle();
assert.equal(editor.data.thumbs.length, 1, "the unreadable file is skipped");
assert.ok(calls.some(([name, title]) => name === "toast" && /1 张照片无法读取/.test(title)));
assert.equal(editor.data.text.date, "2026年9月21日 10:30", "EXIF date is read");
assert.equal(editor.data.text.location, "浙江省 杭州市", "GPS is matched to a city offline");
assert.ok(editor.data.previewW > 300 && editor.data.previewH > 100, "preview is sized to the screen");
assert.ok(calls.some(([name, id, text]) => name === "fillText" && id === "preview" && text === "'26 9 21"), "film date is drawn");

// Every template renders without throwing.
for (const template of editor.data.templates) {
  editor.onTemplate(event({ id: template.id }));
  await settle();
}
editor.onTemplate(event({ id: "growth-steps" }));
editor.onBirthday(event({}, { value: "2025-06-01" }));
await settle();
assert.equal(editor.data.text.ageHint, "1岁3个月");
assert.ok(calls.some(([name, , text]) => name === "fillText" && /1岁3个月/.test(text)));

editor.onDateFormat(event({ id: "english" }));
assert.equal(editor.data.text.date, "Sep 21, 2026");
editor.onDateFormat(event({ id: "full" }));
assert.equal(editor.data.text.date, "2026年9月21日 10:30", "switching back restores the EXIF time");

editor.onText(event({ field: "eventNote" }, { value: "第一次看海" }));
editor.onSlide(event({ key: "fontSizeRatio" }, { value: 40 }, "change"));
editor.onTab(event({ id: "style" }));
await settle();

await editor.onAdd();
await settle();
assert.equal(editor.data.thumbs.length, 2);
editor.onSelect(event({ index: 0 }));
editor.onSync(event({ field: "eventNote" }));
editor.onSelect(event({ index: 1 }));
assert.equal(editor.data.text.event, "第一次看海", "sync copies the note to every photo");

await editor.onSave();
await editor.onSaveAll();
await editor.onShare();
const exports = calls.filter(([name]) => name === "export");
assert.equal(exports.length, 4, "one export per save/share");
assert.equal(calls.filter(([name]) => name === "saved").length, 3);
assert.ok(calls.some(([name]) => name === "share"));

// Saving remembers what was used; a tap on a recent chip fills it back in.
assert.deepEqual(editor.data.recent.location, ["浙江省 杭州市"]);
assert.deepEqual(editor.data.recent.event, ["第一次看海"]);
assert.equal(editor.data.recent.date[0].value, "2026-09-21");
editor.onText(event({ field: "editedLocationText" }, { value: "" }));
editor.onText(event({ field: "eventNote" }, { value: "" }));
editor.onRecent(event({ kind: "location", value: "浙江省 杭州市" }));
editor.onRecent(event({ kind: "event", value: "第一次看海" }));
editor.onRecent(event({ kind: "date", value: "2026-09-21" }));
assert.equal(editor.data.text.location, "浙江省 杭州市");
assert.equal(editor.data.text.event, "第一次看海");
assert.match(editor.data.text.date, /^2026年9月21日/);

// Map pick fills a short place name and the coordinates.
await editor.onMap();
assert.equal(editor.data.text.location, "杭州 西湖风景区");
assert.equal(editor.data.text.coordinate, "30.24310°, 120.14980°");

// Print size: a landscape photo on 6-inch paper is 1800 × 1200 at 300 DPI.
editor.onPrint(event({ key: "size", id: "6" }));
editor.onPrint(event({ key: "fit", id: "cover" }));
assert.deepEqual(editor.data.print, { size: "6", fit: "cover", marginMm: 3 });
await settle();
await editor.onSave();
assert.deepEqual(calls.filter(([name]) => name === "export").at(-1), ["export", 1800, 1200]);
editor.onPrint(event({ key: "size", id: "original" }));

// Collage: the editor hands its photos over; the page renders, switches layouts and exports.
editor.onCollage();
assert.ok(calls.some(([name, url]) => name === "navigateTo" && url === "/pages/collage/index"));
assert.equal(handedOver?.name, "photos");
assert.equal(handedOver.payload.length, 2);
const collage = instance(load("pages/collage/index.js"));
collage.getOpenerEventChannel = () => ({ on: (name, callback) => name === handedOver.name && callback(handedOver.payload) });
collage.onLoad();
collage.onReady();
await settle();
assert.equal(collage.data.ready, true);
assert.equal(collage.data.count, 2);
assert.equal(collage.data.labelMode, "age", "a saved birthday labels tiles by age");
assert.ok(calls.some(([name, id, text]) => name === "fillText" && id === "collage" && text === "1岁3个月"), "age badge drawn");
assert.ok(calls.some(([name, id, text]) => name === "fillText" && id === "collage" && text === "成长记录"), "default title drawn");
collage.onTile(event({ key: collage.data.tiles[1].key }));
assert.equal(collage.data.count, 1);
collage.onTile(event({ key: collage.data.tiles[1].key }));
collage.onLayout(event({ id: "compare" }));
collage.onTheme(event({ id: "dark" }));
collage.onLabel(event({ id: "date" }));
collage.onTitle(event({}, { value: "去年 · 今年" }));
await settle();
assert.equal(collage.data.count, 2);
assert.ok(calls.some(([name, id, text]) => name === "fillText" && id === "collage" && text === "2026.09.21"));
for (const { id } of collage.data.layouts) {
  collage.onLayout(event({ id }));
  await settle();
  assert.equal(collage.data.layout, id);
}
for (const { id } of collage.data.themes) collage.onTheme(event({ id }));
collage.onOrder(event({ id: "desc" }));
const dropped = collage.data.tiles[0].key;
collage.onTile(event({ key: dropped }));
await collage.onAdd();
await settle();
assert.equal(collage.data.tiles.length, 3);
assert.equal(collage.data.count, 2, "adding photos keeps the earlier choice and selects the new one");
assert.equal(collage.data.tiles.find((tile) => tile.key === dropped).selected, false);
// Dating a photo by hand re-sorts the collage: the newest date moves to the end.
const first = collage.data.tiles[0];
collage.onTileDate(event({ key: first.key }, { value: "2026-11-01" }));
assert.equal(collage.data.tiles.at(-1).key, first.key);
assert.equal(collage.data.tiles.at(-1).label, "2026.11.01");
assert.equal(collage.data.tiles.at(-1).iso, "2026-11-01");
collage.onLayout(event({ id: "hero" }));
await settle();
assert.equal(collage.data.count, 3, "hero needs three photos and takes all three");
assert.ok(collage.data.tiles.every((tile) => tile.selected && tile.order >= 1), "every photo has a place");
collage.onLayout(event({ id: "compare" }));
await settle();
await collage.onSave();
const collageExport = calls.filter(([name]) => name === "export").at(-1);
assert.equal(collageExport[1], 1800);
await collage.onShare();
collage.onUnload();

editor.onRemove();
editor.onRemove();
assert.equal(editor.data.hasPhotos, false);
editor.onUnload();
console.log(`Mini program smoke test passed (${calls.length} recorded calls).`);
