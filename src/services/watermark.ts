import type {
  BabyProfile,
  PhotoItem,
  RenderOptions,
  WatermarkStyle,
} from "../types";
import { babyAgeText } from "../utils/date";
import { printLayout } from "./print-layout";
import { withPrintDensity } from "./image-density";
import { drawFrame, frameGeometry } from "./watermark-frame";
import { loadPostcardFont } from "./postcard";

export async function renderWatermark(options: RenderOptions): Promise<Blob> {
  if (options.style.frame === "postcard") await loadPostcardFont();
  const image = await loadImage(options.photo.previewUrl);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前浏览器无法创建 Canvas。");

  const layout = printLayout(
    image.naturalWidth,
    image.naturalHeight,
    options.printSettings,
  );
  if (
    options.style.layout === "paper" &&
    (!options.printSettings || options.printSettings.size === "original")
  ) {
    const geometry = frameGeometry(
      layout.width,
      layout.height,
      options.style.frame,
      options.style,
    );
    const scale = Math.min(1, 3200 / Math.max(geometry.width, geometry.height));
    layout.width = geometry.width * scale;
    layout.height = geometry.height * scale;
    layout.margin = geometry.inset * scale;
  }
  if (options.maxEdge) {
    const scale = Math.min(
      1,
      options.maxEdge / Math.max(layout.width, layout.height),
    );
    for (const key of [
      "width",
      "height",
      "margin",
      "x",
      "y",
      "drawWidth",
      "drawHeight",
    ] as const)
      layout[key] *= scale;
  }
  canvas.width = layout.width;
  canvas.height = layout.height;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const lines = buildWatermarkLines(
    options.photo,
    options.style,
    options.babyProfile,
  );
  if (options.style.layout === "paper") {
    drawFrame(ctx, canvas, image, lines, options, layout.margin);
  } else {
    ctx.drawImage(
      image,
      layout.x,
      layout.y,
      layout.drawWidth,
      layout.drawHeight,
    );
    drawWatermark(ctx, canvas, lines, options.style, layout.margin);
  }

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

  return withPrintDensity(blob);
}

export function buildWatermarkLines(
  photo: PhotoItem,
  style: WatermarkStyle,
  babyProfile: BabyProfile,
) {
  const lines: Array<{ icon: string; text: string }> = [];

  if (style.showBabyAge) {
    const age = photo.meta.capturedAt
      ? babyAgeText(babyProfile.birthday, photo.meta.capturedAt)
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

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  lines: Array<{ icon: string; text: string }>,
  style: WatermarkStyle,
  printMargin: number,
) {
  if (!lines.length) return;

  const minSide = Math.min(canvas.width, canvas.height);
  let fontSize = Math.max(1, minSide * style.fontSizeRatio);
  const availableWidth = Math.max(1, canvas.width - printMargin * 2);
  const availableHeight = Math.max(1, canvas.height - printMargin * 2);
  // Fit the entire label before positioning; never squeeze individual glyphs.
  ctx.save();
  ctx.font = `600 ${fontSize}px sans-serif`;
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

  ctx.font = `600 ${fontSize}px sans-serif`;
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

  if (style.showBackground) {
    ctx.fillStyle = `rgba(0, 0, 0, ${style.backgroundOpacity})`;
    roundRect(ctx, origin.x, origin.y, boxWidth, boxHeight, fontSize * 0.62);
    ctx.fill();
  }

  ctx.globalAlpha = style.opacity;
  ctx.fillStyle = style.textColor;
  if (!style.showBackground) {
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
