import type { PrintSettings, RenderOptions, WatermarkStyle } from "../types";
import { drawPostcard } from "./postcard";

type Frame = WatermarkStyle["frame"];
type Line = { icon: string; text: string };

export function frameSpacing(unit: number, frame: Frame, style: Partial<WatermarkStyle> = {}, size: PrintSettings["size"] = "original") {
  const factor = style.frameWidth === "narrow" ? 0.58 : style.frameWidth === "wide" ? 1.4 : 1;
  const footerScale = Number.isFinite(style.frameFooterScale) ? Math.min(1.5, Math.max(0.85, style.frameFooterScale!)) : 1;
  const presets = { "3": [50.8, 3, 12, 3], "5": [88.9, 5, 18, 4], "6": [101.6, 6, 21, 5] };
  const preset = size === "original" ? undefined : presets[size];
  const inset = preset ? unit / preset[0] * preset[1] * factor : unit * 0.06 * factor;
  const baseFooter = preset ? unit / preset[0] * preset[2] : unit * 0.24;
  const footer = baseFooter * (frame === "growth" || frame === "postcard" ? 1 : 0.9) * footerScale;
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

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  lines: Line[],
  options: RenderOptions,
  margin: number,
) {
  const frame = options.style.frame ?? "minimal";
  const dark = frame === "film" || frame === "noir";
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
  ctx.fillStyle = dark ? "#131514" : frame === "growth" ? "#fffafb" : "#ffffff";
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
  rows.forEach((text, index) => {
    let font = Math.min(
      unit * options.style.fontSizeRatio * (index ? 0.7 : 1),
      contentHeight / (rows.length * 1.65),
    );
    const family =
      frame === "film"
        ? "monospace"
        : "sans-serif";
    const weight = index ? 400 : 600;
    ctx.font = `${weight} ${font}px ${family}`;
    font *= Math.min(1, available / Math.max(1, ctx.measureText(text).width));
    ctx.font = `${weight} ${font}px ${family}`;
    ctx.fillStyle = options.style.textColor;
    ctx.globalAlpha = options.style.opacity * (index ? 0.72 : 1);
    ctx.fillText(
      text,
      x,
      center + ((index - (rows.length - 1) / 2) * contentHeight) / rows.length,
      available,
    );
  });
  if (frame === "film" || frame === "gallery") {
    ctx.textAlign = frame === "film" ? "left" : "center";
    ctx.fillStyle = frame === "film" ? "#d7b687" : "#717a74";
    ctx.globalAlpha = options.style.opacity;
    const font = Math.min(unit * 0.019, Math.max(1, top - margin) * 0.65);
    ctx.font = `600 ${font}px sans-serif`;
    ctx.fillText(
      "TIME IMPRINT",
      frame === "film" ? safe : canvas.width / 2,
      (margin + top) / 2,
      available,
    );
  }
  ctx.restore();
}
