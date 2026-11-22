import type { WatermarkStyle, WatermarkTemplate } from "../types";

const base: WatermarkStyle = {
  layout: "overlay",
  fontSizeRatio: 0.03,
  opacity: 1,
  textColor: "#ffffff",
  backgroundOpacity: 0.32,
  showBackground: true,
  position: "bottom-right",
  showTime: true,
  showLocation: true,
  showBabyAge: false,
  showCoordinate: false,
};
const paper: WatermarkStyle = {
  ...base,
  layout: "paper",
  frame: "minimal",
  textColor: "#252827",
  fontSizeRatio: 0.032,
  showBackground: false,
  position: "bottom-center",
};
export const allTemplates: WatermarkTemplate[] = [
  {
    id: "travel-memory",
    name: "轻盈角标",
    category: "travel",
    description: "磨砂圆角 · 右下角标",
    style: { ...base, backgroundOpacity: 0.28 },
  },
  {
    id: "classic-date",
    name: "电影字幕",
    category: "travel",
    description: "居中字幕 · 一句话配日期",
    style: {
      ...base,
      overlay: "subtitle",
      backdrop: "gradient",
      backgroundOpacity: 0.4,
      position: "bottom-center",
      fontSizeRatio: 0.048,
    },
  },
  {
    id: "paper-memory",
    name: "时光留白",
    category: "travel",
    description: "窄白边 · 宋体日期题签",
    style: { ...paper, fontFamily: "serif", fontSizeRatio: 0.034 },
  },
  {
    id: "growth-steps",
    name: "成长日记",
    category: "baby",
    description: "柔粉细节 · 姓名与月龄",
    style: {
      ...paper,
      frame: "growth",
      showBabyAge: true,
      textColor: "#65494e",
    },
  },
  {
    id: "white-gallery",
    name: "纯白画廊",
    category: "travel",
    description: "宽白卡纸 · 右下角展签",
    style: { ...paper, frame: "gallery", position: "bottom-right", fontSizeRatio: 0.034 },
  },
  {
    id: "travel-postcard",
    name: "旅行明信片",
    category: "travel",
    description: "手写寄语 · 海蓝邮戳",
    style: {
      ...paper,
      frame: "postcard",
      textColor: "#42658a",
      fontSizeRatio: 0.055,
      postcardStamp: true,
      postcardUnderline: true,
      position: "bottom-left",
    },
  },
  {
    id: "film-date",
    name: "胶片日期",
    category: "travel",
    description: "橙色光点 · 老相机的日期印",
    style: {
      ...base,
      overlay: "filmDate",
      fontFamily: "mono",
      textColor: "#ff9a3d",
      fontSizeRatio: 0.042,
      showBackground: false,
      showLocation: false,
    },
  },
  {
    id: "polaroid",
    name: "拍立得",
    category: "baby",
    description: "厚底白边 · 手写一句话",
    style: {
      ...paper,
      frame: "polaroid",
      fontFamily: "hand",
      textColor: "#3b3a36",
      fontSizeRatio: 0.06,
    },
  },
  {
    id: "camera-bar",
    name: "相机参数",
    category: "travel",
    description: "机型参数 · 日期地点信息条",
    platform: "web",
    style: {
      ...paper,
      frame: "camera",
      textColor: "#1f2120",
      fontSizeRatio: 0.036,
    },
  },
  {
    id: "big-date",
    name: "杂志大字",
    category: "baby",
    description: "大号日期 · 渐变压暗",
    style: {
      ...base,
      overlay: "bigDate",
      backdrop: "gradient",
      fontFamily: "serif",
      backgroundOpacity: 0.3,
      position: "bottom-left",
      fontSizeRatio: 0.055,
    },
  },
];

/** Same info-bar layout as 相机参数, led by the event and baby age instead of camera EXIF. */
allTemplates.splice(allTemplates.findIndex((item) => item.id === "camera-bar") + 1, 0, {
  id: "info-bar",
  name: "生活信息条",
  category: "baby",
  description: "白色信息条 · 事件与月龄",
  platform: "mp",
  style: {
    ...paper,
    frame: "camera",
    textColor: "#1f2120",
    fontSizeRatio: 0.036,
    showBabyAge: true,
  },
});

/** Templates on the website. */
export const defaultTemplates = allTemplates.filter((item) => item.platform !== "mp");
