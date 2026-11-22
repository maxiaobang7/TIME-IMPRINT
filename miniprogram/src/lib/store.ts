import type { BabyProfile, PrintSettings, WatermarkStyle, WatermarkTemplate } from "../../../src/types";
import { defaultPrintSettings } from "../../../src/services/print-layout";
import { allTemplates } from "../../../src/data/templates";

const templateKey = "ti:template";
const styleKey = "ti:style";
const babyKey = "ti:baby";
const printKey = "ti:print";

function read<T>(key: string): T | undefined {
  try {
    const value = wx.getStorageSync(key);
    return value === "" ? undefined : (value as T);
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown) {
  try {
    wx.setStorageSync(key, value);
  } catch {
    // Storage full or unavailable: the setting simply isn't remembered.
  }
}

/** WeChat strips camera EXIF, so templates built on it are swapped for mini-program ones. */
export const templates = allTemplates.filter((item) => item.platform !== "web");

export function templateById(id?: string): WatermarkTemplate {
  return templates.find((item) => item.id === id) ?? templates[0];
}

export function loadTemplateId() {
  return templateById(read<string>(templateKey)).id;
}

/** Choosing a template resets any tweaks so it looks like its preview. */
export function saveTemplateId(id: string) {
  write(templateKey, id);
  write(styleKey, { templateId: id, style: templateById(id).style });
}

export function loadStyle(templateId: string): WatermarkStyle {
  const base = templateById(templateId).style;
  const saved = read<{ templateId: string; style: WatermarkStyle }>(styleKey);
  return saved?.templateId === templateId ? { ...base, ...saved.style } : { ...base };
}

export function saveStyle(templateId: string, style: WatermarkStyle) {
  write(styleKey, { templateId, style });
}

export function loadBaby(): BabyProfile {
  return { name: "", birthday: "", ...read<BabyProfile>(babyKey) };
}

export function saveBaby(baby: BabyProfile) {
  write(babyKey, baby);
}

export function loadPrint(): PrintSettings {
  return { ...defaultPrintSettings, ...read<PrintSettings>(printKey) };
}

export function savePrint(settings: PrintSettings) {
  write(printKey, settings);
}

export type RecentKind = "date" | "location" | "event";
const recentLimit = 8;

/** Values the person used before, newest first. Dates are stored as YYYY-MM-DD. */
export function loadRecent(kind: RecentKind): string[] {
  const list = read<string[]>(`ti:recent:${kind}`);
  return Array.isArray(list) ? list.filter((item) => typeof item === "string" && item.trim()) : [];
}

export function pushRecent(kind: RecentKind, values: string[]) {
  const fresh = values.map((value) => value.trim()).filter(Boolean);
  if (!fresh.length) return;
  const merged = [...fresh, ...loadRecent(kind)].filter((value, index, list) => list.indexOf(value) === index);
  write(`ti:recent:${kind}`, merged.slice(0, recentLimit));
}

export function removeRecent(kind: RecentKind, value: string) {
  write(`ti:recent:${kind}`, loadRecent(kind).filter((item) => item !== value));
}
