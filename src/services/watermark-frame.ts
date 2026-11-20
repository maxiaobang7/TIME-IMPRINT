import type { PhotoMeta, PrintSettings, RenderOptions, WatermarkStyle } from "../types";
import { drawPostcard } from "./postcard";
import { fontStack, titleWeight } from "./fonts";

type Frame = WatermarkStyle["frame"];
type Line = { icon: string; text: string };

const footerFactor = (frame: Frame) =>
  frame === "polaroid" ? 1.3 : frame === "camera" ? 0.62 : frame === "growth" || frame === "postcard" ? 1 : 0.9;

export function frameSpacing(unit: number, frame: Frame, style: Partial<WatermarkStyle> = {}, size: PrintSettings["size"] = "original") {
  const factor = style.frameWidth === "narrow" ? 0.58 : style.frameWidth === "wide" ? 1.4 : 1;
  const footerScale = Number.isFinite(style.frameFooterScale) ? Math.min(1.5, Math.max(0.85, style.frameFooterScale!)) : 1;
  const presets = { "3": [50.8, 3, 12, 3], "5": [88.9, 5, 18, 4], "6": [101.6, 6, 21, 5] };
  const preset = size === "original" ? undefined : presets[size];
  // The camera bar keeps the photo almost edge to edge, like a phone-camera watermark.
  const insetRatio = frame === "camera" ? 0.018 : 0.06;
  const inset = preset ? unit / preset[0] * preset[1] * factor : unit * insetRatio * factor;
  const baseFooter = preset ? unit / preset[0] * preset[2] : unit * 0.24;
  const footer = baseFooter * footerFactor(frame) * footerScale;
  const safe = preset ? unit / preset[0] * preset[3] : unit * 0.045;
  return { inset, top: inset + (frame === "gallery" || frame === "film" ? unit * 0.055 : 0), footer, safe };
}

export function frameGeometry(
  width: number,
  height: number,
  frame: Frame = "minimal",
  style: Partial<WatermarkStyle> = {},
) {
  const unit = Math.min(width, height);
  const { inset, top, footer } = frameSpacing(unit, frame, style);
  return {
    width: width + inset * 2,
    height: height + top + footer,
    inset,
    top,
    footer,
  };
}

const paperColors: Partial<Record<NonNullable<Frame>, string>> = {
  film: "#131514",
  noir: "#131514",
  growth: "#fffafb",
  polaroid: "#fbf8f2",
};

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  lines: Line[],
  options: RenderOptions,
  margin: number,
) {
  const frame = options.style.frame ?? "minimal";
  const unit = Math.min(canvas.width, canvas.height);
  const free =
    !options.printSettings || options.printSettings.size === "original";
  const geometry = frameGeometry(
    image.naturalWidth,
    image.naturalHeight,
    frame,
    options.style,
  );
  const scale = canvas.width / geometry.width;
  const spacing = frameSpacing(unit, frame, options.style, options.printSettings?.size);
  const inset = free ? geometry.inset * scale : spacing.inset;
  const top = free
    ? geometry.top * scale
    : Math.max(spacing.top, frame === "gallery" || frame === "film" ? margin + unit * 0.055 : 0);
  const footer = free
    ? geometry.footer * scale
    : Math.max(spacing.footer, margin + unit * 0.09);
  const width = Math.max(1, canvas.width - inset * 2);
  const height = Math.max(1, canvas.height - top - footer);
  ctx.fillStyle = paperColors[frame] ?? "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Free-size frames grow around the image; only fixed paper may crop by explicit choice.
  const fit =
    !free && options.printSettings?.fit === "cover" ? Math.max : Math.min;
  const factor = fit(width / image.naturalWidth, height / image.naturalHeight);
  ctx.save();
  ctx.beginPath();
  ctx.rect(inset, top, width, height);
  ctx.clip();
  ctx.drawImage(
    image,
    inset + (width - image.naturalWidth * factor) / 2,
    top + (height - image.naturalHeight * factor) / 2,
    image.naturalWidth * factor,
    image.naturalHeight * factor,
  );
  ctx.restore();
  const footerTop = canvas.height - footer;
  const safe = Math.max(margin, spacing.safe, inset);
  const available = Math.max(1, canvas.width - safe * 2);
  if (frame === "postcard") {
    const y = footerTop + unit * 0.02;
    drawPostcard(ctx, options, lines, { x: safe, y, width: available, height: Math.max(1, canvas.height - safe - y), unit });
    return;
  }
  if (frame === "camera") {
    const contentTop = footerTop + Math.min(unit * 0.012, footer * 0.1);
    drawCameraBar(ctx, options, lines, {
      x: Math.max(safe, unit * 0.035),
      y: contentTop,
      width: Math.max(1, canvas.width - Math.max(safe, unit * 0.035) * 2),
      height: Math.max(1, canvas.height - Math.max(margin, unit * 0.01) - contentTop),
      unit,
    });
    return;
  }
  const titleLine =
    lines.find(
      (line) => line.icon === (frame === "growth" ? "heart" : "star"),
    ) ?? lines[0];
  const secondary = lines
    .filter((line) => line !== titleLine)
    .map((line) => line.text)
    .join("  ·  ");
  const rows = [titleLine?.text, secondary].filter(
    (text): text is string => !!text,
  );
  const contentTop =
    footerTop +
    (frame === "growth" ? unit * 0.04 : unit * 0.025);
  const contentBottom = canvas.height - safe;
  const contentHeight = Math.max(1, contentBottom - contentTop);
  const center = (contentTop + contentBottom) / 2;
  ctx.save();
  ctx.globalAlpha = options.style.opacity;
  if (frame === "growth") {
    ctx.fillStyle = "#d69ca6";
    const y = footerTop + unit * 0.024;
    ctx.beginPath();
    ctx.arc(canvas.width / 2, y, unit * 0.006, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(
      canvas.width / 2 - unit * 0.055,
      y - unit * 0.001,
      unit * 0.025,
      unit * 0.002,
    );
    ctx.fillRect(
      canvas.width / 2 + unit * 0.03,
      y - unit * 0.001,
      unit * 0.025,
      unit * 0.002,
    );
  }
  ctx.textAlign =
    options.style.position === "bottom-center"
      ? "center"
      : options.style.position.endsWith("right")
        ? "right"
        : "left";
  const x =
    ctx.textAlign === "center"
      ? canvas.width / 2
      : ctx.textAlign === "right"
        ? canvas.width - safe
        : safe;
  ctx.textBaseline = "middle";
  const titleFont = options.style.fontFamily ?? (frame === "film" ? "mono" : "sans");
  rows.forEach((text, index) => {
    // Polaroid captions are a handwritten line with a quieter printed date below.
    let font = Math.min(
      unit * options.style.fontSizeRatio * (index ? (frame === "polaroid" ? 0.42 : 0.7) : 1),
      contentHeight / (rows.length * (frame === "polaroid" && !index ? 1.2 : 1.65)),
    );
    const family = index ? fontStack("sans") : fontStack(titleFont);
    const weight = index ? 400 : titleWeight(titleFont);
    ctx.font = `${weight} ${font}px ${family}`;
    font *= Math.min(1, available / Math.max(1, ctx.measureText(text).width));
    ctx.font = `${weight} ${font}px ${family}`;
    ctx.fillStyle = options.style.textColor;
    ctx.globalAlpha = options.style.opacity * (index ? 0.68 : 1);
    const offset = frame === "polaroid" && rows.length > 1 ? (index ? 0.22 : -0.12) * contentHeight : ((index - (rows.length - 1) / 2) * contentHeight) / rows.length;
    ctx.fillText(text, x, center + offset, available);
  });
  if (frame === "film" || frame === "gallery") {
    ctx.textAlign = frame === "film" ? "left" : "center";
    ctx.fillStyle = frame === "film" ? "#d7b687" : "#717a74";
    ctx.globalAlpha = options.style.opacity;
    const font = Math.min(unit * 0.019, Math.max(1, top - margin) * 0.65);
    ctx.font = `600 ${font}px ${fontStack("sans")}`;
    ctx.fillText(
      "TIME IMPRINT",
      frame === "film" ? safe : canvas.width / 2,
      (margin + top) / 2,
      available,
    );
  }
  ctx.restore();
}

/** "Apple iPhone 15 Pro" → "iPhone 15 Pro"; "SONY ILCE-7M4" keeps the brand. */
export function cameraName(meta: PhotoMeta) {
  const make = meta.cameraMake?.trim() ?? "";
  const model = meta.cameraModel?.trim() ?? "";
  if (!model) return make;
  if (!make || /^apple$/i.test(make)) return model;
  const brand = make.split(/\s+/)[0].toLowerCase();
  return model.toLowerCase().includes(brand) ? model : `${make} ${model}`;
}

/** Phone-camera style info bar: device and exposure left, date and place right. */
function drawCameraBar(
  ctx: CanvasRenderingContext2D,
  options: RenderOptions,
  lines: Line[],
  box: { x: number; y: number; width: number; height: number; unit: number },
) {
  const { style, photo } = options;
  const { x, y, width, height, unit } = box;
  const find = (icon: string) => lines.find((line) => line.icon === icon)?.text ?? "";
  const event = find("star");
  const baby = find("heart");
  const leftTitle = cameraName(photo.meta ?? {}) || event || baby || "TIME IMPRINT";
  const leftSub = [photo.meta?.exposure, leftTitle === event ? baby : event || baby]
    .find((text) => !!text) ?? "";
  const rightTitle = find("clock") || find("pin");
  const rightSub = [find("pin"), find("target")].find((text) => text && text !== rightTitle) ?? "";
  const family = fontStack(style.fontFamily);
  const center = y + height / 2;
  const titleSize = Math.min(unit * style.fontSizeRatio * 0.82, height * 0.34);
  const subSize = titleSize * 0.74;
  const rowGap = titleSize * 0.72;
  const half = width * 0.47;
  ctx.save();
  ctx.globalAlpha = style.opacity;
  ctx.textBaseline = "middle";
  const text = (value: string, left: number, centerY: number, size: number, weight: number, color: string, align: CanvasTextAlign) => {
    if (!value) return;
    ctx.font = `${weight} ${size}px ${family}`;
    const fitted = size * Math.min(1, half / Math.max(1, ctx.measureText(value).width));
    ctx.font = `${weight} ${fitted}px ${family}`;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(value, left, centerY, half);
  };
  const muted = "#8b8f8c";
  text(leftTitle, x, leftSub ? center - rowGap : center, titleSize, 700, style.textColor, "left");
  text(leftSub, x, center + rowGap, subSize, 400, muted, "left");
  text(rightTitle, x + width, rightSub ? center - rowGap : center, titleSize, 600, style.textColor, "right");
  text(rightSub, x + width, center + rowGap, subSize, 400, muted, "right");
  if (rightTitle) {
    // Thin divider with a small dot mark, measured from the widest right-hand label.
    ctx.font = `600 ${titleSize}px ${family}`;
    const titleWidth = Math.min(half, ctx.measureText(rightTitle).width);
    ctx.font = `400 ${subSize}px ${family}`;
    const subWidth = Math.min(half, rightSub ? ctx.measureText(rightSub).width : 0);
    const ruleX = x + width - Math.max(titleWidth, subWidth) - titleSize * 0.9;
    if (ruleX > x + half * 0.9) {
      ctx.fillStyle = "#d4d6d4";
      ctx.fillRect(ruleX, center - titleSize * 1.05, Math.max(1, unit * 0.0015), titleSize * 2.1);
      ctx.fillStyle = style.textColor;
      ctx.beginPath();
      ctx.arc(ruleX - titleSize * 0.95, center, titleSize * 0.34, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
