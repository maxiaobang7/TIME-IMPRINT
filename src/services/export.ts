import type { PhotoItem, PrintSettings } from "../types";
import { defaultPrintSettings, printLayout } from "./print-layout";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function shareBlob(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };

  if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
    await nav.share({ files: [file] });
    return true;
  }

  return false;
}

export function isAppleMobile(nav: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints"> = navigator) {
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
}

export function canShareImage(blob: Blob, filename: string) {
  if (!window.isSecureContext || !navigator.share || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File([blob], filename, { type: blob.type })] });
  } catch {
    return false;
  }
}

export async function makeZip(photos: PhotoItem[]) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  photos.forEach((photo, index) => {
    if (photo.renderedBlob) {
      const extension = photo.renderedBlob.type === "image/png" ? "png" : "jpg";
      zip.file(`${String(index + 1).padStart(2, "0")}-${safeName(photo.name)}.${extension}`, photo.renderedBlob);
    }
  });
  return zip.generateAsync({ type: "blob" });
}

export async function makePdf(photos: PhotoItem[], settings: PrintSettings = defaultPrintSettings) {
  const { jsPDF } = await import("jspdf");
  let pdf: InstanceType<typeof jsPDF> | undefined;

  for (let i = 0; i < photos.length; i += 1) {
    const photo = photos[i];
    if (!photo.renderedBlob) continue;
    const dataUrl = await blobToDataUrl(photo.renderedBlob);
    const image = await imageFromDataUrl(dataUrl);
    const { paperWidth: width, paperHeight: height } = printLayout(image.naturalWidth, image.naturalHeight, settings);
    const orientation = width >= height ? "landscape" : "portrait";
    if (!pdf) pdf = new jsPDF({ orientation, unit: "mm", format: [width, height] });
    else pdf.addPage([width, height], orientation);
    pdf.addImage(dataUrl, photo.renderedBlob.type === "image/png" ? "PNG" : "JPEG", 0, 0, width, height);
  }

  if (!pdf) throw new Error("没有可导出的照片");
  return pdf.output("blob");
}


function safeName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "-");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function imageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("PDF 图片加载失败。"));
    image.src = dataUrl;
  });
}
