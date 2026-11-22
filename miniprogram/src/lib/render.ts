import type { BabyProfile, PrintSettings, RenderOptions, WatermarkStyle } from "../../../src/types";
import { paintWatermark, watermarkLayout } from "../../../src/services/watermark";
import { fontStacks, needsHandFont } from "../../../src/services/fonts";
import type { Drawable } from "../../../src/services/surface";
import { HAND_FONT_URL } from "./config";
import { errorMessage, type MpPhoto } from "./photos";

type Canvas = WechatMiniprogram.Canvas;
interface Source {
  image: Drawable;
  width: number;
  height: number;
}

// WeChat's canvas is strict about font lists; generic families always resolve
// to the phone's own CJK fonts (PingFang on iOS, the system font on Android).
fontStacks.sans = "sans-serif";
fontStacks.serif = "serif";
fontStacks.mono = "monospace";
fontStacks.hand = "serif";

let handFont: Promise<void> | undefined;

function loadHandFont(): Promise<void> {
  if (!HAND_FONT_URL) return Promise.resolve();
  handFont ??= new Promise<void>((resolve) => {
    wx.loadFontFace({
      global: true,
      family: "PostcardHand",
      source: `url("${HAND_FONT_URL}")`,
      scopes: ["webview", "native"],
      success: () => {
        fontStacks.hand = "PostcardHand, serif";
        resolve();
      },
      fail: () => {
        handFont = undefined;
        resolve();
      },
    });
  });
  return handFont;
}

/** Whether this phone's image decoder already applies EXIF rotation. Learned from the first rotated photo. */
let decoderRotates: boolean | undefined;

function decode(canvas: Canvas, path: string): Promise<WechatMiniprogram.Image> {
  return new Promise((resolve, reject) => {
    const image = canvas.createImage();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片读取失败，请换一张试试"));
    image.src = path;
  });
}

async function loadSource(canvas: Canvas, photo: MpPhoto): Promise<Source> {
  const image = await decode(canvas, photo.path);
  const plain = { image: image as unknown as Drawable, width: image.width, height: image.height };
  const o = photo.orientation;
  if (o <= 1) return plain;
  if (o >= 5 && photo.width !== photo.height) decoderRotates = image.width === photo.height;
  if (decoderRotates !== false) return plain;
  try {
    return rotate(image, o);
  } catch {
    return plain;
  }
}

/** Applies EXIF orientation by hand on decoders that ignore it. */
function rotate(image: WechatMiniprogram.Image, o: number): Source {
  const w = image.width;
  const h = image.height;
  const swap = o >= 5;
  const canvas = wx.createOffscreenCanvas({ type: "2d", width: swap ? h : w, height: swap ? w : h });
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const matrix: Record<number, [number, number, number, number, number, number]> = {
    2: [-1, 0, 0, 1, w, 0], 3: [-1, 0, 0, -1, w, h], 4: [1, 0, 0, -1, 0, h],
    5: [0, 1, 1, 0, 0, 0], 6: [0, 1, -1, 0, h, 0], 7: [0, -1, -1, 0, h, w], 8: [0, -1, 1, 0, 0, w],
  };
  ctx.transform(...matrix[o]);
  ctx.drawImage(image as unknown as CanvasImageSource, 0, 0);
  return { image: canvas as unknown as Drawable, width: canvas.width, height: canvas.height };
}

// Decoded photos are large (a 12 MP photo is ~48 MB of pixels); keep only a couple.
const previewCache = new Map<string, Promise<Source>>();

function cachedSource(canvas: Canvas, photo: MpPhoto) {
  let source = previewCache.get(photo.path);
  if (!source) {
    source = loadSource(canvas, photo);
    source.catch(() => previewCache.delete(photo.path));
    previewCache.set(photo.path, source);
    while (previewCache.size > 2) previewCache.delete(previewCache.keys().next().value!);
  }
  return source;
}

export function forgetPhoto(path: string) {
  previewCache.delete(path);
}

function options(photo: MpPhoto, style: WatermarkStyle, baby: BabyProfile, print?: PrintSettings, maxEdge?: number): RenderOptions {
  return { photo, style, babyProfile: baby, outputFormat: "jpeg", printSettings: print, maxEdge };
}

/** Draws a screen-sized preview. Returns the CSS size the canvas should take. */
export async function drawPreview(
  canvas: Canvas,
  photo: MpPhoto,
  style: WatermarkStyle,
  baby: BabyProfile,
  print: PrintSettings,
  box: { width: number; height: number; pixelRatio: number },
) {
  if (needsHandFont(style)) await loadHandFont();
  const source = await cachedSource(canvas, photo);
  const full = watermarkLayout(source.width, source.height, options(photo, style, baby, print));
  let width = box.width;
  let height = (width * full.height) / full.width;
  if (height > box.height) {
    height = box.height;
    width = (height * full.width) / full.height;
  }
  const maxEdge = Math.min(2048, Math.max(width, height) * box.pixelRatio);
  const renderOptions = options(photo, style, baby, print, maxEdge);
  const layout = watermarkLayout(source.width, source.height, renderOptions);
  canvas.width = layout.width;
  canvas.height = layout.height;
  paintWatermark(context2d(canvas), canvas, source.image, renderOptions, layout);
  return { width: Math.round(width), height: Math.round(height) };
}

/** Renders the full-size result (long edge up to 3200 px, or the paper size at 300 DPI) to a temporary JPEG. */
export async function exportPhoto(canvas: Canvas, photo: MpPhoto, style: WatermarkStyle, baby: BabyProfile, print: PrintSettings) {
  if (needsHandFont(style)) await loadHandFont();
  const source = await loadSource(canvas, photo);
  // Retry smaller when a phone refuses a very large canvas.
  for (const maxEdge of [undefined, 2048]) {
    try {
      const renderOptions = options(photo, style, baby, print, maxEdge);
      const layout = watermarkLayout(source.width, source.height, renderOptions);
      canvas.width = layout.width;
      canvas.height = layout.height;
      paintWatermark(context2d(canvas), canvas, source.image, renderOptions, layout);
      return await canvasToJpeg(canvas);
    } catch (error) {
      if (maxEdge) throw new Error(`生成图片失败：${errorMessage(error)}`);
    } finally {
      canvas.width = canvas.height = 1;
    }
  }
  throw new Error("生成图片失败");
}

/** Writes the whole canvas to a temporary JPEG at its pixel size. */
export async function canvasToJpeg(canvas: Canvas) {
  await new Promise((resolve) => setTimeout(resolve, 30));
  const result = await wx.canvasToTempFilePath({
    canvas,
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
    destWidth: canvas.width,
    destHeight: canvas.height,
    fileType: "jpg",
    quality: 0.94,
  });
  return result.tempFilePath;
}

/**
 * A small, upright copy of a photo for collages. Only the copy is kept;
 * the full-size decode is dropped right away so a dozen photos fit in memory.
 */
export async function thumbnail(canvas: Canvas, photo: MpPhoto, maxEdge: number) {
  const source = await loadSource(canvas, photo);
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const copy = wx.createOffscreenCanvas({ type: "2d", width, height });
  const ctx = copy.getContext("2d") as CanvasRenderingContext2D;
  ctx.drawImage(source.image as CanvasImageSource, 0, 0, width, height);
  return { image: copy as unknown as Drawable, width, height };
}

export type SaveResult = "saved" | "denied";

export async function saveToAlbum(path: string): Promise<SaveResult> {
  try {
    await wx.saveImageToPhotosAlbum({ filePath: path });
    return "saved";
  } catch (error) {
    const message = errorMessage(error);
    if (/auth|deny|denied|authorize/i.test(message)) {
      const answer = await wx.showModal({
        title: "需要相册权限",
        content: "保存照片需要「添加到相册」权限，请在设置里打开。",
        confirmText: "去设置",
        cancelText: "暂不",
      });
      if (answer.confirm) await wx.openSetting({});
      return "denied";
    }
    throw new Error(/cancel/i.test(message) ? "已取消保存" : `保存失败：${message}`);
  }
}

/** WeChat's 2D context implements the drawing calls the shared renderer uses. */
export function context2d(canvas: Canvas) {
  return canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
}
