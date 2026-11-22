import type {
  BabyProfile,
  PhotoItem,
  RenderOptions,
  RenderPhoto,
  WatermarkStyle,
} from "../types";
import type { Drawable, Surface } from "./surface";
import { babyAgeText, filmDateText, parseAnyDate } from "../utils/date";
import { fontStack, needsHandFont, titleWeight } from "./fonts";
import { printLayout } from "./print-layout";
import { withPrintDensity } from "./image-density";
import { drawFrame, frameGeometry } from "./watermark-frame";
import { loadPostcardFont } from "./postcard";

export async function renderWatermark(options: RenderOptions & { photo: PhotoItem }): Promise<Blob> {
  if (needsHandFont(options.style)) await loadPostcardFont();
  const image = await loadImage(options.photo.previewUrl);
  const canvas = document.createElement("canvas");
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("当前浏览器无法创建 Canvas。");
    const layout = watermarkLayout(image.naturalWidth, image.naturalHeight, options);
    canvas.width = layout.width;
    canvas.height = layout.height;
    paintWatermark(ctx, canvas, image, options, layout);

    const mime = options.outputFormat === "png" ? "image/png" : "image/jpeg";
    const quality = options.outputFormat === "png" ? undefined : 0.94;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error("导出图片失败。"));
        },
        mime,
        quality,
      );
    });

    return await withPrintDensity(blob);
  } finally {
    // Release the large pixel buffer before processing the next batch item.
    canvas.width = canvas.height = 1;
    image.removeAttribute?.("src");
  }
}

export type WatermarkLayout = ReturnType<typeof printLayout>;

/** Output canvas size and photo placement; platform-neutral. */
export function watermarkLayout(
  sourceWidth: number,
  sourceHeight: number,
  options: Pick<RenderOptions, "style" | "printSettings" | "maxEdge">,
): WatermarkLayout {
  const layout = printLayout(sourceWidth, sourceHeight, options.printSettings);
  if (
    options.style.layout === "paper" &&
    (!options.printSettings || options.printSettings.size === "original")
  ) {
    const geometry = frameGeometry(layout.width, layout.height, options.style.frame, options.style);
    const scale = Math.min(1, 3200 / Math.max(geometry.width, geometry.height));
    layout.width = geometry.width * scale;
    layout.height = geometry.height * scale;
    layout.margin = geometry.inset * scale;
  }
  if (options.maxEdge) {
    const scale = Math.min(1, options.maxEdge / Math.max(layout.width, layout.height));
    for (const key of ["width", "height", "margin", "x", "y", "drawWidth", "drawHeight"] as const)
      layout[key] *= scale;
  }
  layout.width = Math.max(1, Math.floor(layout.width));
  layout.height = Math.max(1, Math.floor(layout.height));
  return layout;
}

/**
 * Draws photo and watermark onto a canvas already sized to `layout`.
 * Works with any 2D context: browser canvas or WeChat mini program canvas.
 */
export function paintWatermark(
  ctx: CanvasRenderingContext2D,
  canvas: Surface,
  image: Drawable,
  options: RenderOptions,
  layout: WatermarkLayout,
) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const lines = buildWatermarkLines(options.photo, options.style, options.babyProfile);
  if (options.style.layout === "paper") {
    drawFrame(ctx, canvas, image, lines, options, layout.margin);
  } else {
    ctx.drawImage(image, layout.x, layout.y, layout.drawWidth, layout.drawHeight);
    drawOverlay(ctx, canvas, lines, options, layout.margin);
  }
}

export function buildWatermarkLines(
  photo: RenderPhoto,
  style: WatermarkStyle,
  babyProfile: BabyProfile,
) {
  const lines: Array<{ icon: string; text: string }> = [];

  if (style.showBabyAge) {
    const capturedAt = parseAnyDate(photo.editedDateText);
    const age = capturedAt
      ? babyAgeText(babyProfile.birthday, capturedAt)
      : "";
    if (babyProfile.name || age)
      lines.push({
        icon: "heart",
        text: [babyProfile.name, age].filter(Boolean).join(" · "),
      });
  }

  if (style.showTime && photo.editedDateText) {
    lines.push({ icon: "clock", text: photo.editedDateText });
  }

  if (style.showLocation && photo.editedLocationText) {
    lines.push({ icon: "pin", text: photo.editedLocationText });
  }

  if (style.showCoordinate && photo.editedCoordinateText) {
    lines.push({ icon: "target", text: photo.editedCoordinateText });
  }

  if (photo.eventNote) {
    lines.push({ icon: "star", text: photo.eventNote });
  }

  return lines;
}

type Line = { icon: string; text: string };

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: Surface,
  lines: Line[],
  options: RenderOptions,
  printMargin: number,
) {
  const { style, photo } = options;
  const date = parseAnyDate(photo.editedDateText);
  const hasDate = style.showTime && !!photo.editedDateText;
  if (style.overlay === "filmDate" && hasDate) {
    drawFilmDate(ctx, canvas, date ? filmDateText(date) : photo.editedDateText, style, printMargin);
    return;
  }
  if (style.overlay === "bigDate" && hasDate && date) {
    drawBigDate(ctx, canvas, date, lines.filter((line) => line.icon !== "clock"), style, printMargin);
    return;
  }
  if (style.overlay === "subtitle") {
    drawSubtitle(ctx, canvas, lines, style, printMargin);
    return;
  }
  drawWatermark(ctx, canvas, lines, style, printMargin);
}

/** Film subtitle: one centred line (the event, else the first line) with a quiet info line below. */
function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  canvas: Surface,
  lines: Line[],
  style: WatermarkStyle,
  margin: number,
) {
  if (!lines.length) return;
  const title = lines.find((line) => line.icon === "star") ?? lines[0];
  const info = lines.filter((line) => line !== title).map((line) => line.text).join("  ·  ");
  const family = fontStack(style.fontFamily);
  const minSide = Math.min(canvas.width, canvas.height);
  const available = Math.max(1, canvas.width - margin * 2);
  let size = Math.max(1, minSide * style.fontSizeRatio);
  ctx.save();
  const widths = () => {
    ctx.font = `${titleWeight(style.fontFamily)} ${size}px ${family}`;
    const main = ctx.measureText(title.text).width;
    ctx.font = `400 ${size * 0.56}px ${fontStack("sans")}`;
    return { main, info: info ? ctx.measureText(info).width + size * 0.6 : 0 };
  };
  let measured = widths();
  size *= Math.min(1, available / Math.max(1, measured.main * 1.04, measured.info * 1.04));
  measured = widths();
  const infoSize = size * 0.56;
  const boxHeight = size * 1.2 + (info ? infoSize * 1.9 : 0);
  const boxWidth = Math.min(available, Math.max(measured.main, measured.info) + size);
  const origin = getBoxOrigin(style.position.startsWith("top") ? "top-center" : "bottom-center", canvas.width, canvas.height, boxWidth, boxHeight, margin);
  if (style.showBackground && style.backdrop === "gradient") {
    drawEdgeGradient(ctx, canvas, style.position, origin.y, boxHeight, style.backgroundOpacity);
  } else if (style.showBackground) {
    ctx.fillStyle = `rgba(0, 0, 0, ${style.backgroundOpacity})`;
    roundRect(ctx, origin.x - size * 0.2, origin.y - size * 0.3, boxWidth + size * 0.4, boxHeight + size * 0.6, size * 0.5);
    ctx.fill();
  }
  const cx = canvas.width / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = style.textColor;
  ctx.globalAlpha = style.opacity;
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = size * 0.18;
  ctx.shadowOffsetY = size * 0.04;
  ctx.font = `${titleWeight(style.fontFamily)} ${size}px ${family}`;
  ctx.fillText(title.text, cx, origin.y + size * 0.6, available);
  if (info) {
    ctx.font = `400 ${infoSize}px ${fontStack("sans")}`;
    ctx.globalAlpha = style.opacity * 0.86;
    const y = origin.y + size * 1.2 + infoSize * 1.05;
    ctx.fillText(info, cx, y, available);
  }
  ctx.restore();
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  canvas: Surface,
  lines: Line[],
  style: WatermarkStyle,
  printMargin: number,
) {
  if (!lines.length) return;
  const family = fontStack(style.fontFamily);
  const weight = titleWeight(style.fontFamily);

  const minSide = Math.min(canvas.width, canvas.height);
  let fontSize = Math.max(1, minSide * style.fontSizeRatio);
  const availableWidth = Math.max(1, canvas.width - printMargin * 2);
  const availableHeight = Math.max(1, canvas.height - printMargin * 2);
  // Fit the entire label before positioning; never squeeze individual glyphs.
  ctx.save();
  ctx.font = `${weight} ${fontSize}px ${family}`;
  const textWidth = Math.max(
    ...lines.map((line) => ctx.measureText(line.text).width),
  );
  fontSize *= Math.min(
    1,
    availableWidth / (textWidth + fontSize * 3.04),
    availableHeight / (fontSize * (lines.length * 1.45 + 1.1)),
  );
  const lineHeight = fontSize * 1.45;
  const paddingX = fontSize * 0.82;
  const paddingY = fontSize * 0.55;
  const iconGap = fontSize * 0.4;
  const usableWidth = Math.max(1, canvas.width - printMargin * 2);
  const maxWidth = usableWidth;

  ctx.font = `${weight} ${fontSize}px ${family}`;
  ctx.textBaseline = "middle";

  const textWidths = lines.map(
    (line) => ctx.measureText(line.text).width + fontSize + iconGap,
  );
  const boxWidth = Math.min(maxWidth, Math.max(...textWidths) + paddingX * 2);
  const boxHeight = lines.length * lineHeight + paddingY * 2;
  const origin = getBoxOrigin(
    style.position,
    canvas.width,
    canvas.height,
    boxWidth,
    boxHeight,
    printMargin,
  );

  const gradient = style.showBackground && style.backdrop === "gradient";
  if (gradient) {
    drawEdgeGradient(ctx, canvas, style.position, origin.y, boxHeight, style.backgroundOpacity);
  } else if (style.showBackground) {
    ctx.fillStyle = `rgba(0, 0, 0, ${style.backgroundOpacity})`;
    roundRect(ctx, origin.x, origin.y, boxWidth, boxHeight, fontSize * 0.9);
    ctx.fill();
    // Hairline highlight: reads as frosted glass rather than a flat dark patch.
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = Math.max(1, fontSize * 0.05);
    ctx.stroke();
  }

  ctx.globalAlpha = style.opacity;
  ctx.fillStyle = style.textColor;
  if (!style.showBackground || gradient) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = fontSize * 0.12;
    ctx.shadowOffsetY = fontSize * 0.04;
  }
  lines.forEach((line, index) => {
    const y = origin.y + paddingY + lineHeight * index + lineHeight / 2;
    const x = origin.x + paddingX;
    drawIcon(ctx, line.icon, x, y, fontSize);
    ctx.fillText(
      line.text,
      x + fontSize + iconGap,
      y,
      boxWidth - paddingX * 2 - fontSize - iconGap,
    );
  });

  ctx.restore();
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && ctx.measureText(chars.join("") + "…").width > maxWidth) chars.pop();
  return chars.join("") + "…";
}

/** Soft scrim along the photo edge: keeps text legible without a hard plate. */
function drawEdgeGradient(
  ctx: CanvasRenderingContext2D,
  canvas: Surface,
  position: string,
  boxY: number,
  boxHeight: number,
  strength: number,
) {
  const top = position.startsWith("top");
  const reach = Math.min(canvas.height, (top ? boxY + boxHeight : canvas.height - boxY) + boxHeight * 1.2);
  const y0 = top ? 0 : canvas.height;
  const y1 = top ? reach : canvas.height - reach;
  const alpha = Math.min(0.85, Math.max(0.15, strength * 1.7));
  const gradient = ctx.createLinearGradient(0, y0, 0, y1);
  gradient.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
  gradient.addColorStop(0.55, `rgba(0, 0, 0, ${alpha * 0.4})`);
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, Math.min(y0, y1), canvas.width, Math.abs(y1 - y0));
}

/** Orange LED date imprint, like the date back of a 90s film camera. */
function drawFilmDate(
  ctx: CanvasRenderingContext2D,
  canvas: Surface,
  text: string,
  style: WatermarkStyle,
  margin: number,
) {
  const minSide = Math.min(canvas.width, canvas.height);
  const family = fontStack(style.fontFamily, "mono");
  let size = Math.max(1, minSide * style.fontSizeRatio * 1.25);
  const available = Math.max(1, canvas.width - margin * 2);
  ctx.save();
  ctx.font = `700 ${size}px ${family}`;
  size *= Math.min(1, available / Math.max(1, ctx.measureText(text).width * 1.08));
  ctx.font = `700 ${size}px ${family}`;
  const width = Math.min(available, ctx.measureText(text).width);
  const origin = getBoxOrigin(style.position, canvas.width, canvas.height, width, size, margin);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = style.textColor;
  ctx.globalAlpha = style.opacity * 0.92;
  // Two passes: a wide glow for the light bleed, then a crisp core.
  ctx.shadowColor = style.textColor;
  ctx.shadowBlur = size * 0.45;
  ctx.fillText(text, origin.x, origin.y + size / 2, width);
  ctx.shadowBlur = size * 0.12;
  ctx.globalAlpha = style.opacity;
  ctx.fillText(text, origin.x, origin.y + size / 2, width);
  ctx.restore();
}

const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Editorial layout: a large day number with month, year and a short caption. */
function drawBigDate(
  ctx: CanvasRenderingContext2D,
  canvas: Surface,
  date: Date,
  rest: Line[],
  style: WatermarkStyle,
  margin: number,
) {
  const minSide = Math.min(canvas.width, canvas.height);
  const available = Math.max(1, canvas.width - margin * 2);
  const day = String(date.getDate()).padStart(2, "0");
  const head = `${monthNames[date.getMonth()]}  ${date.getFullYear()}`;
  const captions = rest.map((line) => line.text).slice(0, 2);
  const serif = fontStack(style.fontFamily, "serif");
  const sans = fontStack("sans");
  let big = Math.max(1, minSide * style.fontSizeRatio * 3);
  const measure = () => {
    ctx.font = `400 ${big}px ${serif}`;
    const dayWidth = ctx.measureText(day).width;
    ctx.font = `600 ${big * 0.2}px ${sans}`;
    let info = ctx.measureText(head).width;
    ctx.font = `400 ${big * 0.19}px ${sans}`;
    for (const text of captions) info = Math.max(info, ctx.measureText(text).width);
    return { dayWidth, info, gap: big * 0.22 };
  };
  ctx.save();
  let m = measure();
  // Shrink for the date block itself; long captions are clipped via maxWidth instead.
  big *= Math.min(
    1,
    available / Math.max(1, m.dayWidth + m.gap + Math.min(m.info, m.dayWidth * 2.2)),
    Math.max(1, canvas.height - margin * 2) / (big * 1.05),
  );
  m = measure();
  const infoWidth = Math.max(1, Math.min(m.info, available - m.dayWidth - m.gap));
  const boxWidth = Math.min(available, m.dayWidth + m.gap + infoWidth);
  const boxHeight = big;
  const origin = getBoxOrigin(style.position, canvas.width, canvas.height, boxWidth, boxHeight, margin);
  if (style.showBackground)
    drawEdgeGradient(ctx, canvas, style.position, origin.y, boxHeight, style.backgroundOpacity);
  ctx.globalAlpha = style.opacity;
  ctx.fillStyle = style.textColor;
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = big * 0.06;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const center = origin.y + boxHeight / 2;
  ctx.font = `400 ${big}px ${serif}`;
  ctx.fillText(day, origin.x, center, m.dayWidth);
  const ruleX = origin.x + m.dayWidth + m.gap / 2;
  ctx.fillRect(ruleX - big * 0.004, center - big * 0.3, Math.max(1, big * 0.008), big * 0.6);
  const infoX = origin.x + m.dayWidth + m.gap;
  const rows = [head, ...captions];
  const rowHeight = big * 0.25;
  rows.forEach((text, index) => {
    const size = big * (index ? 0.19 : 0.2);
    ctx.font = `${index ? 400 : 600} ${size}px ${sans}`;
    ctx.globalAlpha = style.opacity * (index ? 0.88 : 1);
    ctx.fillText(ellipsize(ctx, text, infoWidth), infoX, center + (index - (rows.length - 1) / 2) * rowHeight, infoWidth);
  });
  ctx.restore();
}

function getBoxOrigin(
  position: string,
  width: number,
  height: number,
  boxWidth: number,
  boxHeight: number,
  margin: number,
) {
  const minX = Math.min(margin, Math.max(0, width - boxWidth));
  const maxX = Math.max(minX, width - boxWidth - margin);
  const minY = Math.min(margin, Math.max(0, height - boxHeight));
  const maxY = Math.max(minY, height - boxHeight - margin);

  switch (position) {
    case "top-left":
      return { x: minX, y: minY };
    case "top-right":
      return { x: maxX, y: minY };
    case "top-center":
      return {
        x: Math.min(maxX, Math.max(minX, (width - boxWidth) / 2)),
        y: minY,
      };
    case "bottom-right":
      return { x: maxX, y: maxY };
    case "bottom-center":
      return {
        x: Math.min(maxX, Math.max(minX, (width - boxWidth) / 2)),
        y: maxY,
      };
    case "bottom-left":
    default:
      return { x: minX, y: maxY };
  }
}

export function drawIcon(
  ctx: CanvasRenderingContext2D,
  type: string,
  x: number,
  y: number,
  size: number,
) {
  ctx.save();
  ctx.lineWidth = Math.max(2, size * 0.12);
  ctx.strokeStyle = ctx.fillStyle;
  ctx.fillStyle = ctx.strokeStyle;

  if (type === "clock") {
    ctx.beginPath();
    ctx.arc(x + size / 2, y, size * 0.36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + size / 2, y);
    ctx.lineTo(x + size / 2, y - size * 0.2);
    ctx.moveTo(x + size / 2, y);
    ctx.lineTo(x + size * 0.66, y + size * 0.08);
    ctx.stroke();
  } else {
    // Normalized paths keep the four symbols aligned at every export resolution.
    ctx.translate(x, y - size / 2);
    ctx.scale(size, size);
    ctx.lineWidth = 0.075;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (type === "heart") {
      ctx.moveTo(0.5, 0.83);
      ctx.bezierCurveTo(0.38, 0.72, 0.12, 0.55, 0.12, 0.34);
      ctx.bezierCurveTo(0.12, 0.12, 0.39, 0.09, 0.5, 0.29);
      ctx.bezierCurveTo(0.61, 0.09, 0.88, 0.12, 0.88, 0.34);
      ctx.bezierCurveTo(0.88, 0.55, 0.62, 0.72, 0.5, 0.83);
      ctx.closePath();
    } else if (type === "pin") {
      ctx.moveTo(0.5, 0.89);
      ctx.bezierCurveTo(0.41, 0.77, 0.19, 0.54, 0.19, 0.36);
      ctx.bezierCurveTo(0.19, 0.02, 0.81, 0.02, 0.81, 0.36);
      ctx.bezierCurveTo(0.81, 0.54, 0.59, 0.77, 0.5, 0.89);
      ctx.closePath();
      ctx.moveTo(0.60, 0.36);
      ctx.arc(0.5, 0.36, 0.10, 0, Math.PI * 2);
    } else if (type === "target") {
      ctx.arc(0.5, 0.5, 0.27, 0, Math.PI * 2);
      ctx.moveTo(0.59, 0.5);
      ctx.arc(0.5, 0.5, 0.09, 0, Math.PI * 2);
      for (const [ax, ay, bx, by] of [[0.5, 0.10, 0.5, 0.26], [0.5, 0.74, 0.5, 0.90], [0.10, 0.5, 0.26, 0.5], [0.74, 0.5, 0.90, 0.5]]) {
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
    } else if (type === "star") {
      ctx.moveTo(0.5, 0.10);
      ctx.quadraticCurveTo(0.57, 0.43, 0.88, 0.5);
      ctx.quadraticCurveTo(0.57, 0.57, 0.5, 0.90);
      ctx.quadraticCurveTo(0.43, 0.57, 0.12, 0.5);
      ctx.quadraticCurveTo(0.43, 0.43, 0.5, 0.10);
      ctx.closePath();
    }
    ctx.stroke();
  }

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败。"));
    image.src = url;
  });
}
