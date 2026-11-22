import type { PhotoMeta } from "../types";
import { exposureText } from "./exposure";

export interface JpegInfo {
  meta: PhotoMeta;
  /** EXIF orientation 1–8; 1 when absent. */
  orientation: number;
  /** Pixel size as stored in the file, before orientation is applied. */
  storedWidth?: number;
  storedHeight?: number;
}

/**
 * Minimal JPEG EXIF reader with no DOM or TextDecoder use, so it runs inside
 * WeChat mini programs. Pass the first ~256 KB of the file; EXIF sits there.
 */
export function readJpegInfo(buffer: ArrayBuffer): JpegInfo {
  const info: JpegInfo = { meta: {}, orientation: 1 };
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return info;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0xd9 || marker === 0xda) break;
    const length = view.getUint16(offset + 2);
    if (length < 2) break;
    const start = offset + 4;
    if (marker === 0xe1 && start + 6 <= view.byteLength && ascii(view, start, 4) === "Exif") {
      try {
        readTiff(view, start + 6, Math.min(view.byteLength, offset + 2 + length), info);
      } catch {
        // A truncated or malformed EXIF block keeps whatever was read so far.
      }
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (start + 5 <= view.byteLength) {
        info.storedHeight = view.getUint16(start + 1);
        info.storedWidth = view.getUint16(start + 3);
      }
      break;
    }
    offset += 2 + length;
  }
  return info;
}

type Entry = { type: number; count: number; valueOffset: number };

function readTiff(view: DataView, tiff: number, end: number, info: JpegInfo) {
  const order = view.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return;
  const little = order === 0x4949;
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  const size = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

  const readIfd = (at: number) => {
    const entries = new Map<number, Entry>();
    if (at + 2 > end) return entries;
    const count = u16(at);
    for (let i = 0; i < count; i++) {
      const entry = at + 2 + i * 12;
      if (entry + 12 > end) break;
      const type = u16(entry + 2);
      const n = u32(entry + 4);
      const bytes = (size[type] ?? 1) * n;
      entries.set(u16(entry), { type, count: n, valueOffset: bytes <= 4 ? entry + 8 : tiff + u32(entry + 8) });
    }
    return entries;
  };
  const text = (entry?: Entry) => {
    if (!entry || entry.type !== 2 || entry.valueOffset + entry.count > end) return undefined;
    return utf8(view, entry.valueOffset, entry.count).replace(/\0+$/, "").trim() || undefined;
  };
  const number = (entry?: Entry, index = 0): number | undefined => {
    if (!entry) return undefined;
    const at = entry.valueOffset + index * (size[entry.type] ?? 1);
    if (at + (size[entry.type] ?? 1) > end) return undefined;
    switch (entry.type) {
      case 3: return u16(at);
      case 4: return u32(at);
      case 9: return view.getInt32(at, little);
      case 5: { const d = u32(at + 4); return d ? u32(at) / d : undefined; }
      case 10: { const d = view.getInt32(at + 4, little); return d ? view.getInt32(at, little) / d : undefined; }
      default: return undefined;
    }
  };

  const ifd0 = readIfd(tiff + u32(tiff + 4));
  const orientation = number(ifd0.get(0x0112));
  if (orientation && orientation >= 1 && orientation <= 8) info.orientation = orientation;
  info.meta.cameraMake = text(ifd0.get(0x010f));
  info.meta.cameraModel = text(ifd0.get(0x0110));

  const exifPointer = number(ifd0.get(0x8769));
  const exif = exifPointer ? readIfd(tiff + exifPointer) : new Map<number, Entry>();
  info.meta.capturedAt =
    exifDate(text(exif.get(0x9003))) ?? exifDate(text(exif.get(0x9004))) ?? exifDate(text(ifd0.get(0x0132)));
  info.meta.exposure = exposureText({
    FocalLengthIn35mmFormat: number(exif.get(0xa405)) || undefined,
    FocalLength: number(exif.get(0x920a)),
    FNumber: number(exif.get(0x829d)),
    ExposureTime: number(exif.get(0x829a)),
    ISO: number(exif.get(0x8827)),
  });

  const gpsPointer = number(ifd0.get(0x8825));
  if (gpsPointer) {
    const gps = readIfd(tiff + gpsPointer);
    const coordinate = (valueTag: number, refTag: number, negative: string) => {
      const entry = gps.get(valueTag);
      const [d, m, s] = [0, 1, 2].map((i) => number(entry, i));
      if (d === undefined || m === undefined || s === undefined) return undefined;
      const value = d + m / 60 + s / 3600;
      return text(gps.get(refTag)) === negative ? -value : value;
    };
    const latitude = coordinate(2, 1, "S");
    const longitude = coordinate(4, 3, "W");
    // 0,0 is what some phones write when the fix failed.
    if (latitude !== undefined && longitude !== undefined && (latitude || longitude)) {
      info.meta.latitude = latitude;
      info.meta.longitude = longitude;
    }
  }
}

/** "2026:09:22 16:30:05" → local Date. */
function exifDate(value?: string) {
  const match = value?.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return undefined;
  const [y, mo, d, h, mi, s = 0] = match.slice(1).map((part) => Number(part ?? 0));
  if (!y || !mo || !d) return undefined;
  const date = new Date(y, mo - 1, d, h, mi, s);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function ascii(view: DataView, at: number, length: number) {
  let out = "";
  for (let i = 0; i < length; i++) out += String.fromCharCode(view.getUint8(at + i));
  return out;
}

function utf8(view: DataView, at: number, length: number) {
  const bytes: number[] = [];
  for (let i = 0; i < length; i++) bytes.push(view.getUint8(at + i));
  try {
    return decodeURIComponent(bytes.map((b) => "%" + b.toString(16).padStart(2, "0")).join(""));
  } catch {
    return String.fromCharCode(...bytes);
  }
}
