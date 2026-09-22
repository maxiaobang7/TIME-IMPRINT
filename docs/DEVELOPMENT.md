# 开发与部署

## 开发环境

Node.js >= 22；使用 npm ci 按 package-lock.json 安装。源码目录 Tests 的大小写是实际路径，Linux 上不可写成 tests。

```bash
npm ci
npm test
npm run build
npm run dev -- --port 5182
```

默认开发端口来自 vite.config.ts（5173）；示例显式使用 5182。端口被占用可改为其他端口。

## 部署

构建输出 dist，可使用任意支持 HTTPS 的静态站点托管。不要上传 node_modules、本地归档、照片、密钥或设计源文件。

当前应用按域名根路径部署。GitHub 仓库只是源代码托管，不会自动创建站点。若使用 GitHub Pages 的项目子路径，需要先统一修改资源地址、Service Worker scope 和 manifest，再验证。

部署后检查首页、模板、导入、保存，以及 /manifest.webmanifest、/sw.js、/icons/icon-192.png、/fonts/MaShanZheng-Regular.ttf 均返回正确文件而不是 HTML fallback。生产 Service Worker 只缓存同源 GET 请求；后续版本应更新 public/sw.js 中的缓存版本。

HTTPS 不会让网页获得静默写入相册权限，但能启用浏览器支持的系统文件分享和 Service Worker。

## 演示与回归

```bash
npx playwright install chromium
npm run build
npm run test:production
npm run demo
```

脚本创建隔离浏览器上下文，不读取个人浏览记录或用户照片；使用项目中既有合成示例图，生成桌面/手机页面截图、六款模板原图和汇总图。自启动的服务和浏览器会在结束时关闭。

浏览器截图用于版式和流程检查，不能替代 iOS 真机的相册保存、HEIC 转码和低内存测试。Tests/fixtures 中是人工几何图形和模拟 EXIF，用于非个人测试。

## 发布清理范围

旧 iOS 工程、旧说明和无引用的 sample-board 素材已移入维护者本地 .local-archive；design 中设计稿与图标原稿保留在本地。两者均不提交 Git。日志、压缩包、node_modules、dist、TypeScript 中间产物也不提交。

保留 print-layout.ts 等尺寸计算代码，因为当前 PDF 和相纸尺寸功能仍使用它们；文件名含 print 不代表可以删除。

## 已知限制

HEIC 转换依赖较大，构建可能显示 chunk 大小警告；它通过动态导入加载，不属于构建失败。在线地理服务的公开上线许可、配额和调用策略需要部署者另行核实，不建议默认切换为公网自动查询。
