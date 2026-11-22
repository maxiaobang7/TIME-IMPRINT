import type { BabyProfile, PrintSettings, WatermarkPosition, WatermarkStyle } from "../../../../src/types";
import { fontOptions } from "../../../../src/services/fonts";
import { postcardMessage, postcardSignature } from "../../../../src/services/postcard";
import { babyAgeText, dateFormats, formatCoordinate, formatDateAs, photoDateOf } from "../../../../src/utils/date";
import { placeLabel } from "../../../../src/utils/place";
import { defaultPrintSettings } from "../../../../src/services/print-layout";
import { MAX_PHOTOS, errorMessage, loadPhoto, pickImages, type MpPhoto } from "../../lib/photos";
import { drawPreview, exportPhoto, forgetPhoto, saveToAlbum } from "../../lib/render";
import { loadBaby, loadPrint, loadRecent, loadStyle, loadTemplateId, pushRecent, removeRecent, saveBaby, savePrint, saveStyle, saveTemplateId, templateById, templates as mpTemplates, type RecentKind } from "../../lib/store";

const colorOptions = ["#ffffff", "#111111", "#5b5b5b", "#7a6a64", "#fa7668", "#f6b15d", "#9ab972", "#94cde0", "#ff9a3d"];
const postcardColors = ["#42658a", "#456f65", "#8a5c6c", "#535962"];
const allPositions: Array<{ id: WatermarkPosition; label: string }> = [
  { id: "top-left", label: "左上" },
  { id: "top-center", label: "上中" },
  { id: "top-right", label: "右上" },
  { id: "bottom-left", label: "左下" },
  { id: "bottom-center", label: "下中" },
  { id: "bottom-right", label: "右下" },
];
const paperPositions: Array<{ id: WatermarkPosition; label: string }> = [
  { id: "bottom-left", label: "靠左" },
  { id: "bottom-center", label: "居中" },
  { id: "bottom-right", label: "靠右" },
];
const templates = mpTemplates.map(({ id, name }) => ({ id, name }));
const printOptions = [
  { id: "original", label: "原图" },
  { id: "3", label: "3 寸" },
  { id: "5", label: "5 寸" },
  { id: "6", label: "6 寸" },
];
function isoDay(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

type TextField = "editedDateText" | "editedLocationText" | "editedCoordinateText" | "eventNote" | "postcardMessage" | "postcardSignature";

// Photo objects hold Dates and stay out of setData; the page only gets display copies.
let photos: MpPhoto[] = [];
let current = 0;
let style: WatermarkStyle = { ...mpTemplates[0].style };
let templateId = mpTemplates[0].id;
let baby: BabyProfile = { name: "", birthday: "" };
let print: PrintSettings = { ...defaultPrintSettings };
let dateFormat = "full";
let previewCanvas: WechatMiniprogram.Canvas | undefined;
let workCanvas: WechatMiniprogram.Canvas | undefined;
let box = { width: 343, height: 300, pixelRatio: 2 };
let rendering = false;
let dirty = false;
let timer: number | undefined;
let busy = false;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function controls() {
  const paper = style.layout === "paper";
  const postcard = style.frame === "postcard";
  const film = style.overlay === "filmDate";
  const bigDate = style.overlay === "bigDate";
  return {
    showFont: !postcard,
    showBackdrop: !paper && !film,
    allowBox: !bigDate,
    showPosition: !postcard && style.frame !== "camera",
    positionLabel: paper ? "文字对齐" : "水印位置",
    positions: paper ? paperPositions : allPositions,
    colors: postcard ? postcardColors : colorOptions,
    postcard,
    backdrop: !style.showBackground ? "none" : style.backdrop === "gradient" || bigDate ? "gradient" : "box",
    fontSize: Math.round(style.fontSizeRatio * 1000),
    opacity: Math.round(style.opacity * 100),
    backgroundOpacity: Math.round(style.backgroundOpacity * 100),
  };
}

function textPanel() {
  const photo = photos[current];
  if (!photo) return { date: "", location: "", coordinate: "", event: "", message: "", signature: "", noDate: false, pickerDate: "", dateChips: [], ageHint: "" };
  const date = photoDateOf(photo);
  const reference = date ?? new Date();
  let ageHint = "";
  if (baby.birthday) ageHint = date ? babyAgeText(baby.birthday, date) || "拍摄日期早于生日" : "需要先填写拍摄日期";
  return {
    date: photo.editedDateText,
    location: photo.editedLocationText,
    coordinate: photo.editedCoordinateText,
    event: photo.eventNote,
    message: photo.postcardMessage ?? "",
    signature: photo.postcardSignature ?? "",
    messagePlaceholder: postcardMessage,
    signaturePlaceholder: postcardSignature(baby.name),
    noDate: !photo.editedDateText.trim(),
    pickerDate: isoDay(reference),
    dateChips: dateFormats.map((format) => ({ id: format.id, label: formatDateAs(reference, format.id) })),
    ageHint,
  };
}

function recentData() {
  return {
    date: loadRecent("date").map((iso) => {
      const [y, m, d] = iso.split("-").map(Number);
      const format = dateFormat === "full" || dateFormat === "dash" ? "date" : dateFormat;
      return { value: iso, label: formatDateAs(new Date(y, m - 1, d), format) };
    }),
    location: loadRecent("location"),
    event: loadRecent("event"),
  };
}

/** Remembers what the exported photos used, so the next batch is a tap away. */
function rememberUsed(used: MpPhoto[]) {
  pushRecent("date", used.map((photo) => {
    const date = photoDateOf(photo);
    return date ? isoDay(date) : "";
  }));
  pushRecent("location", used.map((photo) => photo.editedLocationText));
  pushRecent("event", used.map((photo) => photo.eventNote));
}

function thumbs() {
  return photos.map(({ id, path }) => ({ id, path }));
}

Page({
  data: {
    templates,
    templateId,
    fontOptions,
    style,
    controls: controls(),
    text: textPanel(),
    baby,
    thumbs: [] as Array<{ id: string; path: string }>,
    current: 0,
    hasPhotos: false,
    tab: "text",
    previewW: 1,
    previewH: 1,
    max: MAX_PHOTOS,
    today: isoDay(new Date()),
    recent: recentData(),
    print,
    printOptions,
  },

  onLoad(query: Record<string, string | undefined>) {
    photos = [];
    current = 0;
    templateId = loadTemplateId();
    style = loadStyle(templateId);
    baby = loadBaby();
    print = loadPrint();
    const info = wx.getWindowInfo();
    box = { width: info.windowWidth - 32, height: Math.round(info.windowHeight * 0.38), pixelRatio: info.pixelRatio };
    this.setData({ templateId, style, controls: controls(), baby, recent: recentData(), print });
    let paths: string[] = [];
    try {
      paths = query.paths ? JSON.parse(decodeURIComponent(query.paths)) : [];
    } catch {
      paths = [];
    }
    this.pendingPaths = paths;
  },

  pendingPaths: [] as string[],

  onReady() {
    const query = this.createSelectorQuery();
    query.select("#preview").fields({ node: true, size: true });
    query.select("#work").fields({ node: true, size: true });
    query.exec((result) => {
      previewCanvas = result[0]?.node;
      workCanvas = result[1]?.node;
      if (this.pendingPaths.length) this.addPaths(this.pendingPaths);
      this.pendingPaths = [];
    });
  },

  onUnload() {
    photos.forEach((photo) => forgetPhoto(photo.path));
    photos = [];
    if (timer) clearTimeout(timer);
  },

  async addPaths(paths: string[]) {
    if (!paths.length) return;
    busy = true;
    const added: MpPhoto[] = [];
    let failed = 0;
    try {
      for (const [index, path] of paths.entries()) {
        wx.showLoading({ title: `正在读取 ${index + 1}/${paths.length}`, mask: true });
        try {
          added.push(await loadPhoto(path));
        } catch {
          failed++;
        }
      }
    } finally {
      wx.hideLoading();
      busy = false;
    }
    if (added.length) {
      photos = [...photos, ...added];
      current = photos.length - added.length;
      this.refreshPhoto();
    }
    if (failed) wx.showToast({ title: `有 ${failed} 张照片无法读取`, icon: "none" });
  },

  /** Syncs everything that depends on the selected photo. */
  refreshPhoto() {
    this.setData({ thumbs: thumbs(), current, hasPhotos: photos.length > 0, text: textPanel() });
    this.schedule();
  },

  schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => this.renderPreview(), 60) as unknown as number;
  },

  async renderPreview() {
    if (rendering) {
      dirty = true;
      return;
    }
    rendering = true;
    try {
      do {
        dirty = false;
        const photo = photos[current];
        if (!previewCanvas || !photo) return;
        const size = await drawPreview(previewCanvas, photo, style, baby, print, box);
        if (size.width !== this.data.previewW || size.height !== this.data.previewH)
          this.setData({ previewW: size.width, previewH: size.height });
      } while (dirty);
    } catch (error) {
      wx.showToast({ title: errorMessage(error) || "预览失败", icon: "none" });
    } finally {
      rendering = false;
    }
  },

  // ---------- photos ----------

  onSelect(event: WechatMiniprogram.CustomEvent) {
    current = Number(event.currentTarget.dataset.index);
    this.refreshPhoto();
  },

  async onAdd() {
    if (busy) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      wx.showToast({ title: `最多 ${MAX_PHOTOS} 张`, icon: "none" });
      return;
    }
    try {
      await this.addPaths(await pickImages(room));
    } catch (error) {
      wx.showToast({ title: `无法打开相册：${errorMessage(error)}`, icon: "none" });
    }
  },

  onRemove() {
    const photo = photos[current];
    if (!photo || busy) return;
    forgetPhoto(photo.path);
    photos = photos.filter((item) => item !== photo);
    current = Math.max(0, Math.min(current, photos.length - 1));
    this.refreshPhoto();
  },

  onTab(event: WechatMiniprogram.CustomEvent) {
    this.setData({ tab: event.currentTarget.dataset.id });
  },

  // ---------- template & style ----------

  onTemplate(event: WechatMiniprogram.CustomEvent) {
    templateId = event.currentTarget.dataset.id;
    style = { ...templateById(templateId).style };
    saveTemplateId(templateId);
    this.setData({ templateId, style, controls: controls() });
    this.schedule();
  },

  updateStyle(patch: Partial<WatermarkStyle>, persist = true) {
    style = { ...style, ...patch };
    if (persist) saveStyle(templateId, style);
    this.setData({ style, controls: controls() });
    this.schedule();
  },

  onFont(event: WechatMiniprogram.CustomEvent) {
    this.updateStyle({ fontFamily: event.currentTarget.dataset.id });
  },

  onColor(event: WechatMiniprogram.CustomEvent) {
    this.updateStyle({ textColor: event.currentTarget.dataset.color });
  },

  onPosition(event: WechatMiniprogram.CustomEvent) {
    this.updateStyle({ position: event.currentTarget.dataset.id });
  },

  onBackdrop(event: WechatMiniprogram.CustomEvent) {
    const id = event.currentTarget.dataset.id as string;
    this.updateStyle(id === "none" ? { showBackground: false } : { showBackground: true, backdrop: id as "box" | "gradient" });
  },

  /** Sliders preview while dragging and save on release. */
  onSlide(event: WechatMiniprogram.CustomEvent) {
    const key = event.currentTarget.dataset.key as "fontSizeRatio" | "opacity" | "backgroundOpacity";
    const value = Number(event.detail.value) / (key === "fontSizeRatio" ? 1000 : 100);
    this.updateStyle({ [key]: value }, event.type === "change");
  },

  onPrint(event: WechatMiniprogram.CustomEvent) {
    const { key, id } = event.currentTarget.dataset as { key: "size" | "fit"; id: string };
    print = { ...print, [key]: id };
    savePrint(print);
    this.setData({ print });
    this.schedule();
  },

  onToggle(event: WechatMiniprogram.CustomEvent) {
    const key = event.currentTarget.dataset.key as "showTime" | "showLocation" | "showBabyAge" | "showCoordinate";
    this.updateStyle({ [key]: !!event.detail.value });
  },

  // ---------- text ----------

  onText(event: WechatMiniprogram.CustomEvent) {
    const photo = photos[current];
    if (!photo) return;
    const field = event.currentTarget.dataset.field as TextField;
    const value = String(event.detail.value ?? "");
    if (field === "postcardMessage" || field === "postcardSignature") photo[field] = value || undefined;
    else photo[field] = value;
    if (field === "editedDateText") {
      const panel = textPanel();
      this.setData({ "text.noDate": panel.noDate, "text.dateChips": panel.dateChips, "text.pickerDate": panel.pickerDate, "text.ageHint": panel.ageHint });
    }
    this.schedule();
  },

  /** Picks a place on the map; fills the label and the coordinates. */
  async onMap() {
    const photo = photos[current];
    if (!photo) return;
    const { latitude, longitude } = photo.meta;
    try {
      const place = await wx.chooseLocation(latitude != null && longitude != null ? { latitude, longitude } : {});
      const label = placeLabel(place.name, place.address);
      if (!label) return;
      photo.editedLocationText = label;
      photo.editedCoordinateText = formatCoordinate(place.latitude, place.longitude);
      this.setData({ "text.location": label, "text.coordinate": photo.editedCoordinateText });
      this.schedule();
    } catch (error) {
      const message = errorMessage(error);
      if (/cancel/i.test(message)) return;
      if (/auth|deny/i.test(message)) {
        const answer = await wx.showModal({ title: "需要位置权限", content: "在地图上选地点需要位置权限，可以在设置里打开。", confirmText: "去设置", cancelText: "手动填写" });
        if (answer.confirm) await wx.openSetting({});
        return;
      }
      wx.showToast({ title: `地图打不开：${message}`, icon: "none" });
    }
  },

  onPickDate(event: WechatMiniprogram.CustomEvent) {
    this.applyDay(String(event.detail.value));
  },

  /** Sets the selected photo to a YYYY-MM-DD day, keeping any known time of day. */
  applyDay(iso: string) {
    const photo = photos[current];
    if (!photo) return;
    const [y, m, d] = iso.split("-").map(Number);
    const previous = photoDateOf(photo);
    const date = new Date(y, m - 1, d, previous?.getHours() ?? 0, previous?.getMinutes() ?? 0);
    photo.editedDateText = formatDateAs(date, dateFormat);
    this.setData({ text: textPanel() });
    this.schedule();
    // iPhone WeChat strips capture data from every photo; offer to date the rest in one go.
    const undated = photos.filter((item) => item !== photo && !item.editedDateText.trim());
    if (undated.length)
      wx.showModal({
        title: "其他照片也没有日期",
        content: `还有 ${undated.length} 张照片没有拍摄时间，要一起填成这一天吗？之后也可以单独改。`,
        confirmText: "一起填",
        cancelText: "不用",
      }).then((answer) => {
        if (!answer.confirm) return;
        undated.forEach((item) => (item.editedDateText = photo.editedDateText));
        wx.showToast({ title: `已填好 ${undated.length} 张`, icon: "none" });
      });
  },

  onRecent(event: WechatMiniprogram.CustomEvent) {
    const kind = event.currentTarget.dataset.kind as RecentKind;
    const value = String(event.currentTarget.dataset.value);
    const photo = photos[current];
    if (!photo) return;
    if (kind === "date") {
      this.applyDay(value);
      return;
    }
    if (kind === "location") photo.editedLocationText = value;
    else photo.eventNote = value;
    this.setData({ [kind === "location" ? "text.location" : "text.event"]: value });
    this.schedule();
  },

  onRecentRemove(event: WechatMiniprogram.CustomEvent) {
    const kind = event.currentTarget.dataset.kind as RecentKind;
    const value = String(event.currentTarget.dataset.value);
    wx.showModal({ title: "删除这条记录？", content: String(event.currentTarget.dataset.label || value), confirmText: "删除" }).then((answer) => {
      if (!answer.confirm) return;
      removeRecent(kind, value);
      this.setData({ recent: recentData() });
    });
  },

  onDateFormat(event: WechatMiniprogram.CustomEvent) {
    dateFormat = event.currentTarget.dataset.id;
    let changed = 0;
    let custom = 0;
    for (const photo of photos) {
      const date = photoDateOf(photo);
      if (!date) {
        if (photo.editedDateText.trim()) custom++;
        continue;
      }
      photo.editedDateText = formatDateAs(date, dateFormat);
      changed++;
    }
    this.setData({ text: textPanel(), recent: recentData() });
    this.schedule();
    if (photos.length > 1 || custom)
      wx.showToast({ title: `已改 ${changed} 张${custom ? `，${custom} 张自定义文字未动` : ""}`, icon: "none" });
  },

  onSync(event: WechatMiniprogram.CustomEvent) {
    const field = event.currentTarget.dataset.field as "editedLocationText" | "eventNote";
    const source = photos[current];
    if (!source) return;
    photos.forEach((photo) => (photo[field] = source[field]));
    wx.showToast({ title: `已同步到全部 ${photos.length} 张`, icon: "none" });
  },

  onBabyName(event: WechatMiniprogram.CustomEvent) {
    baby = { ...baby, name: String(event.detail.value ?? "").trim() };
    saveBaby(baby);
    this.setData({ "text.signaturePlaceholder": postcardSignature(baby.name) });
    this.schedule();
  },

  onBirthday(event: WechatMiniprogram.CustomEvent) {
    baby = { ...baby, birthday: String(event.detail.value) };
    saveBaby(baby);
    this.setData({ baby, text: textPanel() });
    if (!style.showBabyAge) this.updateStyle({ showBabyAge: true });
    else this.schedule();
  },

  onClearBirthday() {
    baby = { ...baby, birthday: "" };
    saveBaby(baby);
    this.setData({ baby, text: textPanel() });
    this.schedule();
  },

  // ---------- output ----------

  async exportCurrent() {
    const photo = photos[current];
    if (!photo || !workCanvas) throw new Error("还没有照片");
    return exportPhoto(workCanvas, photo, style, baby, print);
  },

  async onSave() {
    if (busy || !photos[current]) return;
    busy = true;
    try {
      wx.showLoading({ title: "正在生成", mask: true });
      const path = await this.exportCurrent();
      wx.hideLoading();
      if ((await saveToAlbum(path)) === "saved") {
        rememberUsed([photos[current]]);
        this.setData({ recent: recentData() });
        wx.showToast({ title: "已保存到相册", icon: "success" });
      }
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: errorMessage(error), icon: "none" });
    } finally {
      busy = false;
    }
  },

  async onSaveAll() {
    if (busy || !photos.length || !workCanvas) return;
    busy = true;
    let saved = 0;
    let failed = 0;
    try {
      for (const [index, photo] of photos.entries()) {
        wx.showLoading({ title: `正在保存 ${index + 1}/${photos.length}`, mask: true });
        let path: string;
        try {
          path = await exportPhoto(workCanvas, photo, style, baby, print);
        } catch {
          failed++;
          continue;
        }
        wx.hideLoading();
        let result;
        try {
          result = await saveToAlbum(path);
        } catch {
          failed++;
          continue;
        }
        if (result === "denied") break;
        saved++;
        rememberUsed([photo]);
      }
    } finally {
      wx.hideLoading();
      busy = false;
    }
    this.setData({ recent: recentData() });
    wx.showToast({ title: `已保存 ${saved} 张${failed ? `，${failed} 张失败` : ""}`, icon: saved && !failed ? "success" : "none" });
  },

  async onShare() {
    if (busy || !photos[current]) return;
    busy = true;
    try {
      wx.showLoading({ title: "正在生成", mask: true });
      const path = await this.exportCurrent();
      wx.hideLoading();
      rememberUsed([photos[current]]);
      this.setData({ recent: recentData() });
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

  /** Opens the collage page with the photos already loaded here. */
  onCollage() {
    if (busy || photos.length < 2) return;
    const payload = photos.map((photo) => ({
      path: photo.path,
      width: photo.width,
      height: photo.height,
      orientation: photo.orientation,
      dateText: photo.editedDateText,
      time: photoDateOf(photo)?.getTime(),
    }));
    wx.navigateTo({
      url: "/pages/collage/index",
      success: (result) => result.eventChannel.emit("photos", payload),
    });
  },

  onShareAppMessage() {
    return { title: "给每张家庭照片，印上那一天", path: "/pages/home/index", imageUrl: "/images/share.jpg" };
  },
});
