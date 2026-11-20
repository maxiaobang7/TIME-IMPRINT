import type { WatermarkFont } from "../types";

// Explicit CJK stacks: plain "sans-serif" on Windows often falls back to SimSun
// at small sizes, which looks thin and dated on photos.
export const fontStacks: Record<WatermarkFont, string> = {
  sans: '"PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei", "Noto Sans SC", "Source Han Sans SC", sans-serif',
  serif: '"Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", "SimSun", serif',
  hand: '"PostcardHand", "KaiTi", "STKaiti", serif',
  mono: '"DIN Alternate", "DIN Condensed", "Bahnschrift", "Roboto Mono", "Consolas", monospace',
};

export const fontOptions: Array<{ id: WatermarkFont; label: string }> = [
  { id: "sans", label: "黑体" },
  { id: "serif", label: "宋体" },
  { id: "hand", label: "手写" },
  { id: "mono", label: "数字" },
];

export function fontStack(font: WatermarkFont | undefined, fallback: WatermarkFont = "sans") {
  return fontStacks[font ?? fallback];
}

/** Regular weight for scripts and serif titles; bold looks heavy-handed there. */
export function titleWeight(font: WatermarkFont | undefined) {
  return font === "hand" ? 400 : font === "serif" ? 600 : 600;
}

export function needsHandFont(style: { frame?: string; fontFamily?: WatermarkFont }) {
  return style.frame === "postcard" || style.fontFamily === "hand";
}
