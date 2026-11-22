export type WatermarkPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "bottom-center"
  | "top-center";

export type WatermarkFont = "sans" | "serif" | "hand" | "mono";

export type DateFormat = "full" | "date" | "dot" | "dash" | "english";

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
  frame?: "minimal" | "growth" | "gallery" | "noir" | "film" | "postcard" | "polaroid" | "camera";
  /** Overlay rendering: classic label, film-camera date stamp, large editorial date, or a centred film subtitle. */
  overlay?: "label" | "filmDate" | "bigDate" | "subtitle";
  /** Overlay backdrop when showBackground is on: rounded plate or soft edge gradient. */
  backdrop?: "box" | "gradient";
  fontFamily?: WatermarkFont;
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
  /** "web": needs camera EXIF, which WeChat strips. "mp": the mini program's stand-in for those. */
  platform?: "web" | "mp";
}

export interface PhotoMeta {
  capturedAt?: Date;
  latitude?: number;
  longitude?: number;
  cameraMake?: string;
  cameraModel?: string;
  /** e.g. "26mm  f/1.8  1/120s  ISO100" */
  exposure?: string;
}

/** The photo fields the renderer reads; shared by the web app and the mini program. */
export interface RenderPhoto {
  meta: PhotoMeta;
  editedDateText: string;
  editedLocationText: string;
  editedCoordinateText: string;
  eventNote: string;
  postcardMessage?: string;
  postcardSignature?: string;
}

export interface PhotoItem extends RenderPhoto {
  id: string;
  file: File;
  name: string;
  originalUrl: string;
  previewUrl: string;
  locationSource?: "manual" | "memory" | "approximate" | "online";
  renderedBlob?: Blob;
  renderedUrl?: string;
}

export interface RenderOptions {
  photo: RenderPhoto;
  style: WatermarkStyle;
  babyProfile: BabyProfile;
  outputFormat: OutputFormat;
  printSettings?: PrintSettings;
  maxEdge?: number;
}
