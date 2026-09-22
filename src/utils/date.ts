export function formatCaptureDate(date?: Date): string {
  const source = date ?? new Date();
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

export function babyAgeText(birthday: string, at: Date): string {
  if (!birthday) return "";
  const birth = new Date(`${birthday}T00:00:00`);
  if (Number.isNaN(birth.getTime()) || at < birth) return "";

  let years = at.getFullYear() - birth.getFullYear();
  let months = at.getMonth() - birth.getMonth();
  let days = at.getDate() - birth.getDate();

  if (days < 0) {
    months -= 1;
    const previousMonth = new Date(at.getFullYear(), at.getMonth(), 0);
    days += previousMonth.getDate();
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years > 0) return `${years}岁${months}个月`;
  if (months > 0) return `${months}个月${days}天`;

  const diff = Math.floor((at.getTime() - birth.getTime()) / 86_400_000) + 1;
  return `第 ${Math.max(diff, 1)} 天`;
}
