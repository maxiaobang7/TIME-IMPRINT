import type { RenderPhoto } from "../types";

export function formatCaptureDate(date?: Date): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  const source = date;
  const year = source.getFullYear();
  const month = source.getMonth() + 1;
  const day = source.getDate();
  const hour = String(source.getHours()).padStart(2, "0");
  const minute = String(source.getMinutes()).padStart(2, "0");
  return `${year}年${month}月${day}日 ${hour}:${minute}`;
}

export function formatCoordinate(latitude?: number, longitude?: number): string {
  if (latitude == null || longitude == null) return "";
  return `${latitude.toFixed(5)}°, ${longitude.toFixed(5)}°`;
}

// Parse local calendar dates explicitly; Safari and other browsers disagree on
// non-ISO strings, and Date alone silently rolls impossible dates forward.
export function parseCaptureDate(text: string): Date | undefined {
  const match = text.trim().match(/^(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})日?(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return undefined;
  const [, y, m, d, h = "0", min = "0", s = "0"] = match;
  const [year, month, day, hour, minute, second] = [y, m, d, h, min, s].map(Number);
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ||
      date.getHours() !== hour || date.getMinutes() !== minute || date.getSeconds() !== second) return undefined;
  return date;
}

export function babyAgeText(birthday: string, at: Date): string {
  if (!birthday) return "";
  const birth = new Date(`${birthday}T00:00:00`);
  if (Number.isNaN(birth.getTime()) || at < birth) return "";

  if (Number.isNaN(at.getTime())) return "";
  let totalMonths = (at.getFullYear() - birth.getFullYear()) * 12 + at.getMonth() - birth.getMonth();
  const anniversary = (months: number) => {
    const month = birth.getMonth() + months;
    const lastDay = new Date(birth.getFullYear(), month + 1, 0).getDate();
    return new Date(birth.getFullYear(), month, Math.min(birth.getDate(), lastDay));
  };
  if (at < anniversary(totalMonths)) totalMonths -= 1;
  const anchor = anniversary(totalMonths);
  const calendarDay = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((calendarDay(at) - calendarDay(anchor)) / 86_400_000);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  if (years > 0) return `${years}岁${months}个月`;
  if (months > 0) return `${months}个月${days}天`;

  const diff = Math.round((calendarDay(at) - calendarDay(birth)) / 86_400_000) + 1;
  return `第 ${Math.max(diff, 1)} 天`;
}

const englishMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const dateFormats = [
  { id: "full", label: "2026年9月22日 16:30" },
  { id: "date", label: "2026年9月22日" },
  { id: "dot", label: "2026.09.22" },
  { id: "dash", label: "2026-09-22 16:30" },
  { id: "english", label: "Sep 22, 2026" },
] as const;

export function formatDateAs(date: Date | undefined, format: string): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const pad = (value: number) => String(value).padStart(2, "0");
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  switch (format) {
    case "date": return `${y}年${m}月${d}日`;
    case "dot": return `${y}.${pad(m)}.${pad(d)}`;
    case "dash": return `${y}-${pad(m)}-${pad(d)} ${time}`;
    case "english": return `${englishMonths[m - 1]} ${d}, ${y}`;
    default: return formatCaptureDate(date);
  }
}

/** Reads any date the user typed or picked, including English month names. */
export function parseAnyDate(text: string): Date | undefined {
  const parsed = parseCaptureDate(text);
  if (parsed) return parsed;
  const english = text.trim().match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})$/);
  if (!english) return undefined;
  const month = englishMonths.findIndex((name) => name.toLowerCase() === english[1].toLowerCase());
  if (month < 0) return undefined;
  const date = new Date(Number(english[3]), month, Number(english[2]));
  return date.getMonth() === month ? date : undefined;
}

/** "'26 9 22" style used by film cameras' date backs. */
export function filmDateText(date: Date): string {
  return `'${String(date.getFullYear()).slice(-2)} ${date.getMonth() + 1} ${String(date.getDate()).padStart(2, "0")}`;
}

/** The date a photo should show: typed text first, keeping EXIF time when only the day was typed. */
export function photoDateOf(photo: Pick<RenderPhoto, "editedDateText" | "meta">) {
  const typed = photo.editedDateText.trim();
  if (!typed) return photo.meta.capturedAt;
  const parsed = parseAnyDate(typed);
  const exif = photo.meta.capturedAt;
  // Date-only formats drop the time; restore it from EXIF when the day still matches.
  if (parsed && exif && parsed.getHours() === 0 && parsed.getMinutes() === 0 && parsed.toDateString() === exif.toDateString())
    return exif;
  return parsed;
}
