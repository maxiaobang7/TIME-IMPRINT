import type { RenderPhoto } from "../../../src/types";
import { readJpegInfo, type JpegInfo } from "../../../src/utils/exif-lite";
import { formatCaptureDate, formatCoordinate } from "../../../src/utils/date";
import { getOfflineRegion } from "../../../src/services/location";

export interface MpPhoto extends RenderPhoto {
  id: string;
  path: string;
  /** Stored pixel size before EXIF orientation (wx.getImageInfo reports it unrotated). */
  width: number;
  height: number;
  orientation: number;
}

export const MAX_PHOTOS = 20;

/** Opens the album or camera. Resolves to [] when the person cancels. */
export async function pickImages(count: number): Promise<string[]> {
  if (count <= 0) return [];
  try {
    const result = await wx.chooseMedia({
      count: Math.min(count, MAX_PHOTOS),
      mediaType: ["image"],
      sizeType: ["original"],
      sourceType: ["album", "camera"],
    });
    return result.tempFiles.map((file) => file.tempFilePath);
  } catch (error) {
    if (/cancel/i.test(errorMessage(error))) return [];
    throw error;
  }
}

const orientationNames: Record<string, number> = {
  up: 1, "up-mirrored": 2, down: 3, "down-mirrored": 4,
  "left-mirrored": 5, right: 6, "right-mirrored": 7, left: 8,
};

let counter = 0;

export async function loadPhoto(path: string): Promise<MpPhoto> {
  const info = await wx.getImageInfo({ src: path });
  const jpeg = readHeader(path);
  const meta = jpeg?.meta ?? {};
  const region =
    meta.latitude != null && meta.longitude != null
      ? getOfflineRegion(meta.latitude, meta.longitude)
      : undefined;
  const location = region
    ? [region.province, region.city].filter((value, index, list) => value && list.indexOf(value) === index).join(" ")
    : "";
  return {
    id: `p${Date.now().toString(36)}${(counter++).toString(36)}`,
    path,
    width: info.width,
    height: info.height,
    orientation: jpeg && jpeg.orientation > 1 ? jpeg.orientation : orientationNames[info.orientation] ?? 1,
    meta,
    editedDateText: formatCaptureDate(meta.capturedAt),
    editedLocationText: location,
    editedCoordinateText: formatCoordinate(meta.latitude, meta.longitude),
    eventNote: "",
  };
}

/**
 * EXIF lives in the first few hundred KB; reading the whole photo wastes memory.
 * Falls back to a full read where partial reads are unsupported.
 * Note: WeChat strips most EXIF before handing photos over. Measured on real
 * devices: iPhone keeps nothing; Android keeps the date and exposure settings
 * but removes camera make/model and GPS latitude/longitude.
 */
function readHeader(path: string): JpegInfo | undefined {
  const fs = wx.getFileSystemManager();
  try {
    const stat = fs.statSync(path) as WechatMiniprogram.Stats;
    const result = fs.readFileSync(path, undefined, 0, Math.min(stat.size || 262144, 262144));
    if (typeof result !== "string") return readJpegInfo(result);
  } catch {
    // Some platforms reject partial reads; try the whole file below.
  }
  try {
    const result = fs.readFileSync(path);
    return typeof result === "string" ? undefined : readJpegInfo(result);
  } catch {
    return undefined;
  }
}

export function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "errMsg" in error) return String((error as { errMsg: unknown }).errMsg);
  return error instanceof Error ? error.message : String(error ?? "");
}
