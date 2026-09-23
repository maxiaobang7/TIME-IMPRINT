export type WatermarkPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "bottom-center";

export type TemplateCategory = "travel" | "baby";

export type OutputFormat = "jpeg" | "png";

export interface PrintSettings {
  size: "original" | "3" | "5" | "6";
  fit: "contain" | "cover";
  marginMm: number;
}

export type LocationPrivacyLevel = "precise" | "cityOnly" | "hidden";

export type LocationProvider = "offline" | "osm" | "amap";

export type LocationField = "province" | "city" | "district" | "street" | "landmark";

export interface BabyProfile {
  name: string;
  birthday: string;
}

export interface LocationSettings {
  provider: LocationProvider;
  privacyLevel: LocationPrivacyLevel;
  fields: LocationField[];
  amapKey: string;
}

export interface WatermarkStyle {
  frameWidth?: "narrow" | "standard" | "wide";
  frameFooterScale?: number;
  postcardStamp?: boolean;
  postcardUnderline?: boolean;
  layout?: "overlay" | "paper";
  frame?: "minimal" | "growth" | "gallery" | "noir" | "film" | "postcard";
  fontSizeRatio: number;
  opacity: number;
  textColor: string;
  backgroundOpacity: number;
  showBackground: boolean;
  position: WatermarkPosition;
  showTime: boolean;
  showLocation: boolean;
  showBabyAge: boolean;
  showCoordinate: boolean;
}

export interface WatermarkTemplate {
  description?: string;
  id: string;
  name: string;
  category: TemplateCategory;
  style: WatermarkStyle;
}

export interface PhotoMeta {
  capturedAt?: Date;
  latitude?: number;
  longitude?: number;
  cameraMake?: string;
  cameraModel?: string;
}

export interface PhotoItem {
  id: string;
  file: File;
  name: string;
  originalUrl: string;
  previewUrl: string;
  meta: PhotoMeta;
  editedDateText: string;
  editedLocationText: string;
  editedCoordinateText: string;
  eventNote: string;
  postcardMessage?: string;
  postcardSignature?: string;
  locationSource?: "manual" | "memory" | "approximate" | "online";
  renderedBlob?: Blob;
  renderedUrl?: string;
}

export interface RenderOptions {
  photo: PhotoItem;
  style: WatermarkStyle;
  babyProfile: BabyProfile;
  outputFormat: OutputFormat;
  printSettings?: PrintSettings;
  maxEdge?: number;
}
