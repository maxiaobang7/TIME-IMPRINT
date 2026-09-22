import type { PrintSettings } from "../types";

export const defaultPrintSettings: PrintSettings = { size: "original", fit: "contain", marginMm: 3 };
export const printSizes = [
  { id: "original", label: "自由尺寸 · 完整照片", width: 0, height: 0 },
  { id: "3", label: "3 寸 · 76 × 51 mm", width: 76.2, height: 50.8 },
  { id: "5", label: "5 寸 · 127 × 89 mm", width: 127, height: 88.9 },
  { id: "6", label: "6 寸 · 152 × 102 mm", width: 152.4, height: 101.6 }
] as const;

export function printLayout(sourceWidth: number, sourceHeight: number, settings = defaultPrintSettings) {
  if (!(sourceWidth > 0 && sourceHeight > 0)) throw new Error("照片尺寸无效");
  const preset = printSizes.find((size) => size.id === settings.size) ?? printSizes[0];
  const landscape = sourceWidth >= sourceHeight;
  const paperWidth = landscape ? preset.width : preset.height;
  const paperHeight = landscape ? preset.height : preset.width;
  const scale = Math.min(1, 3200 / Math.max(sourceWidth, sourceHeight));
  const width = paperWidth ? Math.round(paperWidth / 25.4 * 300) : Math.max(1, Math.round(sourceWidth * scale));
  const height = paperHeight ? Math.round(paperHeight / 25.4 * 300) : Math.max(1, Math.round(sourceHeight * scale));
  const factor = (settings.fit === "cover" ? Math.max : Math.min)(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * factor;
  const drawHeight = sourceHeight * factor;
  const margin = paperWidth
    ? Math.min(10, Math.max(2, settings.marginMm)) / 25.4 * 300
    : Math.min(width, height) * 0.07;
  return {
    width, height, margin,
    paperWidth: paperWidth || width / 300 * 25.4,
    paperHeight: paperHeight || height / 300 * 25.4,
    x: (width - drawWidth) / 2, y: (height - drawHeight) / 2,
    drawWidth, drawHeight
  };
}
