/**
 * Short place label from a map pick, e.g. "杭州 西湖风景区".
 * Map pickers return a place name plus a full address such as
 * "浙江省杭州市西湖区龙井路1号". The city keeps the label meaningful
 * without street-level detail.
 */
export function placeLabel(name: string | undefined, address: string | undefined): string {
  const poi = (name ?? "").trim();
  const full = (address ?? "").trim();
  const afterProvince = full.replace(/^.*?(省|自治区|特别行政区)/, "");
  const city = afterProvince.match(/^.+?(市|自治州|地区|盟)/)?.[0] ?? "";
  // "大理白族自治州" reads as "大理"; "杭州市" as "杭州".
  const shortCity = city.endsWith("自治州") ? city.slice(0, 2) : city.replace(/(市|地区|盟)$/, "");
  if (!poi) return shortCity || full;
  // Picking a bare spot returns a street address as the name; keep city and district only.
  if (poi === full || /\d+号$/.test(poi)) {
    const district = afterProvince.slice(city.length).match(/^.+?(区|县|市|旗)/)?.[0] ?? "";
    return [shortCity, district].filter(Boolean).join(" ") || poi;
  }
  if (!shortCity || poi.startsWith(shortCity)) return poi;
  return `${shortCity} ${poi}`;
}
