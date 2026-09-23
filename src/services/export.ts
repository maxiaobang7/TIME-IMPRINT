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

type PhotoStream = Iterable<PhotoItem> | AsyncIterable<PhotoItem>;

export async function makeZip(photos: PhotoStream, signal?: AbortSignal) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  let index = 0;
  for await (const photo of photos) {
    signal?.throwIfAborted();
    if (photo.renderedBlob) {
      const extension = photo.renderedBlob.type === "image/png" ? "png" : "jpg";
      zip.file(`${String(index + 1).padStart(2, "0")}-${safeName(photo.name)}.${extension}`, photo.renderedBlob);
    }
    index++;
  }
  signal?.throwIfAborted();
  return zip.generateAsync({ type: "blob", streamFiles: true }, () => signal?.throwIfAborted());
}

export async function makePdf(photos: PhotoStream, settings: PrintSettings = defaultPrintSettings, signal?: AbortSignal) {
  const { jsPDF } = await import("jspdf");
  let pdf: InstanceType<typeof jsPDF> | undefined;
  const imageReader = new jsPDF();

  for await (const photo of photos) {
    signal?.throwIfAborted();
    if (!photo.renderedBlob) continue;
    const data = new Uint8Array(await photo.renderedBlob.arrayBuffer());
    // jsPDF reads image dimensions without an extra decoded image or base64 copy.
    const dimensions = imageReader.getImageProperties(data);
    const { paperWidth: width, paperHeight: height } = printLayout(dimensions.width, dimensions.height, settings);
    const orientation = width >= height ? "landscape" : "portrait";
    if (!pdf) pdf = new jsPDF({ orientation, unit: "mm", format: [width, height] });
    else pdf.addPage([width, height], orientation);
    pdf.addImage(data, photo.renderedBlob.type === "image/png" ? "PNG" : "JPEG", 0, 0, width, height);
  }

  if (!pdf) throw new Error("没有可导出的照片");
  signal?.throwIfAborted();
  return pdf.output("blob");
}


function safeName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "-");
}
