import { loadTemplateId, saveTemplateId, templates as mpTemplates } from "../../lib/store";
import { MAX_PHOTOS, errorMessage, pickImages } from "../../lib/photos";
import { EXAMPLE_IMAGE_BASE, WEB_URL } from "../../lib/config";

const filters = [
  { id: "all", label: "全部" },
  { id: "baby", label: "宝宝成长" },
  { id: "travel", label: "日常出游" },
];

const features = [
  { title: "日期一键填", text: "选一次日期，可以同时填好多张照片；五种日期格式随意切换。" },
  { title: "宝宝月龄", text: "填一次生日，每张照片自动算出「1岁3个月」。" },
  { title: "批量处理", text: "一次最多 20 张，样式通用，地点和事件可一键同步。" },
  { title: "照片不上传", text: "全部在手机上完成，不经过任何服务器。" },
];

const templates = mpTemplates.map(({ id, name, description, category }) => ({ id, name, description, category }));

// Large examples come from the website; the small preview in the package is the fallback.
let remoteFailed = false;

function selectedOf(id: string) {
  const item = templates.find((entry) => entry.id === id) ?? templates[0];
  const thumb = `/images/templates/${item.id}-thumb.jpg`;
  return { ...item, thumb, src: remoteFailed || !EXAMPLE_IMAGE_BASE ? thumb : `${EXAMPLE_IMAGE_BASE}${item.id}.jpg` };
}

Page({
  data: {
    filters,
    features,
    filter: "all",
    templates,
    visible: templates,
    templateId: templates[0].id,
    selected: selectedOf(templates[0].id),
    count: templates.length,
    webUrl: WEB_URL,
    // Sharper grid previews from the website; packaged ones if that fails.
    thumbBase: remoteFailed || !EXAMPLE_IMAGE_BASE ? "" : EXAMPLE_IMAGE_BASE,
  },

  onLoad() {
    const id = loadTemplateId();
    this.setData({ templateId: id, selected: selectedOf(id) });
  },

  onShow() {
    // The editor can change the template; reflect it when coming back.
    const id = loadTemplateId();
    if (id !== this.data.templateId) this.setData({ templateId: id, selected: selectedOf(id) });
  },

  onFilter(event: WechatMiniprogram.CustomEvent) {
    const filter = event.currentTarget.dataset.id as string;
    this.setData({ filter, visible: templates.filter((item) => filter === "all" || item.category === filter) });
  },

  onChoose(event: WechatMiniprogram.CustomEvent) {
    const id = event.currentTarget.dataset.id as string;
    saveTemplateId(id);
    this.setData({ templateId: id, selected: selectedOf(id) });
    wx.pageScrollTo({ scrollTop: 0, duration: 250 });
  },

  async onPick() {
    try {
      const paths = await pickImages(MAX_PHOTOS);
      if (!paths.length) return;
      await wx.navigateTo({ url: `/pages/editor/index?paths=${encodeURIComponent(JSON.stringify(paths))}` });
    } catch (error) {
      wx.showToast({ title: `无法打开相册：${errorMessage(error)}`, icon: "none" });
    }
  },

  /** No network or website not deployed yet: show the packaged preview instead. */
  onExampleError() {
    if (remoteFailed) return;
    remoteFailed = true;
    this.setData({ selected: selectedOf(this.data.templateId), thumbBase: "" });
  },

  onCollage() {
    wx.navigateTo({ url: "/pages/collage/index" });
  },

  onCopyWeb() {
    wx.setClipboardData({ data: WEB_URL }).then(
      () => wx.showToast({ title: "已复制，到浏览器里打开", icon: "none" }),
      () => {},
    );
  },

  onShareAppMessage() {
    return { title: "给每张家庭照片，印上那一天", path: "/pages/home/index", imageUrl: "/images/share.jpg" };
  },
});
