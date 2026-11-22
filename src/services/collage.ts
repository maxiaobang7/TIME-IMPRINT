import { fontStack } from "./fonts";
import { sourceSize, type Drawable, type Surface } from "./surface";

export type CollageLayout = "grid" | "compare" | "hero" | "polaroid" | "film" | "timeline";
export type CollageTheme = "cream" | "white" | "dark" | "pink" | "blue" | "green";

export interface CollageCell {
  image: Drawable;
  /** Badge text, e.g. "3个月" or "2026.09.22"; empty hides the badge. */
  label: string;
}

export interface CollageOptions {
  layout: CollageLayout;
  title: string;
  subtitle: string;
  theme: CollageTheme;
  /** Output width in pixels; height follows from the layout. */
  width: number;
}

export const collageLimits: Record<CollageLayout, { min: number; max: number }> = {
  grid: { min: 2, max: 12 },
  compare: { min: 2, max: 2 },
  hero: { min: 3, max: 10 },
  polaroid: { min: 2, max: 8 },
  film: { min: 2, max: 6 },
  timeline: { min: 2, max: 8 },
};

export const collageThemes: Record<CollageTheme, { bg: string; ink: string; muted: string; accent: string; badge: string; badgeInk: string }> = {
  cream: { bg: "#fbf8f2", ink: "#2a2420", muted: "#8a7f76", accent: "#c0552f", badge: "rgba(255, 253, 249, 0.9)", badgeInk: "#2a2420" },
  white: { bg: "#ffffff", ink: "#1f2120", muted: "#7d827f", accent: "#2f2f2f", badge: "rgba(255, 255, 255, 0.9)", badgeInk: "#1f2120" },
  dark: { bg: "#1d1b19", ink: "#f5efe6", muted: "#a89f95", accent: "#f6b15d", badge: "rgba(0, 0, 0, 0.55)", badgeInk: "#ffffff" },
  pink: { bg: "#fbeef0", ink: "#4a2a30", muted: "#a07c83", accent: "#d9667a", badge: "rgba(255, 250, 251, 0.92)", badgeInk: "#4a2a30" },
  blue: { bg: "#eaf2f7", ink: "#22384a", muted: "#7690a3", accent: "#3f7cac", badge: "rgba(250, 253, 255, 0.92)", badgeInk: "#22384a" },
  green: { bg: "#eef3e8", ink: "#2c3a26", muted: "#7f8f76", accent: "#5f8a4a", badge: "rgba(251, 253, 249, 0.92)", badgeInk: "#2c3a26" },
};

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CollageBox extends Rect {
  /** Polaroid: the white card around the photo, and its tilt in radians. */
  card?: Rect;
  rotate?: number;
  /** Timeline: the vertical centre of the label row above the photo. */
  labelY?: number;
}

/** Geometry for a collage of `count` photos; pure, so it can be tested and used to size a canvas first. */
export function collageGeometry(count: number, options: Pick<CollageOptions, "layout" | "title" | "subtitle" | "width">) {
  const width = Math.max(200, Math.round(options.width));
  const pad = width * 0.05;
  const gap = width * 0.018;
  const inner = width - pad * 2;
  const header = options.title.trim() ? width * (options.subtitle.trim() ? 0.15 : 0.11) : 0;
  const footer = width * 0.07;
  const top = pad + header;
  const cells: CollageBox[] = [];
  let columns = 1;
  let bottom = top;
  let strip: Rect | undefined;

  // Rows of equal cells, a short last row centred.
  const rows = (start: number, n: number, cols: number, y: number, ratio: number, spacing = gap) => {
    const cellWidth = (inner - spacing * (cols - 1)) / cols;
    const cellHeight = cellWidth * ratio;
    for (let index = 0; index < n; index++) {
      const row = Math.floor(index / cols);
      const inRow = Math.min(cols, n - row * cols);
      const offset = ((cols - inRow) * (cellWidth + spacing)) / 2;
      cells[start + index] = {
        x: pad + offset + (index % cols) * (cellWidth + spacing),
        y: y + row * (cellHeight + spacing),
        width: cellWidth,
        height: cellHeight,
      };
    }
    const rowCount = Math.ceil(n / cols);
    return y + rowCount * cellHeight + Math.max(0, rowCount - 1) * spacing;
  };

  switch (options.layout) {
    case "hero": {
      // The newest photo large on top, the story so far underneath.
      columns = 3;
      cells[0] = { x: pad, y: top, width: inner, height: inner * 0.75 };
      bottom = count > 1 ? rows(1, count - 1, 3, top + inner * 0.75 + gap, 1) : top + inner * 0.75;
      break;
    }
    case "polaroid": {
      columns = 2;
      const spacing = width * 0.05;
      const cardWidth = (inner - spacing) / 2;
      const margin = cardWidth * 0.07;
      const photo = cardWidth - margin * 2;
      const cardHeight = margin + photo + cardWidth * 0.24;
      const tilts = [-0.045, 0.035, 0.03, -0.035, -0.025, 0.04, 0.035, -0.03];
      for (let index = 0; index < count; index++) {
        const row = Math.floor(index / 2);
        const inRow = Math.min(2, count - row * 2);
        const offset = ((2 - inRow) * (cardWidth + spacing)) / 2;
        const x = pad + offset + (index % 2) * (cardWidth + spacing);
        const y = top + spacing * 0.4 + row * (cardHeight + spacing * 0.8);
        cells[index] = {
          x: x + margin,
          y: y + margin,
          width: photo,
          height: photo,
          card: { x, y, width: cardWidth, height: cardHeight },
          rotate: tilts[index % tilts.length],
        };
      }
      const rowCount = Math.ceil(count / 2);
      bottom = top + spacing * 0.4 + rowCount * cardHeight + (rowCount - 1) * spacing * 0.8 + spacing * 0.4;
      break;
    }
    case "film": {
      // A strip of 3:2 frames with sprocket holes down both sides.
      const photoWidth = inner * 0.76;
      const photoHeight = (photoWidth * 2) / 3;
      const frameGap = width * 0.03;
      const height = count * photoHeight + (count + 1) * frameGap;
      strip = { x: pad, y: top, width: inner, height };
      for (let index = 0; index < count; index++)
        cells[index] = { x: pad + (inner - photoWidth) / 2, y: top + frameGap + index * (photoHeight + frameGap), width: photoWidth, height: photoHeight };
      bottom = top + height;
      break;
    }
    case "timeline": {
      const photoX = pad + inner * 0.14;
      const photoWidth = inner - inner * 0.14;
      const photoHeight = photoWidth * 0.62;
      const labelHeight = width * 0.07;
      const step = labelHeight + photoHeight + gap * 2.5;
      for (let index = 0; index < count; index++) {
        const y = top + index * step;
        cells[index] = { x: photoX, y: y + labelHeight, width: photoWidth, height: photoHeight, labelY: y + labelHeight * 0.45 };
      }
      bottom = top + count * step - gap * 2.5;
      break;
    }
    case "compare":
      columns = Math.min(2, Math.max(1, count));
      bottom = rows(0, count, columns, top, 1.3);
      break;
    default:
      columns = count <= 4 ? Math.min(2, Math.max(1, count)) : 3;
      bottom = rows(0, count, columns, top, 1);
  }

  const height = Math.ceil(bottom + footer);
  return { width, height, pad, gap, header, footer, columns, cells, strip };
}

export function drawCollage(ctx: CanvasRenderingContext2D, canvas: Surface, items: CollageCell[], options: CollageOptions) {
  const geometry = collageGeometry(items.length, options);
  const theme = collageThemes[options.theme];
  const { width, pad, header } = geometry;
  ctx.save();
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (header) {
    const title = options.title.trim();
    const subtitle = options.subtitle.trim();
    let size = width * 0.05;
    ctx.font = `700 ${size}px ${fontStack("serif")}`;
    size *= Math.min(1, (width - pad * 2) / Math.max(1, ctx.measureText(title).width));
    ctx.font = `700 ${size}px ${fontStack("serif")}`;
    ctx.fillStyle = theme.ink;
    ctx.fillText(title, width / 2, pad + (subtitle ? header * 0.36 : header * 0.45), width - pad * 2);
    if (subtitle) {
      ctx.font = `400 ${width * 0.022}px ${fontStack("sans")}`;
      ctx.fillStyle = theme.muted;
      ctx.fillText(subtitle, width / 2, pad + header * 0.72, width - pad * 2);
    }
  }

  const layout = options.layout;
  if (layout === "film" && geometry.strip) drawStrip(ctx, geometry.strip, width, theme.bg);
  if (layout === "timeline" && items.length) {
    const first = geometry.cells[0];
    const last = geometry.cells[items.length - 1];
    const lineX = pad + (first.x - pad) * 0.35;
    ctx.strokeStyle = theme.muted;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = Math.max(1, width * 0.003);
    ctx.beginPath();
    ctx.moveTo(lineX, first.labelY!);
    ctx.lineTo(lineX, last.y + last.height);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  items.forEach((item, index) => {
    const cell = geometry.cells[index];
    if (layout === "polaroid") return drawPolaroid(ctx, cell, item, width, theme);
    if (layout === "timeline") {
      const lineX = pad + (geometry.cells[0].x - pad) * 0.35;
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(lineX, cell.labelY!, width * 0.011, 0, Math.PI * 2);
      ctx.fill();
      if (item.label) {
        ctx.font = `700 ${width * 0.032}px ${fontStack("sans")}`;
        ctx.fillStyle = theme.ink;
        ctx.textAlign = "left";
        ctx.fillText(item.label, cell.x, cell.labelY!, cell.width);
        ctx.textAlign = "center";
      }
    }
    const radius = layout === "film" ? width * 0.004 : width * 0.012;
    drawPhoto(ctx, item.image, cell, radius);
    if (layout === "film") {
      if (item.label) {
        // Orange LED date, like the date back of a film camera.
        ctx.font = `700 ${cell.width * 0.045}px ${fontStack("mono")}`;
        ctx.fillStyle = "#ff9a3d";
        ctx.textAlign = "right";
        ctx.fillText(item.label, cell.x + cell.width * 0.96, cell.y + cell.height * 0.92, cell.width * 0.6);
        ctx.textAlign = "center";
      }
    } else if (layout !== "timeline" && item.label) {
      const small = geometry.columns === 3 && !(layout === "hero" && index === 0);
      drawBadge(ctx, item.label, cell, Math.max(10, Math.min(cell.width * (small ? 0.085 : 0.06), width * 0.03)), theme);
    }
  });

  ctx.font = `600 ${width * 0.017}px ${fontStack("sans")}`;
  ctx.fillStyle = theme.muted;
  ctx.fillText("时光印记 · TIME IMPRINT", width / 2, canvas.height - geometry.footer / 2, width - pad * 2);
  ctx.restore();
}

type Theme = (typeof collageThemes)[CollageTheme];

/** Cover-crops around the centre so the whole cell is filled. */
function drawPhoto(ctx: CanvasRenderingContext2D, image: Drawable, cell: Rect, radius: number) {
  ctx.save();
  roundRect(ctx, cell.x, cell.y, cell.width, cell.height, radius);
  ctx.clip();
  const source = sourceSize(image);
  if (source.width > 0 && source.height > 0) {
    const scale = Math.max(cell.width / source.width, cell.height / source.height);
    const sw = cell.width / scale;
    const sh = cell.height / scale;
    ctx.drawImage(image, (source.width - sw) / 2, (source.height - sh) / 2, sw, sh, cell.x, cell.y, cell.width, cell.height);
  }
  ctx.restore();
}

function drawBadge(ctx: CanvasRenderingContext2D, label: string, cell: Rect, size: number, theme: Theme) {
  ctx.font = `600 ${size}px ${fontStack("sans")}`;
  const textWidth = Math.min(ctx.measureText(label).width, cell.width - size * 2.4);
  const badgeWidth = textWidth + size * 1.2;
  const badgeHeight = size * 1.7;
  const x = cell.x + size * 0.6;
  const y = cell.y + cell.height - badgeHeight - size * 0.6;
  ctx.fillStyle = theme.badge;
  roundRect(ctx, x, y, badgeWidth, badgeHeight, badgeHeight / 2);
  ctx.fill();
  ctx.fillStyle = theme.badgeInk;
  ctx.textAlign = "left";
  ctx.fillText(label, x + size * 0.6, y + badgeHeight / 2, textWidth);
  ctx.textAlign = "center";
}

function drawPolaroid(ctx: CanvasRenderingContext2D, cell: CollageBox, item: CollageCell, width: number, theme: Theme) {
  const card = cell.card!;
  ctx.save();
  ctx.translate(card.x + card.width / 2, card.y + card.height / 2);
  ctx.rotate(cell.rotate ?? 0);
  ctx.translate(-(card.x + card.width / 2), -(card.y + card.height / 2));
  ctx.shadowColor = "rgba(40, 30, 20, 0.18)";
  ctx.shadowBlur = width * 0.015;
  ctx.shadowOffsetY = width * 0.005;
  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(card.x, card.y, card.width, card.height);
  ctx.shadowColor = "transparent";
  drawPhoto(ctx, item.image, cell, 0);
  if (item.label) {
    ctx.font = `400 ${card.width * 0.085}px ${fontStack("hand")}`;
    ctx.fillStyle = theme === collageThemes.dark ? "#3a332d" : theme.ink;
    ctx.fillText(item.label, card.x + card.width / 2, cell.y + cell.height + (card.y + card.height - cell.y - cell.height) / 2, card.width * 0.86);
  }
  ctx.restore();
}

function drawStrip(ctx: CanvasRenderingContext2D, strip: Rect, width: number, holeColor: string) {
  ctx.fillStyle = "#1c1916";
  roundRect(ctx, strip.x, strip.y, strip.width, strip.height, width * 0.008);
  ctx.fill();
  const holeWidth = strip.width * 0.045;
  const holeHeight = holeWidth * 0.7;
  const spacing = holeHeight * 2.1;
  const count = Math.floor((strip.height - spacing * 0.5) / spacing);
  const startY = strip.y + (strip.height - count * spacing) / 2 + (spacing - holeHeight) / 2;
  ctx.fillStyle = holeColor;
  for (let index = 0; index < count; index++) {
    const y = startY + index * spacing;
    for (const x of [strip.x + strip.width * 0.04, strip.x + strip.width * 0.96 - holeWidth]) {
      roundRect(ctx, x, y, holeWidth, holeHeight, holeHeight * 0.25);
      ctx.fill();
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  if (r <= 0) {
    ctx.rect(x, y, width, height);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
