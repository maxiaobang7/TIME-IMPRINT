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
