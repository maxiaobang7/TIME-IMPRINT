/** "24mm  f/1.8  1/640s  ISO80" from EXIF-style keys. */
export function exposureText(exif: Record<string, unknown> | undefined): string | undefined {
  if (!exif) return undefined;
  const parts: string[] = [];
  const focal = readNumber(exif.FocalLengthIn35mmFormat) ?? readNumber(exif.FocalLength);
  if (focal) parts.push(`${Math.round(focal)}mm`);
  const aperture = readNumber(exif.FNumber);
  if (aperture) parts.push(`f/${Number(aperture.toFixed(1))}`);
  const shutter = readNumber(exif.ExposureTime);
  if (shutter) parts.push(shutter >= 1 ? `${Number(shutter.toFixed(1))}s` : `1/${Math.round(1 / shutter)}s`);
  const iso = readNumber(exif.ISO) ?? (Array.isArray(exif.ISO) ? readNumber(exif.ISO[0]) : undefined);
  if (iso) parts.push(`ISO${iso}`);
  return parts.length ? parts.join("  ") : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
