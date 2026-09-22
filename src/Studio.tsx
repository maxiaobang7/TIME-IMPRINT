import { useEffect, useState } from "react";
import { ArrowRight, Check, ImagePlus } from "lucide-react";
import { defaultTemplates } from "./data/templates";
import { EditorContext, TemplatePreview } from "./EditorExtras";
import { defaultPrintSettings } from "./services/print-layout";
import { loadSamplePhoto, sampleBaby } from "./services/sample";
import { renderWatermark } from "./services/watermark";
import type { PhotoItem, WatermarkTemplate } from "./types";

function useSample(id = "travel-memory") {
  const [photo, setPhoto] = useState<PhotoItem>();
  useEffect(() => {
    let active = true;
    setPhoto(undefined);
    loadSamplePhoto(id)
      .then((value) => {
        if (active) setPhoto(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id]);
  return photo;
}

export function StudioHome(props: {
  template: WatermarkTemplate;
  onChoose: (template: WatermarkTemplate) => void;
  onPick: () => void;
  hasPhotos: boolean;
  onContinue: () => void;
}) {
  const photo = useSample(props.template.id);
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setUrl("");
    if (photo)
      renderWatermark({
        photo,
        style: props.template.style,
        babyProfile: sampleBaby,
        outputFormat: "jpeg",
        maxEdge: 1200,
      })
        .then((blob) => {
          if (active) {
            objectUrl = URL.createObjectURL(blob);
            setUrl(objectUrl);
          }
        })
        .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo, props.template]);
  return (
    <EditorContext.Provider
      value={{
        photo,
        babyProfile: sampleBaby,
        print: defaultPrintSettings,
        setPrint: () => {},
        resetLocation: () => {},
      }}
    >
      <main className="studio-home">
        <div className="home-heading">
          <h1>给宝宝照片，留下成长印记</h1>
          <p>时间、地点，还有那天的小故事。</p>
        </div>
        <section className="home-example" aria-label="水印示例">
          {url ? (
            <img
              src={url}
              alt={`${props.template.name}水印示例`}
            />
          ) : (
            <div className="sample-loading">正在准备示例</div>
          )}
          <span className="example-label">示例效果</span>
        </section>
        <div className="home-start">
          <button className="primary-action" onClick={props.onPick}>
            <ImagePlus size={20} />
            选择照片，开始制作
          </button>
          {props.hasPhotos && (
            <button className="continue-link" onClick={props.onContinue}>
              继续编辑已选照片
              <ArrowRight size={16} />
            </button>
          )}
          <p>
            无需注册 · 照片不上传 · 免费使用
          </p>
        </div>
        <section className="home-templates">
          <div className="section-row">
            <h2>选一种喜欢的风格</h2>
          </div>
          <TemplateChoices
            template={props.template}
            onChoose={props.onChoose}
          />
        </section>
        <footer className="home-footer">
          <span><img className="brand-icon" src="/icons/brand.png?v=girl-v2" alt="" width={32} height={32} />时光印记</span>
          <span>为日常，留一份纪念。</span>
        </footer>
      </main>
    </EditorContext.Provider>
  );
}

function TemplateChoices({
  template,
  onChoose,
}: {
  template: WatermarkTemplate;
  onChoose: (item: WatermarkTemplate) => void;
}) {
  return (
    <div className="studio-template-grid home-template-grid">
      {defaultTemplates.map((item) => (
        <button
          key={item.id}
          className={item.id === template.id ? "selected" : ""}
          aria-pressed={item.id === template.id}
          onClick={() => onChoose(item)}
        >
          <SamplePreview template={item} />
          {item.id === template.id && <Check className="template-check" size={24} />}
          <span>
            {item.name}
          </span>
        </button>
      ))}
    </div>
  );
}

function SamplePreview({ template }: { template: WatermarkTemplate }) {
  const photo = useSample(template.id);
  return <EditorContext.Provider value={{ photo, babyProfile: sampleBaby, print: defaultPrintSettings, setPrint: () => {}, resetLocation: () => {} }}>
    <TemplatePreview template={template} />
  </EditorContext.Provider>;
}

export function StudioTemplateLibrary(props: {
  template: WatermarkTemplate;
  onChoose: (template: WatermarkTemplate) => void;
}) {
  const photo = useSample();
  return (
    <EditorContext.Provider
      value={{
        photo,
        babyProfile: sampleBaby,
        print: defaultPrintSettings,
        setPrint: () => {},
        resetLocation: () => {},
      }}
    >
      <header className="page-heading">
        <span className="eyebrow">为回忆挑一件外衣</span>
        <h1>照片模板</h1>
      </header>
      <TemplateChoices {...props} />
    </EditorContext.Provider>
  );
}
