import type { PhotoItem } from "../types";

const samples = new Map<string, Promise<PhotoItem>>();
const ids = ["travel-memory", "classic-date", "paper-memory", "growth-steps", "white-gallery", "travel-postcard"];
export const sampleBaby = { name: "小满", birthday: "2024-08-01" };

export function loadSamplePhoto(id = "travel-memory") {
  if (samples.has(id)) return samples.get(id)!;
  const sample = new Promise<PhotoItem>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const index = Math.max(0, ids.indexOf(id));
      const width = image.naturalWidth / 3;
      const height = image.naturalHeight / 2;
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("无法生成示例"));
        return;
      }
      ctx.drawImage(image, (index % 3) * width, Math.floor(index / 3) * height, width, height, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/jpeg", 0.92);
      resolve({
        id: `studio-example-${id}`,
        file: new File([], "example.jpg"),
        name: "小满的夏天",
        originalUrl: url,
        previewUrl: url,
        meta: { capturedAt: new Date(2026, 8, 22, 16, 30) },
        editedDateText: "2026.09.22",
        editedLocationText: "杭州 · 西湖",
        editedCoordinateText: "",
        eventNote: "",
      });
    };
    image.onerror = () => {
      samples.delete(id);
      reject(new Error("示例加载失败"));
    };
    image.src = "/studio/sample-scenes.png";
  });
  samples.set(id, sample);
  return sample;
}
