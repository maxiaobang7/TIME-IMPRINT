import type { BabyProfile, LocationSettings, WatermarkStyle } from "../types";

const babyKey = "time-imprint:baby-profile";
const styleKey = "time-imprint:watermark-style";
const locationSettingsKey = "time-imprint:location-settings";
const locationAliasesKey = "time-imprint:location-aliases";

interface LocationAlias {
  latitude: number;
  longitude: number;
  name: string;
  regionKey?: string;
  updatedAt: string;
}

export function loadBabyProfile(): BabyProfile {
  const fallback = { name: "", birthday: "" };
  try {
    const raw = localStorage.getItem(babyKey);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function saveBabyProfile(profile: BabyProfile) {
  save(babyKey, profile);
}

export function loadStyle(defaultStyle: WatermarkStyle): WatermarkStyle {
  try {
    const raw = localStorage.getItem(styleKey);
    if (!raw) return defaultStyle;
    const saved = JSON.parse(raw);
    return { ...defaultStyle, ...saved, layout: saved.layout ?? "overlay" };
  } catch {
    return defaultStyle;
  }
}

export function saveStyle(style: WatermarkStyle) {
  save(styleKey, style);
}

export function loadLocationSettings(): LocationSettings {
  const fallback: LocationSettings = {
    provider: "offline",
    privacyLevel: "cityOnly",
    fields: ["city", "district", "landmark"],
    amapKey: ""
  };
  try {
    const raw = localStorage.getItem(locationSettingsKey);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function saveLocationSettings(settings: LocationSettings) {
  save(locationSettingsKey, settings);
}

export function saveLocationAlias(latitude: number, longitude: number, name: string, regionKey?: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const aliases = loadLocationAliases().filter((alias) => distanceInMeters(latitude, longitude, alias.latitude, alias.longitude) >= 200);
  aliases.unshift({ latitude, longitude, name: trimmed, regionKey, updatedAt: new Date().toISOString() });
  save(locationAliasesKey, aliases.slice(0, 100));
}

export function loadLocationAlias(latitude: number, longitude: number, _regionKey?: string): string | undefined {
  const aliases = loadLocationAliases();
  const exact = aliases
    .map((alias) => ({ alias, distance: distanceInMeters(latitude, longitude, alias.latitude, alias.longitude) }))
    .filter((item) => item.distance < 200)
    .sort((a, b) => a.distance - b.distance)[0]?.alias.name;
  return exact;
}

export function clearLocationAliases() {
  try { localStorage.removeItem(locationAliasesKey); } catch { /* Storage can be disabled in private browsing. */ }
}

function loadLocationAliases(): LocationAlias[] {
  try {
    const raw = localStorage.getItem(locationAliasesKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => item && Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && typeof item.name === "string") : [];
  } catch {
    return [];
  }
}

function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Editing remains available without persistent storage. */ }
}

function distanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radius = 6_371_000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
