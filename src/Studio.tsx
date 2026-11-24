import { useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Baby,
  CalendarClock,
  Check,
  FileStack,
  ImagePlus,
  Lock,
  MapPin,
  Printer,
} from "lucide-react";
import { defaultTemplates } from "./data/templates";
import { MiniProgramCard } from "./MiniProgram";
import type { TemplateCategory, WatermarkTemplate } from "./types";

const steps = [
  { title: "选照片", text: "一次可选多张，拍摄时间和 GPS 自动读出来。" },
  { title: "挑风格", text: "十款水印，从角标到拍立得，实时预览。" },
  { title: "存下来", text: "保存原图质量，或批量打包 ZIP、导出 PDF。" },
];

const features = [
  { icon: CalendarClock, title: "自动读取拍摄时间", text: "从 EXIF 读出拍摄日期，支持五种日期格式一键切换。" },
  { icon: MapPin, title: "离线匹配城市", text: "根据 GPS 就近匹配省市；改过的地名会被记住。" },
  { icon: Baby, title: "宝宝月龄", text: "填一次生日，每张照片自动算出「1岁3个月」。" },
  { icon: FileStack, title: "批量处理", text: "多张照片共用样式，地点和事件可一键同步。" },
  { icon: Printer, title: "相纸尺寸", text: "3 / 5 / 6 寸 300 DPI 排版，带安全边距参考线。" },
  { icon: Lock, title: "照片不上传", text: "全部在浏览器里完成，无需注册，可离线使用。" },
];

const filters: Array<{ id: "all" | TemplateCategory; label: string }> = [
  { id: "all", label: "全部" },
  { id: "baby", label: "宝宝成长" },
  { id: "travel", label: "日常出游" },
];

export function StudioHome(props: {
  template: WatermarkTemplate;
  onChoose: (template: WatermarkTemplate) => void;
  onPick: () => void;
  hasPhotos: boolean;
  onContinue: () => void;
}) {
  const others = defaultTemplates.filter((item) => item.id !== props.template.id);
  const backA = others.find((item) => item.style.layout === "paper") ?? others[0];
  const backB = others.find((item) => item.style.layout !== "paper" && item.id !== backA.id) ?? others[1];
  const scrollToTemplates = () =>
    document.getElementById("templates")?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <main className="studio-home">
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-badge">免费 · 无需注册 · 照片不上传</span>
          <h1>
            给每张家庭照片
            <br />
            印上<em>那一天</em>
          </h1>
          <p>
            自动读取照片里的拍摄时间与地点，配上宝宝月龄和一句小记。
            十款水印风格，在浏览器里几秒完成。
          </p>
          <div className="hero-actions">
            <button className="primary-action hero-cta" onClick={props.onPick}>
              <ImagePlus size={20} />
              选择照片，开始制作
            </button>
            {props.hasPhotos ? (
              <button className="ghost-action" onClick={props.onContinue}>
                继续编辑已选照片
                <ArrowRight size={16} />
              </button>
            ) : (
              <button className="ghost-action" onClick={scrollToTemplates}>
                先看看模板
                <ArrowDown size={16} />
              </button>
            )}
          </div>
          <ul className="hero-facts">
            <li><b>{defaultTemplates.length}</b>款水印风格</li>
            <li><b>EXIF</b>自动读时间地点</li>
            <li><b>ZIP · PDF</b>批量导出</li>
          </ul>
          <MiniProgramCard />
        </div>
        <div className="hero-visual" aria-label="水印示例">
          <img className="hero-back hero-back-a" src={`/studio/previews/${backA.id}-thumb.webp`} alt="" loading="lazy" decoding="async" />
          <img className="hero-back hero-back-b" src={`/studio/previews/${backB.id}-thumb.webp`} alt="" loading="lazy" decoding="async" />
          <figure className="home-example">
            <img key={props.template.id} src={`/studio/previews/${props.template.id}.webp`} alt={`${props.template.name}水印示例`} fetchPriority="high" />
            <figcaption className="example-label">
              <span>{props.template.name}</span>
              {props.template.description}
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="home-steps" aria-label="使用步骤">
        {steps.map((step, index) => (
          <div className="step" key={step.title}>
            <span className="step-index">0{index + 1}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="home-templates" id="templates">
        <div className="section-head">
          <span className="eyebrow">Templates</span>
          <h2>{defaultTemplates.length} 种风格，总有一款适合今天</h2>
          <p>点选即可在上方预览。导入照片后，还能调字体、颜色、位置和边框。</p>
        </div>
        <TemplateChoices template={props.template} onChoose={props.onChoose} />
        <div className="template-cta">
          <span>
            已选 <b>「{props.template.name}」</b>
          </span>
          <button className="primary-action" onClick={props.onPick}>
            <ImagePlus size={18} />
            用它制作
          </button>
        </div>
      </section>

      <section className="home-exif" aria-labelledby="home-exif-title">
        <div className="section-head">
          <span className="eyebrow">Features</span>
          <h2 id="home-exif-title">照片里的时间，不用重新填写</h2>
          <p className="exif-caveat">部分截图或转发照片不含 EXIF，可手动补填；离线地点仅供参考。</p>
        </div>
        <div className="feature-grid">
          {features.map(({ icon: Icon, title, text }) => (
            <div className="feature" key={title}>
              <span className="feature-icon"><Icon size={20} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="home-closing">
        <h2>把今天，留给以后的你们</h2>
        <p>照片只在这台设备上处理，关掉网页就什么也不会留下。</p>
        <button className="primary-action hero-cta" onClick={props.onPick}>
          <ImagePlus size={20} />
          选择照片
        </button>
      </section>

      <footer className="home-footer">
        <span><img className="brand-icon" src="/icons/brand.png?v=girl-v2" alt="" width={28} height={28} />时光印记</span>
        <span>为日常，留一份纪念。</span>
      </footer>
    </main>
  );
}

function TemplateChoices({
  template,
  onChoose,
}: {
  template: WatermarkTemplate;
  onChoose: (item: WatermarkTemplate) => void;
}) {
  const [filter, setFilter] = useState<"all" | TemplateCategory>("all");
  const items = defaultTemplates.filter((item) => filter === "all" || item.category === filter);
  return (
    <>
      <div className="template-filters" role="group" aria-label="模板分类">
        {filters.map((item) => (
          <button
            key={item.id}
            className={filter === item.id ? "active" : ""}
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="studio-template-grid home-template-grid">
        {items.map((item) => (
          <button
            key={item.id}
            className={item.id === template.id ? "selected" : ""}
            aria-pressed={item.id === template.id}
            onClick={() => onChoose(item)}
          >
            <div className={`template-sample ${item.category}`}>
              <img src={`/studio/previews/${item.id}-thumb.webp`} alt={`${item.name}水印效果`} loading="lazy" decoding="async" />
            </div>
            {item.id === template.id && <Check className="template-check" size={22} />}
            <span>
              {item.name}
              <small>{item.description}</small>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

export function StudioTemplateLibrary(props: {
  template: WatermarkTemplate;
  onChoose: (template: WatermarkTemplate) => void;
}) {
  return (
    <section className="home-templates library">
      <header className="section-head">
        <span className="eyebrow">Templates</span>
        <h1>照片模板</h1>
        <p>为回忆挑一件外衣。选好后会直接进入编辑。</p>
      </header>
      <TemplateChoices {...props} />
    </section>
  );
}
