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
export const defaultTemplates: WatermarkTemplate[] = [
  {
    id: "travel-memory",
    name: "轻盈角标",
    category: "travel",
    description: "轻薄底板 · 右下角标",
    style: { ...base },
  },
  {
    id: "classic-date",
    name: "经典日期",
    category: "travel",
    description: "纯净日期 · 无底板",
    style: {
      ...base,
      showLocation: false,
      showBackground: false,
      fontSizeRatio: 0.025,
    },
  },
  {
    id: "paper-memory",
    name: "时光留白",
    category: "travel",
    description: "窄白边 · 双层题签",
    style: { ...paper },
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
    description: "上下留白 · 居中展签",
    style: { ...paper, frame: "gallery" },
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
];
