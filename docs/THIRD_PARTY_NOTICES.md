# 第三方组件与素材说明

## 运行依赖

应用使用 React、Vite、TypeScript、Lucide、exifr、heic2any、jsPDF、JSZip 等项目；完整版本与依赖树见 package-lock.json。第三方代码按其各自许可证使用，发布者应保留依赖要求的声明。

## 字体

旅行明信片使用 Ma Shan Zheng，来源 Google Fonts 的 google/fonts 仓库，按 SIL Open Font License 使用。许可证原文随 public/fonts/OFL-MaShanZheng.txt 一同提供。原始 TTF 保存在 scripts/assets；网站使用保留完整字库的 WOFF2 压缩版本，不裁剪用户可输入的字符。

## 图像与图标

scripts/assets/sample-scenes.png 是项目已有的合成示例场景；网站使用 public/studio 下的 WebP 压缩图和预生成模板预览。README 演示图片由这些场景生成，不使用维护者私人相册。public/icons 中是项目现用小女孩图标。仓库尚未对项目代码、品牌和这些素材另行指定再分发许可证。

## 地点数据和服务

src/data/china-cities.ts 是当前项目内的精简城市中心表，不是完整或权威行政区边界数据库。其精度与覆盖范围有限；本次整理未新增外部地图数据集，也未验证历史数据来源。

可选联网解析调用 OpenStreetMap Nominatim 或高德服务，不包含在本项目的本地离线能力中。运营者需自行核实这些服务的使用政策、署名要求和授权范围。
