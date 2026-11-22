import { collageGeometry, collageLimits, collageThemes, drawCollage, type CollageLayout, type CollageTheme } from "../../../../src/services/collage";
import { babyAgeText, formatDateAs } from "../../../../src/utils/date";
import { errorMessage, loadPhoto, pickImages, type MpPhoto } from "../../lib/photos";
import { canvasToJpeg, context2d, saveToAlbum, thumbnail } from "../../lib/render";
import { loadBaby } from "../../lib/store";
import type { Drawable } from "../../../../src/services/surface";

/** What the editor hands over, or what we read from newly picked photos. */
interface Item {
  /** Assigned here; the same file can be picked twice. */
  key?: string;
  path: string;
  width: number;
  height: number;
  orientation: number;
  dateText: string;
  /** Capture or typed date in ms; undefined when unknown. */
  time?: number;
}

type LabelMode = "age" | "date" | "none";
type Order = "asc" | "desc";
interface Thumb {
  image: Drawable;
  width: number;
  height: number;
}

const EXPORT_WIDTH = 1800;
const THUMB_EDGE = 1000;
const MAX_ITEMS = 20;

const layoutInfo: Array<{ id: CollageLayout; name: string; desc: string }> = [
  { id: "grid", name: "成长拼图", desc: "每月一张，按时间排成九宫格" },
  { id: "compare", name: "今年 · 去年", desc: "同一个地方，两年并排对比" },
  { id: "hero", name: "一大几小", desc: "最近一张做主图，下面是来时的路" },
  { id: "polaroid", name: "拍立得墙", desc: "白边相纸、手写日期，随手贴满" },
  { id: "film", name: "胶片条", desc: "黑色底片配橙色日期，复古味" },
  { id: "timeline", name: "时间轴", desc: "一条线串起每个重要的日子" },
];
const layouts = layoutInfo.map((item) => ({
  ...item,
  range: collageLimits[item.id].min === collageLimits[item.id].max ? `${collageLimits[item.id].max} 张` : `${collageLimits[item.id].min}–${collageLimits[item.id].max} 张`,
}));
const themeNames: Record<CollageTheme, string> = { cream: "米白", white: "纯白", dark: "深色", pink: "樱粉", blue: "雾蓝", green: "抹茶" };
const themes = (Object.keys(themeNames) as CollageTheme[]).map((id) => ({ id, label: themeNames[id], color: collageThemes[id].bg }));
/** Real photos from the template previews make the layout cards look like what they produce. */
const samples = ["growth-steps", "classic-date", "travel-memory", "polaroid", "film-date", "white-gallery"].map(
  (id) => `/images/templates/${id}-thumb.jpg`,
);

let items: Item[] = [];
/** Keys of the chosen items. */
let selected: string[] = [];
let keyCounter = 0;
let layout: CollageLayout = "grid";
let theme: CollageTheme = "cream";
let labelMode: LabelMode = "date";
let order: Order = "asc";
let title = "";
let subtitle = "";
let titleTouched = false;
let subtitleTouched = false;
let baby = loadBaby();
let previewCanvas: WechatMiniprogram.Canvas | undefined;
let workCanvas: WechatMiniprogram.Canvas | undefined;
let box = { width: 343, height: 300, pixelRatio: 2 };
let rendering = false;
let dirty = false;
let busy = false;

// Thumbnails are made one at a time: decoding several 12 MP photos at once runs phones out of memory.
const thumbs = new Map<string, Promise<Thumb>>();
let queue: Promise<unknown> = Promise.resolve();

function thumbOf(item: Item) {
  let thumb = thumbs.get(item.path);
  if (!thumb && previewCanvas) {
    const canvas = previewCanvas;
    thumb = queue.then(() => thumbnail(canvas, { ...item, id: item.path } as unknown as MpPhoto, THUMB_EDGE));
    queue = thumb.catch(() => undefined);
    thumb.catch(() => thumbs.delete(item.path));
    thumbs.set(item.path, thumb);
  }
  return thumb;
}

function sortItems(list: Item[]) {
  // Oldest first; photos without a date keep their order at the end.
  return list
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (a.item.time ?? Infinity) - (b.item.time ?? Infinity) || a.index - b.index)
    .map(({ item }) => item);
}

/** Chosen photos in the order they appear on the collage. */
function chosen() {
  const list = items.filter((item) => selected.includes(item.key!));
  // Comparisons always read old → new, left to right, matching the "2025 → 2026" title.
  if (order === "desc" && layout !== "compare") list.reverse();
  // "一大几小": the newest photo is the big one on top.
  if (layout === "hero" && order === "asc" && list.length) list.unshift(list.pop()!);
  return list;
}

function isoDay(time: number) {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateLabel(item: Item) {
  return item.time != null ? formatDateAs(new Date(item.time), "dot") : item.dateText;
}

function labelOf(item: Item) {
  if (labelMode === "none") return "";
  const date = item.time != null ? new Date(item.time) : undefined;
  if (labelMode === "age" && baby.birthday && date) {
    // "3个月12天" is too long for a small tile; months tell the story.
    return babyAgeText(baby.birthday, date).replace(/^(\d+个月)\d+天$/, "$1");
  }
  return dateLabel(item);
}

function month(time: number) {
  const date = new Date(time);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function defaultTitle(first?: number, last?: number) {
  const name = baby.name;
  switch (layout) {
    case "compare":
      return first != null && last != null && new Date(first).getFullYear() !== new Date(last).getFullYear()
        ? `${new Date(first).getFullYear()} → ${new Date(last).getFullYear()}`
        : "去年 · 今年";
    case "hero":
      return name ? `${name}的这一年` : "这一年";
    case "polaroid":
      return "我们的小日子";
    case "film":
      return "那些瞬间";
    case "timeline":
      return name ? `${name}的成长时间轴` : "时光轴";
    default:
      return name ? `${name}的成长` : "成长记录";
  }
}

/** Title and subtitle follow the selection until the person types their own. */
function autoText() {
  const times = items.filter((item) => selected.includes(item.key!)).map((item) => item.time).filter((time): time is number => time != null);
  const first = times.length ? Math.min(...times) : undefined;
  const last = times.length ? Math.max(...times) : undefined;
  if (!titleTouched) title = defaultTitle(first, last);
  if (!subtitleTouched)
    subtitle = first != null && last != null ? (month(first) === month(last) ? month(first) : `${month(first)} — ${month(last)}`) : "";
}

/** Keeps what the person picked when it still fits the layout; otherwise starts from a sensible pick. */
function fitSelection() {
  const limit = collageLimits[layout];
  const keys = items.map((item) => item.key!);
  if (layout === "compare") {
    selected = items.length >= 2 ? [keys[0], keys[keys.length - 1]] : keys;
    return;
  }
  const kept = keys.filter((key) => selected.includes(key));
  selected = kept.length >= limit.min ? kept.slice(0, limit.max) : keys.slice(0, limit.max);
}

function options(width: number) {
  return { layout, theme, title, subtitle, width };
}

Page({
  data: {
    layouts,
    themes,
    samples,
    layout: layout as CollageLayout,
    theme: theme as CollageTheme,
    labelMode: labelMode as LabelMode,
    order: order as Order,
    hasBirthday: false,
    babyName: "",
    tiles: [] as Array<{ key: string; path: string; label: string; selected: boolean; order: number; dated: boolean; iso: string }>,
    today: isoDay(Date.now()),
    count: 0,
    min: 2,
    max: 12,
    title: "",
    subtitle: "",
    previewW: 1,
    previewH: 1,
    ready: false,
    layoutName: "",
  },

  onLoad() {
    items = [];
    selected = [];
    layout = "grid";
    theme = "cream";
    order = "asc";
    titleTouched = subtitleTouched = false;
    baby = loadBaby();
    labelMode = baby.birthday ? "age" : "date";
    const info = wx.getWindowInfo();
    box = { width: info.windowWidth - 32, height: Math.round(info.windowHeight * 0.42), pixelRatio: info.pixelRatio };
    this.setData({ hasBirthday: !!baby.birthday, babyName: baby.name, labelMode, layout, theme, order, layoutName: layoutInfo[0].name });
    const channel = this.getOpenerEventChannel?.();
    channel?.on?.("photos", (list: Item[]) => this.setItems(list));
  },

  onReady() {
    const query = this.createSelectorQuery();
    query.select("#collage").fields({ node: true, size: true });
    query.select("#collage-work").fields({ node: true, size: true });
    query.exec((result) => {
      previewCanvas = result[0]?.node;
      workCanvas = result[1]?.node;
      this.render();
    });
  },

  onUnload() {
    thumbs.clear();
    items = [];
  },

  setItems(list: Item[]) {
    const known = new Set(items.map((item) => item.key));
    items = sortItems(list.filter((item) => item && item.path).map((item) => ({ ...item, key: item.key ?? `c${keyCounter++}` })));
    const limit = collageLimits[layout];
    const keys = items.map((item) => item.key!);
    if (layout === "compare") selected = keys.length >= 2 ? [keys[0], keys[keys.length - 1]] : keys;
    // Newly added photos join what the person already picked, up to the layout's limit.
    else selected = keys.filter((key) => selected.includes(key) || !known.has(key)).slice(0, limit.max);
    this.refresh();
  },

  /** Syncs the tiles and texts, then redraws. */
  refresh() {
    autoText();
    const limit = collageLimits[layout];
    const list = chosen();
    this.setData({
      layout,
      theme,
      labelMode,
      order,
      title,
      subtitle,
      count: selected.length,
      min: limit.min,
      max: limit.max,
      layoutName: layoutInfo.find((item) => item.id === layout)!.name,
      ready: items.length >= 2,
      tiles: items.map((item) => ({
        key: item.key!,
        path: item.path,
        label: dateLabel(item),
        dated: item.time != null,
        iso: isoDay(item.time ?? Date.now()),
        selected: selected.includes(item.key!),
        order: list.indexOf(item) + 1,
      })),
    });
    this.render();
  },

  async render() {
    if (rendering) {
      dirty = true;
      return;
    }
    const canvas = previewCanvas;
    if (!canvas) return;
    rendering = true;
    try {
      do {
        dirty = false;
        const list = chosen();
        if (list.length < collageLimits[layout].min) return;
        const first = !list.every((item) => thumbs.has(item.path));
        if (first) wx.showLoading({ title: "正在准备照片", mask: false });
        const cells = await Promise.all(list.map(async (item) => ({ image: (await thumbOf(item))!.image, label: labelOf(item) })));
        if (first) wx.hideLoading();
        const css = collageGeometry(cells.length, options(box.width));
        let width = box.width;
        if (css.height > box.height) width = (box.width * box.height) / css.height;
        const pixels = Math.min(1080, Math.round(width * box.pixelRatio));
        const geometry = collageGeometry(cells.length, options(pixels));
        canvas.width = geometry.width;
        canvas.height = geometry.height;
        drawCollage(context2d(canvas), canvas, cells, options(pixels));
        this.setData({ previewW: Math.round(width), previewH: Math.round((width * geometry.height) / geometry.width) });
      } while (dirty);
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: errorMessage(error) || "预览失败", icon: "none" });
    } finally {
      rendering = false;
    }
  },

  // ---------- choices ----------

  setLayout(id: CollageLayout) {
    layout = id;
    titleTouched = false;
    fitSelection();
  },

  onLayout(event: WechatMiniprogram.CustomEvent) {
    this.setLayout(event.currentTarget.dataset.id as CollageLayout);
    this.refresh();
    const limit = collageLimits[layout];
    if (items.length < limit.min) wx.showToast({ title: `这个版式至少要 ${limit.min} 张，再添几张吧`, icon: "none" });
  },

  /** From the empty-state gallery: remember the layout, then pick photos for it. */
  onStart(event: WechatMiniprogram.CustomEvent) {
    this.setLayout(event.currentTarget.dataset.id as CollageLayout);
    this.setData({ layout, layoutName: layoutInfo.find((item) => item.id === layout)!.name });
    this.onAdd();
  },

  onTheme(event: WechatMiniprogram.CustomEvent) {
    theme = event.currentTarget.dataset.id as CollageTheme;
    this.setData({ theme });
    this.render();
  },

  onLabel(event: WechatMiniprogram.CustomEvent) {
    labelMode = event.currentTarget.dataset.id as LabelMode;
    this.refresh();
  },

  onOrder(event: WechatMiniprogram.CustomEvent) {
    order = event.currentTarget.dataset.id as Order;
    this.refresh();
  },

  onTile(event: WechatMiniprogram.CustomEvent) {
    const key = String(event.currentTarget.dataset.key);
    const limit = collageLimits[layout];
    if (selected.includes(key)) {
      selected = selected.filter((item) => item !== key);
    } else if (layout === "compare" && selected.length >= limit.max) {
      // Two slots: the newest tap replaces the earlier pick.
      selected = [...selected.slice(1), key];
    } else if (selected.length >= limit.max) {
      wx.showToast({ title: `这个版式最多 ${limit.max} 张`, icon: "none" });
      return;
    } else {
      selected = [...selected, key];
    }
    this.refresh();
    if (selected.length < limit.min) wx.showToast({ title: `至少选 ${limit.min} 张`, icon: "none" });
  },

  /** Sets one photo's date from the picker under its tile; the collage re-sorts by time. */
  onTileDate(event: WechatMiniprogram.CustomEvent) {
    const item = items.find((entry) => entry.key === event.currentTarget.dataset.key);
    if (!item) return;
    const [y, m, d] = String(event.detail.value).split("-").map(Number);
    const previous = item.time != null ? new Date(item.time) : undefined;
    const date = new Date(y, m - 1, d, previous?.getHours() ?? 12, previous?.getMinutes() ?? 0);
    item.time = date.getTime();
    item.dateText = formatDateAs(date, "dot");
    items = sortItems(items);
    this.refresh();
  },

  /** Keeps a tap on the date strip from also toggling the photo. */
  noop() {},

  onSelectAll() {
    const limit = collageLimits[layout];
    const all = items.map((item) => item.key!);
    selected = selected.length >= Math.min(all.length, limit.max) ? [] : all.slice(0, limit.max);
    this.refresh();
  },

  onTitle(event: WechatMiniprogram.CustomEvent) {
    title = String(event.detail.value ?? "");
    titleTouched = true;
    this.render();
  },

  onSubtitle(event: WechatMiniprogram.CustomEvent) {
    subtitle = String(event.detail.value ?? "");
    subtitleTouched = true;
    this.render();
  },

  async onAdd() {
    if (busy) return;
    const room = MAX_ITEMS - items.length;
    if (room <= 0) {
      wx.showToast({ title: `最多 ${MAX_ITEMS} 张`, icon: "none" });
      return;
    }
    busy = true;
    try {
      const paths = await pickImages(room);
      const added: Item[] = [];
      for (const [index, path] of paths.entries()) {
        wx.showLoading({ title: `正在读取 ${index + 1}/${paths.length}`, mask: true });
        try {
          const photo = await loadPhoto(path);
          added.push({
            path,
            width: photo.width,
            height: photo.height,
            orientation: photo.orientation,
            dateText: photo.editedDateText,
            time: photo.meta.capturedAt?.getTime(),
          });
        } catch {
          // Unreadable files are skipped; the rest still make a collage.
        }
      }
      wx.hideLoading();
      if (added.length) {
        const fresh = items.length === 0;
        this.setItems([...items, ...added]);
        if (fresh && items.length < collageLimits[layout].min)
          wx.showToast({ title: `「${this.data.layoutName}」至少要 ${collageLimits[layout].min} 张，再添几张吧`, icon: "none" });
      }
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: `无法打开相册：${errorMessage(error)}`, icon: "none" });
    } finally {
      busy = false;
    }
  },

  // ---------- output ----------

  async exportCollage() {
    const list = chosen();
    if (!workCanvas || list.length < collageLimits[layout].min) throw new Error(`至少选 ${collageLimits[layout].min} 张照片`);
    const cells = [];
    for (const item of list) cells.push({ image: (await thumbOf(item))!.image, label: labelOf(item) });
    const geometry = collageGeometry(cells.length, options(EXPORT_WIDTH));
    workCanvas.width = geometry.width;
    workCanvas.height = geometry.height;
    try {
      drawCollage(context2d(workCanvas), workCanvas, cells, options(EXPORT_WIDTH));
      return await canvasToJpeg(workCanvas);
    } finally {
      workCanvas.width = workCanvas.height = 1;
    }
  },

  async onSave() {
    if (busy) return;
    busy = true;
    try {
      wx.showLoading({ title: "正在生成", mask: true });
      const path = await this.exportCollage();
      wx.hideLoading();
      if ((await saveToAlbum(path)) === "saved") wx.showToast({ title: "已保存到相册", icon: "success" });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: errorMessage(error), icon: "none" });
    } finally {
      busy = false;
    }
  },

  async onShare() {
    if (busy) return;
    busy = true;
    try {
      wx.showLoading({ title: "正在生成", mask: true });
      const path = await this.exportCollage();
      wx.hideLoading();
      if (wx.canIUse("showShareImageMenu")) await wx.showShareImageMenu({ path });
      else await wx.previewImage({ urls: [path] });
    } catch (error) {
      wx.hideLoading();
      const message = errorMessage(error);
      if (!/cancel/i.test(message)) wx.showToast({ title: message, icon: "none" });
    } finally {
      busy = false;
    }
  },

  onShareAppMessage() {
    return { title: "把宝宝每个月的照片拼成一张", path: "/pages/home/index", imageUrl: "/images/share.jpg" };
  },
});
