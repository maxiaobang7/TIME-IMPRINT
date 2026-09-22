import type { RenderOptions } from "../types";

export const postcardMessage = "陪你，慢慢看世界";
export const postcardFont = '"PostcardHand", "KaiTi", "STKaiti", serif';

export function postcardSignature(name: string) {
  return name.trim() ? `${name.trim()}的旅行日记` : "我们的旅行日记";
}

export async function loadPostcardFont() {
  if (typeof document !== "undefined" && document.fonts) {
    // A bundled font makes the preview and exported canvas use identical lettering.
    await document.fonts.load('24px "PostcardHand"');
  }
}

export function drawPostcard(
  ctx: CanvasRenderingContext2D,
  options: RenderOptions,
  lines: { icon: string; text: string }[],
  box: { x: number; y: number; width: number; height: number; unit: number },
) {
  const { x, y, width, height, unit } = box;
  const { style, photo, babyProfile } = options;
  const stamp = style.postcardStamp !== false;
  const message = photo.postcardMessage ?? postcardMessage;
  const signature = photo.postcardSignature ?? postcardSignature(babyProfile.name);
  const divider = x + width * 0.29;
  const gap = width * 0.035;
  const textStart = divider + gap;
  const stampSize = Math.min(height * 0.85, width * 0.115);
  const end = x + width - (stamp ? stampSize + gap : 0);
  const textWidth = Math.max(1, end - textStart);
  const accent = "#98bce7";
  ctx.save();
  ctx.globalAlpha = style.opacity;
  ctx.textBaseline = "middle";
  ctx.fillStyle = style.textColor;
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(0.5, unit * 0.0015);
  if (lines.length) {
    ctx.beginPath();
    ctx.moveTo(divider, y + height * 0.12);
    ctx.lineTo(divider, y + height * 0.88);
    ctx.stroke();
  }
  const text = (value: string, left: number, centerY: number, maxWidth: number, size: number, family: string, align: CanvasTextAlign = "left") => {
    ctx.font = `400 ${size}px ${family}`;
    const fitted = size * Math.min(1, maxWidth / Math.max(1, ctx.measureText(value).width));
    ctx.font = `400 ${fitted}px ${family}`;
    ctx.textAlign = align;
    ctx.fillText(value, left, centerY, maxWidth);
  };
  lines.forEach((line, i) => {
    const row = height / Math.max(2, lines.length);
    const size = Math.min(unit * style.fontSizeRatio * 0.58, row * 0.62);
    const centerY = y + (height - row * lines.length) / 2 + (i + 0.5) * row;
    const pin = line.icon === "pin" ? size * 1.25 : 0;
    if (pin) {
      ctx.save();
      ctx.strokeStyle = style.textColor;
      ctx.translate(x, centerY - size * 0.5);
      ctx.scale(size, size);
      ctx.lineWidth = 0.09;
      ctx.beginPath();
      ctx.moveTo(0.38, 1);
      ctx.bezierCurveTo(-0.38, 0.18, 0.08, -0.28, 0.38, 0);
      ctx.bezierCurveTo(0.95, -0.14, 1.05, 0.35, 0.38, 1);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0.4, 0.28, 0.12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    text(line.text, x + pin, centerY, divider - x - gap - pin, size, "sans-serif");
  });
  if (message) {
    text(message, textStart, y + height * (signature ? 0.34 : 0.5), textWidth, Math.min(unit * style.fontSizeRatio, height * 0.44), postcardFont);
    if (style.postcardUnderline !== false) {
      ctx.beginPath();
      ctx.moveTo(textStart + textWidth * 0.3, y + height * 0.66);
      ctx.quadraticCurveTo(textStart + textWidth * 0.58, y + height * 0.57, textStart + textWidth * 0.88, y + height * 0.61);
      ctx.stroke();
    }
  }
  if (signature) text(signature, end, y + height * (message ? 0.87 : 0.5), textWidth, Math.min(unit * style.fontSizeRatio * 0.45, height * 0.22), postcardFont, "right");
  if (stamp) drawPostmark(ctx, x + width - stampSize / 2, y + height / 2, stampSize);
  ctx.restore();
}

function drawPostmark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  ctx.lineWidth = 0.014;
  for (const radius of [0.46, 0.41]) {
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(0, -0.13, 0.095, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * 0.14, -0.13 + Math.sin(angle) * 0.14);
    ctx.lineTo(Math.cos(angle) * 0.19, -0.13 + Math.sin(angle) * 0.19);
    ctx.stroke();
  }
  for (const row of [0.15, 0.23, 0.31]) {
    ctx.beginPath();
    ctx.moveTo(-0.3, row);
    ctx.bezierCurveTo(-0.15, row - 0.12, -0.03, row + 0.12, 0.12, row);
    ctx.bezierCurveTo(0.2, row - 0.05, 0.25, row - 0.04, 0.3, row);
    ctx.stroke();
  }
  ctx.restore();
}
