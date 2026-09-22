import exifr from "exifr";
import type { PhotoItem, PhotoMeta } from "../types";
import { formatCaptureDate, formatCoordinate } from "../utils/date";
import { createLocalId } from "../utils/id";

export async function fileToPhoto(file: File): Promise<PhotoItem> {
  const normalized = await normalizeImageFile(file);
  const meta = await readMeta(file);
  const previewUrl = URL.createObjectURL(normalized);
  const originalUrl = URL.createObjectURL(file);

  return {
    id: createLocalId(),
    file: normalized,
    name: file.name,
    originalUrl,
    previewUrl,
    meta,
    editedDateText: formatCaptureDate(meta.capturedAt),
    editedLocationText: "",
    editedCoordinateText: formatCoordinate(meta.latitude, meta.longitude),
    eventNote: ""
  };
}

export function revokePhotoUrls(photo: PhotoItem) {
  URL.revokeObjectURL(photo.originalUrl);
  URL.revokeObjectURL(photo.previewUrl);
  if (photo.renderedUrl) URL.revokeObjectURL(photo.renderedUrl);
}

async function normalizeImageFile(file: File): Promise<File> {
  const lower = file.name.toLowerCase();
  const isHeic = lower.endsWith(".heic") || lower.endsWith(".heif") || file.type.includes("heic") || file.type.includes("heif");
  if (!isHeic) return file;

  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.94 });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  return new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
}

async function readMeta(file: File): Promise<PhotoMeta> {
  try {
    const [exifResult, gpsResult] = await Promise.allSettled([
      exifr.parse(file, {
        tiff: true,
        exif: true,
        gps: true,
        xmp: true,
        translateKeys: true,
        translateValues: true,
        reviveValues: true,
        mergeOutput: true,
        firstChunkSize: 128_000
      }),
      exifr.gps(file)
    ]);
    const exif = exifResult.status === "fulfilled" ? exifResult.value : undefined;
    const gps = gpsResult.status === "fulfilled" ? gpsResult.value : undefined;
    const latitude =
      readNumber(exif?.latitude) ??
      readNumber(gps?.latitude) ??
      dmsToDecimal(exif?.GPSLatitude, exif?.GPSLatitudeRef);
    const longitude =
      readNumber(exif?.longitude) ??
      readNumber(gps?.longitude) ??
      dmsToDecimal(exif?.GPSLongitude, exif?.GPSLongitudeRef);

    return {
      capturedAt: normalizeDate(exif?.DateTimeOriginal ?? exif?.CreateDate),
      latitude,
      longitude,
      cameraMake: exif?.Make,
      cameraModel: exif?.Model
    };
  } catch {
    return {};
  }
}

function normalizeDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const parsed = new Date(value.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3"));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function dmsToDecimal(value: unknown, ref: unknown): number | undefined {
  if (!Array.isArray(value) || value.length < 3) return undefined;
  const [degrees, minutes, seconds] = value.map(Number);
  if (![degrees, minutes, seconds].every(Number.isFinite)) return undefined;
  const sign = ref === "S" || ref === "W" ? -1 : 1;
  return sign * (Math.abs(degrees) + minutes / 60 + seconds / 3600);
}
