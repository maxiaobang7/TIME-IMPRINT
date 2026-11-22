import type { PhotoItem } from "../types";

const samples = new Map<string, Promise<PhotoItem>>();

/** Cell order in scripts/assets/sample-scenes.webp: five across, two down. */
const scenes = [
  "grandma-dumplings",
  "bubble-wonder",
  "birthday-wish",
  "street-cool",
  "raincoat-play",
  "lakeside-family",
  "couple-blue-hour",
  "couple-coffee",
  "couple-coast",
  "couple-night-fair",
] as const;
type Scene = (typeof scenes)[number];

/** Each template gets the scene and caption that show it off best. */
const examples: Record<string, { scene: Scene; location: string; event?: string; signature?: string }> = {
  "travel-memory": { scene: "lakeside-family", location: "杭州 · 西湖" },
  "classic-date": { scene: "couple-blue-hour", location: "上海 · 南京西路", event: "雨夜，一把伞，两个人" },
  "paper-memory": { scene: "couple-coffee", location: "上海 · 武康路" },
  "growth-steps": { scene: "grandma-dumplings", location: "奶奶家", event: "第一次和奶奶包饺子" },
  "white-gallery": { scene: "street-cool", location: "成都 · 玉林路", event: "街角的小酷哥" },
  "travel-postcard": { scene: "couple-coast", location: "厦门 · 环岛路", signature: "我们的旅行日记" },
  "film-date": { scene: "couple-night-fair", location: "台北 · 夜市" },
  polaroid: { scene: "raincoat-play", location: "杭州 · 植物园", event: "踩水坑最快乐啦" },
  "camera-bar": { scene: "bubble-wonder", location: "杭州 · 太子湾公园" },
  "info-bar": { scene: "bubble-wonder", location: "杭州 · 太子湾", event: "追泡泡的午后" },
  "big-date": { scene: "birthday-wish", location: "杭州 · 家中", event: "两岁生日，许个愿吧" },
};

export const sampleBaby = { name: "小满", birthday: "2024-08-01" };

export function loadSamplePhoto(id = "travel-memory") {
  if (samples.has(id)) return samples.get(id)!;
  const example = examples[id] ?? examples["travel-memory"];
  const sample = new Promise<PhotoItem>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const index = scenes.indexOf(example.scene);
      const width = image.naturalWidth / 5;
      const height = image.naturalHeight / 2;
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("无法生成示例"));
        return;
      }
      ctx.drawImage(image, (index % 5) * width, Math.floor(index / 5) * height, width, height, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/jpeg", 0.92);
      resolve({
        id: `studio-example-${id}`,
        file: new File([], "example.jpg"),
        name: "小满的夏天",
        originalUrl: url,
        previewUrl: url,
        meta: id === "camera-bar"
          ? { capturedAt: new Date(2026, 8, 22, 16, 30), cameraMake: "Apple", cameraModel: "iPhone 16 Pro", exposure: "24mm  f/1.8  1/640s  ISO80" }
          : { capturedAt: new Date(2026, 8, 22, 16, 30) },
        editedDateText: "2026.09.22",
        editedLocationText: example.location,
        editedCoordinateText: "",
        eventNote: example.event ?? "",
        ...(example.signature ? { postcardSignature: example.signature } : {}),
      });
    };
    image.onerror = () => {
      samples.delete(id);
      reject(new Error("示例加载失败"));
    };
    // Only the preview scripts load this, through the Vite dev server; it is not shipped with the site.
    image.src = "/scripts/assets/sample-scenes.webp";
  });
  samples.set(id, sample);
  return sample;
}
