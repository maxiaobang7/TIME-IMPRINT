import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type CSSProperties,
} from "react";
import { Eye, ScanLine } from "lucide-react";
import type {
  BabyProfile,
  PhotoItem,
  PrintSettings,
  WatermarkTemplate,
} from "./types";
import {
  defaultPrintSettings,
  printLayout,
  printSizes,
} from "./services/print-layout";
import { renderWatermark } from "./services/watermark";

export const EditorContext = createContext({
  print: defaultPrintSettings,
  setPrint: (_settings: PrintSettings) => {},
  resetLocation: () => {},
  photo: undefined as PhotoItem | undefined,
  babyProfile: { name: "", birthday: "" } as BabyProfile,
});

export function PrintControls() {
  const { print, setPrint } = useContext(EditorContext);
  const radioName = useId();
  return (
    <div className="control-stack print-controls">
      <label>
        照片尺寸
        <select
          value={print.size}
          onChange={(event) =>
            setPrint({
              ...print,
              size: event.target.value as PrintSettings["size"],
            })
          }
        >
          {printSizes.map((size) => (
            <option key={size.id} value={size.id}>
              {size.label}
            </option>
          ))}
        </select>
      </label>
      {print.size !== "original" && (
        <>
          <fieldset>
            <legend>画面适配</legend>
            <div className="fit-options">
              <label>
                <input
                  type="radio"
                  name={radioName}
                  checked={print.fit === "contain"}
                  onChange={() => setPrint({ ...print, fit: "contain" })}
                />
                完整保留
              </label>
              <label>
                <input
                  type="radio"
                  name={radioName}
                  checked={print.fit === "cover"}
                  onChange={() => setPrint({ ...print, fit: "cover" })}
                />
                居中裁切
              </label>
            </div>
          </fieldset>
          <label className="slider-row">
            <span>安全边距</span>
            <b>{print.marginMm} mm</b>
            <input
              type="range"
              min="2"
              max="10"
              step="0.5"
              value={print.marginMm}
              onChange={(event) =>
                setPrint({ ...print, marginMm: Number(event.target.value) })
              }
            />
          </label>
        </>
      )}
    </div>
  );
}

export function PhotoPreview({
  preview,
  photo,
  className = "",
}: {
  preview?: string;
  photo?: PhotoItem;
  className?: string;
}) {
  const { print } = useContext(EditorContext);
  const [original, setOriginal] = useState(false);
  const [safe, setSafe] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 1, height: 1 });
  const layout = printLayout(dimensions.width, dimensions.height, print);
  return (
    <section className={`photo-preview ${className}`}>
      <div className="preview-toolbar">
        <span>{original ? "原始照片" : "水印预览"}</span>
        <div>
          <button
            title="对比原图"
            aria-label="对比原图"
            aria-pressed={original}
            disabled={!preview}
            onClick={() => setOriginal(!original)}
          >
            <Eye size={18} />
          </button>
          <button
            title="相纸安全区域"
            aria-label="相纸安全区域"
            aria-pressed={safe}
            disabled={!preview || original || print.size === "original"}
            onClick={() => setSafe(!safe)}
          >
            <ScanLine size={18} />
          </button>
        </div>
      </div>
      <div className="preview-stage">
        {preview ? (
          <div
            className="photo-frame"
            style={
              {
                "--photo-ratio": dimensions.width / dimensions.height,
                aspectRatio: `${dimensions.width} / ${dimensions.height}`,
              } as CSSProperties
            }
          >
            <img
              src={original ? photo?.previewUrl : preview}
              alt={original ? "原始照片" : "水印效果"}
              onLoad={(event) =>
                setDimensions({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
            />
            {safe && !original && print.size !== "original" && (
              <div
                className="safe-guide"
                style={{
                  left: `${(layout.margin / layout.width) * 100}%`,
                  right: `${(layout.margin / layout.width) * 100}%`,
                  top: `${(layout.margin / layout.height) * 100}%`,
                  bottom: `${(layout.margin / layout.height) * 100}%`,
                }}
              />
            )}
          </div>
        ) : (
          <div className="preview-empty">
            <img src="/icons/brand.png?v=girl-v2" alt="" />
            <h2>留住这一刻</h2>
            <p>还没有选择照片</p>
          </div>
        )}
      </div>
      <div className="preview-caption">
        <span>{photo ? photo.name : "时光印记"}</span>
        <span>
          {print.size === "original"
            ? "自由尺寸"
            : `${print.size} 寸 · 300 DPI`}
          {safe && !original && print.size !== "original" ? " · 安全区域" : ""}
        </span>
      </div>
    </section>
  );
}

export function TemplatePreview({ template }: { template: WatermarkTemplate }) {
  const { photo, babyProfile } = useContext(EditorContext);
  const [url, setUrl] = useState("");
  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    if (photo)
      renderWatermark({
        photo,
        style: template.style,
        babyProfile,
        outputFormat: "jpeg",
        maxEdge: 420,
      })
        .then((blob) => {
          if (!cancelled) {
            objectUrl = URL.createObjectURL(blob);
            setUrl(objectUrl);
          }
        })
        .catch(() => setUrl(""));
    else setUrl("");
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    photo?.id,
    photo?.editedDateText,
    photo?.editedLocationText,
    photo?.editedCoordinateText,
    photo?.eventNote,
    photo?.postcardMessage,
    photo?.postcardSignature,
    template,
    babyProfile,
  ]);
  return (
    <div className={`template-sample ${template.category}`}>
      {url ? (
        <img src={url} alt={`${template.name}水印效果`} />
      ) : (
        <span>
          {template.category === "baby"
            ? "小满 · 2岁\n2024年5月20日"
            : "2024年5月20日\n杭州 西湖"}
        </span>
      )}
    </div>
  );
}

export function LocationSource({ photo }: { photo?: PhotoItem }) {
  const { resetLocation } = useContext(EditorContext);
  const labels = {
    manual: "手动填写",
    memory: "来自地点记忆",
    approximate: "离线近似城市 · 请核对",
    online: "地图服务解析",
  };
  return (
    <div className="location-source">
      <span>
        {photo?.locationSource ? labels[photo.locationSource] : "未获取到地点"}
      </span>
      {photo?.meta.latitude != null && (
        <button type="button" onClick={resetLocation}>
          重新匹配
        </button>
      )}
    </div>
  );
}
