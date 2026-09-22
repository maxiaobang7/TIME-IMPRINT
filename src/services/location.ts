import type { LocationField, LocationSettings } from "../types";
import { chinaCities } from "../data/china-cities";

interface ReverseLocationInput {
  latitude: number;
  longitude: number;
  settings: LocationSettings;
  timeoutMs?: number;
}

interface AddressParts {
  province?: string;
  city?: string;
  district?: string;
  street?: string;
  landmark?: string;
}

export async function reverseGeocode(input: ReverseLocationInput): Promise<string | undefined> {
  if (input.settings.privacyLevel === "hidden") return undefined;
  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) return undefined;

  if (input.settings.provider === "offline") {
    return formatLocation(findOfflineCity(input.latitude, input.longitude), input.settings);
  }

  const timeoutMs = input.timeoutMs ?? 3_000;
  const signal = timeoutSignal(timeoutMs);
  const parts = input.settings.provider === "amap" && input.settings.amapKey.trim()
    ? await reverseWithAmap(input.latitude, input.longitude, input.settings.amapKey.trim(), signal, timeoutMs)
    : await reverseWithOsm(input.latitude, input.longitude, signal);

  return formatLocation(parts, input.settings);
}

export function getOfflineRegion(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined;
  const nearest = chinaCities
    .map((city) => ({ city, distance: distanceInKilometers(latitude, longitude, city.latitude, city.longitude) }))
    .sort((a, b) => a.distance - b.distance)[0];

  // Avoid presenting a distant city as exact when a photo is outside the
  // compact offline index's coverage area.
  if (!nearest || nearest.distance > 180) return undefined;
  return { province: nearest.city.province, city: nearest.city.city };
}

function findOfflineCity(latitude: number, longitude: number): AddressParts | undefined {
  const region = getOfflineRegion(latitude, longitude);
  return region ? { province: region.province, city: region.city } : undefined;
}

function distanceInKilometers(latitude1: number, longitude1: number, latitude2: number, longitude2: number) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLatitude = toRadians(latitude2 - latitude1);
  const dLongitude = toRadians(longitude2 - longitude1);
  const a =
    Math.sin(dLatitude / 2) ** 2 +
    Math.cos(toRadians(latitude1)) * Math.cos(toRadians(latitude2)) * Math.sin(dLongitude / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatLocation(parts: AddressParts | undefined, settings: LocationSettings) {
  if (!parts) return undefined;
  const fields: LocationField[] =
    settings.privacyLevel === "cityOnly"
      ? ["province", "city", "district"]
      : settings.fields.length
        ? settings.fields
        : ["province", "city", "district", "landmark"];

  const values = fields
    .map((field) => parts[field])
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, list) => list.indexOf(value) === index);

  return values.length ? values.join(" ") : undefined;
}

async function reverseWithOsm(latitude: number, longitude: number, signal: AbortSignal): Promise<AddressParts | undefined> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "zh-CN,zh;q=0.9,en;q=0.4");

  const response = await fetch(url.toString(), { headers: { Accept: "application/json" }, signal });
  if (!response.ok) return undefined;
  const data = await response.json();
  const address = data?.address ?? {};
  return {
    province: address.state ?? address.province ?? address.region,
    city: address.city ?? address.town ?? address.municipality ?? address.county ?? address.state,
    district: address.suburb ?? address.city_district ?? address.district ?? address.county,
    street: [address.road, address.house_number].filter(Boolean).join(" "),
    landmark: data?.name || address.attraction || address.building || address.amenity || address.neighbourhood
  };
}

async function reverseWithAmap(
  latitude: number,
  longitude: number,
  key: string,
  signal: AbortSignal,
  timeoutMs: number
): Promise<AddressParts | undefined> {
  const gcj = wgs84ToGcj02(latitude, longitude);
  const url = new URL("https://restapi.amap.com/v3/geocode/regeo");
  url.searchParams.set("key", key);
  url.searchParams.set("location", `${gcj.longitude},${gcj.latitude}`);
  url.searchParams.set("extensions", "all");
  url.searchParams.set("radius", "1000");
  url.searchParams.set("roadlevel", "0");
  url.searchParams.set("output", "json");

  const data = await jsonp<Record<string, unknown>>(url, timeoutMs).catch(async () => {
    const response = await fetch(url.toString(), { headers: { Accept: "application/json" }, signal });
    return response.ok ? response.json() : undefined;
  });
  if (data?.status !== "1") return undefined;
  const regeocode = data?.regeocode;
  const component = regeocode?.addressComponent ?? {};
  const pois = Array.isArray(regeocode?.pois) ? regeocode.pois : [];
  const aois = Array.isArray(regeocode?.aois) ? regeocode.aois : [];
  return {
    province: stringValue(component.province),
    city: stringValue(component.city) || stringValue(component.province),
    district: stringValue(component.district),
    street: stringValue(component.township) || stringValue(component.streetNumber?.street),
    landmark: stringValue(pois[0]?.name) || stringValue(aois[0]?.name) || stringValue(regeocode?.formatted_address)
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function jsonp<T>(url: URL, timeoutMs: number): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const callbackName = `timeImprintAmap_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const callbacks = window as unknown as Record<string, (data: T) => void>;
    const cleanup = () => {
      script.remove();
      delete callbacks[callbackName];
      window.clearTimeout(timer);
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("AMap reverse geocode timeout"));
    }, timeoutMs);

    callbacks[callbackName] = (data: T) => {
      cleanup();
      resolve(data);
    };

    url.searchParams.set("callback", callbackName);
    script.src = url.toString();
    script.onerror = () => {
      cleanup();
      reject(new Error("AMap reverse geocode failed"));
    };
    document.head.appendChild(script);
  });
}

function wgs84ToGcj02(latitude: number, longitude: number) {
  if (longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271) {
    return { latitude, longitude };
  }

  const a = 6378245.0;
  const ee = 0.00669342162296594323;
  let dLat = transformLat(longitude - 105.0, latitude - 35.0);
  let dLon = transformLon(longitude - 105.0, latitude - 35.0);
  const radLat = (latitude / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI);
  dLon = (dLon * 180.0) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return { latitude: latitude + dLat, longitude: longitude + dLon };
}

function transformLat(x: number, y: number) {
  let result = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  result += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  result += ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0;
  result += ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30.0)) * 2.0) / 3.0;
  return result;
}

function transformLon(x: number, y: number) {
  let result = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  result += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  result += ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0;
  result += ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) / 3.0;
  return result;
}
