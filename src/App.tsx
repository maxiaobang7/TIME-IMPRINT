import { useEffect, useRef, useState } from "react";
import { Icons } from "./icons";
import { useMemo } from "react";
import { babyAgeText, parseCaptureDate } from "./utils/date";
import { StudioHome, StudioTemplateLibrary } from "./Studio";
import { SavePhotoDialog } from "./SavePhotoDialog";
import { isAppleMobile } from "./services/export";
import { defaultTemplates } from "./data/templates";
import {
  downloadBlob,
  makePdf,
  makeZip,
  shareBlob,
} from "./services/export";
import { getOfflineRegion, reverseGeocode } from "./services/location";
import { fileToPhoto, revokePhotoUrls } from "./services/photo";
import { renderWatermark } from "./services/watermark";
import { postcardMessage, postcardSignature } from "./services/postcard";
import { defaultPrintSettings } from "./services/print-layout";
import {
  EditorContext,
  LocationSource,
  PhotoPreview,
  PrintControls,
  TemplatePreview,
} from "./EditorExtras";
import type {
  BabyProfile,
  LocationField,
  LocationSettings,
  PhotoItem,
  WatermarkPosition,
  WatermarkStyle,
  WatermarkTemplate,
} from "./types";
import {
  clearLocationAliases,
  loadBabyProfile,
  loadLocationAlias,
  loadLocationSettings,
  saveBabyProfile,
  saveLocationAlias,
  saveLocationSettings,
  saveStyle,
} from "./utils/storage";

type Tab = "home" | "templates" | "settings";
type MobileScreen = "main" | "editor";
type EditorSection = "style" | "text" | "print";

const positions: Array<{
  id: WatermarkPosition;
  label: string;
  icon: keyof typeof Icons;
}> = [
  { id: "top-left", label: "左上", icon: "MoveUpLeft" },
  { id: "top-right", label: "右上", icon: "MoveUpRight" },
  { id: "bottom-left", label: "左下", icon: "MoveDownLeft" },
  { id: "bottom-right", label: "右下", icon: "MoveDownRight" },
  { id: "bottom-center", label: "底部居中", icon: "MoveDown" },
];

const colorOptions = [
  "#ffffff",
  "#111111",
  "#5b5b5b",
  "#7a6a64",
  "#fa7668",
  "#f6b15d",
  "#9ab972",
  "#94cde0",
];

const locationFieldOptions: Array<{ id: LocationField; label: string }> = [
  { id: "province", label: "省/直辖市" },
  { id: "city", label: "城市" },
  { id: "district", label: "区县" },
  { id: "street", label: "街道" },
  { id: "landmark", label: "地标" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [mobileScreen, setMobileScreen] = useState<MobileScreen>("main");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [template, setTemplate] = useState<WatermarkTemplate>(
    defaultTemplates[0],
  );
  const [savedStyle, setStyle] = useState<WatermarkStyle>({
    ...defaultTemplates[0].style,
  });
  const [babyProfile, setBabyProfile] = useState<BabyProfile>(() =>
    loadBabyProfile(),
  );
  const [locationSettings, setLocationSettings] = useState<LocationSettings>(
    () => loadLocationSettings(),
  );
  const style = useMemo(() => locationSettings.privacyLevel === "hidden"
    ? { ...savedStyle, showLocation: false, showCoordinate: false }
    : savedStyle, [savedStyle, locationSettings.privacyLevel]);
  const [editorSection, setEditorSection] = useState<EditorSection>("style");
  const [busyText, setBusyText] = useState("");
  const [batchCancelable, setBatchCancelable] = useState(false);
  const [importFailures, setImportFailures] = useState<string[]>([]);
  const batchController = useRef<AbortController | undefined>(undefined);
  const [toast, setToast] = useState("");
  const [albumPhoto, setAlbumPhoto] = useState<{ blob: Blob; filename: string }>();
  const [appleMobile] = useState(() => isAppleMobile());
  const [textEditing, setTextEditing] = useState(false);
  const [outputFormat, setOutputFormat] = useState<"jpeg" | "png">("jpeg");
  const [printSettings, setPrintSettings] = useState(defaultPrintSettings);
  const [desktop, setDesktop] = useState(
    () => window.matchMedia("(min-width: 861px)").matches,
  );
  const renderVersion = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorPanelRef = useRef<HTMLElement>(null);

  const selectedPhoto =
    photos.find((photo) => photo.id === selectedId) ?? photos[0];
  const renderedPhotos = photos.filter((photo) => photo.renderedBlob);

  useEffect(() => saveStyle(style), [style]);
  useEffect(() => saveBabyProfile(babyProfile), [babyProfile]);
  useEffect(() => saveLocationSettings(locationSettings), [locationSettings]);
  useEffect(() => {
    if (!photos.length) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [photos.length]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 861px)");
    const change = () => setDesktop(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!desktop) window.scrollTo({ top: 0, behavior: "instant" });
  }, [mobileScreen, tab, desktop]);

  useEffect(() => {
    // Keep Canvas work away from iOS keyboard activation and text composition.
    if (!photos.length || textEditing) return;
    const version = ++renderVersion.current;
    const handle = window.setTimeout(() => {
      renderSelected(version).catch(() => showToast("预览生成失败，请重试"));
    }, 180);
    return () => {
      window.clearTimeout(handle);
      ++renderVersion.current;
    };
  }, [
    textEditing,
    style,
    selectedId,
    babyProfile,
    outputFormat,
    printSettings,
    selectedPhoto?.editedDateText,
    selectedPhoto?.editedLocationText,
    selectedPhoto?.editedCoordinateText,
    selectedPhoto?.eventNote,
    selectedPhoto?.postcardMessage,
    selectedPhoto?.postcardSignature,
  ]);

  const canExport = renderedPhotos.length > 0;

  async function handleFiles(files: FileList | null) {
    if (!files?.length || batchController.current) return;
    const controller = new AbortController();
    batchController.current = controller;
    setBatchCancelable(true);
    setImportFailures([]);
    const loaded: PhotoItem[] = [];
    const failed: string[] = [];
    try {
      const incoming = Array.from(files);
      for (const [index, file] of incoming.entries()) {
        if (controller.signal.aborted) break;
        setBusyText(`正在导入 ${index + 1}/${incoming.length}：${file.name}`);
        await new Promise(resolve => window.setTimeout(resolve, 0));
        let photo: PhotoItem | undefined;
        try {
          photo = await fileToPhoto(file);
          controller.signal.throwIfAborted();
          if (photo.editedCoordinateText && locationSettings.privacyLevel !== "hidden") {
            [photo] = await resolvePhotoLocations([photo]);
          }
          const blob = await renderWatermark({ photo, style, babyProfile, outputFormat, printSettings, maxEdge: 1200 });
          controller.signal.throwIfAborted();
          loaded.push({ ...photo, renderedBlob: blob, renderedUrl: URL.createObjectURL(blob) });
        } catch (error) {
          if (photo) revokePhotoUrls(photo);
          if (controller.signal.aborted) break;
          failed.push(`${file.name}：${error instanceof Error ? error.message : "无法读取图片"}`);
        }
      }
      if (loaded.length) {
        setPhotos(current => [...current, ...loaded]);
        setSelectedId(loaded[0].id);
        setTab("home");
        setEditorSection("text");
        setMobileScreen("editor");
        focusEditorAfterUpload();
      }
      setImportFailures(failed);
      showToast(`${controller.signal.aborted ? "已停止，保留" : "已导入"} ${loaded.length} 张照片${failed.length ? `，跳过 ${failed.length} 张` : ""}`);
    } finally {
      batchController.current = undefined;
      setBatchCancelable(false);
      setBusyText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function renderSelected(version: number) {
    if (!selectedPhoto) return;
    const blob = await renderWatermark({
      photo: selectedPhoto,
      style,
      babyProfile,
      outputFormat,
      printSettings,
      maxEdge: 1200,
    });
    if (version !== renderVersion.current) return;
    const renderedUrl = URL.createObjectURL(blob);
    setPhotos((current) =>
      current.map((photo) => {
        if (photo.id !== selectedPhoto.id) return photo;
        if (photo.renderedUrl) URL.revokeObjectURL(photo.renderedUrl);
        return { ...photo, renderedBlob: blob, renderedUrl };
      }),
    );
  }

  async function renderMany(items = photos, nextStyle = style) {
    const rendered = await renderPhotoList(items, nextStyle);
    setPhotos((current) =>
      current.map((photo) => {
        const result = rendered.find((item) => item.id === photo.id);
        if (!result) return photo;
        if (photo.renderedUrl) URL.revokeObjectURL(photo.renderedUrl);
        return {
          ...photo,
          renderedBlob: result.renderedBlob,
          renderedUrl: result.renderedUrl,
        };
      }),
    );
  }

  async function renderPhotoList(items: PhotoItem[], nextStyle = style) {
    const result: PhotoItem[] = [];
    try {
      for (const photo of items) {
        batchController.current?.signal.throwIfAborted();
        setBusyText(`正在更新预览 ${result.length + 1}/${items.length}`);
        await new Promise(resolve => window.setTimeout(resolve, 0));
        const blob = await renderWatermark({
          photo,
          style: nextStyle,
          babyProfile,
          outputFormat,
          printSettings,
          maxEdge: 1200,
        });
        batchController.current?.signal.throwIfAborted();
        result.push({
          ...photo,
          renderedBlob: blob,
          renderedUrl: URL.createObjectURL(blob),
        });
      }
      return result;
    } catch (error) {
      result.forEach((photo) => URL.revokeObjectURL(photo.renderedUrl!));
      throw error;
    }
  }

  async function rerenderAll() {
    if (!photos.length) return;
    await runExport(async () => {
      await renderMany();
      showToast("批量水印已更新");
    }, true);
  }

  function updateSelectedPhoto(patch: Partial<PhotoItem>) {
    if (!selectedPhoto) return;
    if (typeof patch.editedLocationText === "string")
      patch.locationSource = "manual";
    if (
      typeof patch.editedLocationText === "string" &&
      selectedPhoto.meta.latitude != null &&
      selectedPhoto.meta.longitude != null
    ) {
      patch.locationSource = "manual";
      const region = getOfflineRegion(
        selectedPhoto.meta.latitude,
        selectedPhoto.meta.longitude,
      );
      const regionKey = region
        ? `${region.province}|${region.city}`
        : undefined;
      saveLocationAlias(
        selectedPhoto.meta.latitude,
        selectedPhoto.meta.longitude,
        patch.editedLocationText,
        regionKey,
      );
    }
    setPhotos((current) =>
      current.map((photo) =>
        photo.id === selectedPhoto.id ? { ...photo, ...patch } : photo,
      ),
    );
  }

  async function resolvePhotoLocations(items: PhotoItem[]) {
    return Promise.all(
      items.map(async (photo) => {
        const { latitude, longitude } = photo.meta;
        if (latitude == null || longitude == null) return photo;
        const region = getOfflineRegion(latitude, longitude);
        const regionKey = region
          ? `${region.province}|${region.city}`
          : undefined;
        const remembered = loadLocationAlias(latitude, longitude, regionKey);
        if (remembered)
          return {
            ...photo,
            editedLocationText: remembered,
            locationSource: "memory" as const,
          };
        const resolved = await reverseGeocode({
          latitude,
          longitude,
          settings: locationSettings,
          timeoutMs: 2_500,
        }).catch(() => undefined);
        return resolved
          ? {
              ...photo,
              editedLocationText: resolved,
              locationSource:
                locationSettings.provider === "offline"
                  ? ("approximate" as const)
                  : ("online" as const),
            }
          : photo;
      }),
    );
  }

  function chooseTemplate(next: WatermarkTemplate) {
    setTemplate(next);
    setStyle(next.style);
  }

  async function downloadCurrent() {
    if (!selectedPhoto) return;
    await runExport(async () => {
      const blob = await renderWatermark({
        photo: selectedPhoto,
        style,
        babyProfile,
        outputFormat,
        printSettings,
      });
      downloadBlob(blob, outputName(selectedPhoto, outputFormat));
    });
  }

  async function saveToAlbum() {
    if (!selectedPhoto) return;
    await runExport(async () => {
      const blob = await renderWatermark({ photo: selectedPhoto, style, babyProfile, outputFormat, printSettings });
      setAlbumPhoto({ blob, filename: outputName(selectedPhoto, outputFormat) });
    });
  }

  async function shareCurrent() {
    if (appleMobile) return saveToAlbum();
    if (!selectedPhoto?.renderedBlob) return;
    try {
      const blob = await renderWatermark({
        photo: selectedPhoto,
        style,
        babyProfile,
        outputFormat,
        printSettings,
      });
      const shared = await shareBlob(
        blob,
        outputName(selectedPhoto, outputFormat),
      );
      if (!shared) {
        downloadBlob(blob, outputName(selectedPhoto, outputFormat));
        showToast("当前浏览器不支持直接分享，已改为下载");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        showToast("分享不可用，请使用保存图片");
    }
  }

  async function runExport(action: (signal: AbortSignal) => Promise<void>, cancellable = false) {
    if (batchController.current) return;
    const controller = new AbortController();
    batchController.current = controller;
    setBatchCancelable(cancellable);
    setBusyText("正在生成...");
    try {
      await action(controller.signal);
    } catch (error) {
      showToast(controller.signal.aborted ? "已取消，照片和修改已保留" : error instanceof Error ? error.message : "导出失败，请重试");
    } finally {
      batchController.current = undefined;
      setBatchCancelable(false);
      setBusyText("");
    }
  }

  async function* freshPhotos(signal: AbortSignal) {
    for (const [index, photo] of photos.entries()) {
      signal.throwIfAborted();
      setBusyText(`正在生成 ${index + 1}/${photos.length}：${photo.name}`);
      await new Promise(resolve => window.setTimeout(resolve, 0));
      const renderedBlob = await renderWatermark({ photo, style, babyProfile, outputFormat, printSettings });
      signal.throwIfAborted();
      yield {
        ...photo,
        renderedBlob,
      };
    }
    setBusyText("正在打包文件...");
  }


  async function resetLocation() {
    if (
      !selectedPhoto ||
      selectedPhoto.meta.latitude == null ||
      selectedPhoto.meta.longitude == null
    )
      return;
    const id = selectedPhoto.id;
    await runExport(async () => {
      const resolved = await reverseGeocode({
        latitude: selectedPhoto.meta.latitude!,
        longitude: selectedPhoto.meta.longitude!,
        settings: locationSettings,
      });
      setPhotos((current) =>
        current.map((photo) =>
          photo.id === id
            ? {
                ...photo,
                editedLocationText: resolved ?? "",
                locationSource: resolved
                  ? locationSettings.provider === "offline"
                    ? "approximate"
                    : "online"
                  : undefined,
              }
            : photo,
        ),
      );
      if (!resolved) showToast("未匹配到地点，可手动填写");
    });
  }

  async function downloadZip() {
    if (!renderedPhotos.length) return;
    await runExport(async signal => {
      const blob = await makeZip(freshPhotos(signal), signal);
      signal.throwIfAborted();
      downloadBlob(blob, "时光印记-照片.zip");
    }, true);
  }

  async function downloadPdf() {
    if (!renderedPhotos.length) return;
    await runExport(async signal => {
      const blob = await makePdf(freshPhotos(signal), printSettings, signal);
      signal.throwIfAborted();
      downloadBlob(blob, "时光印记-照片.pdf");
    }, true);
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  }

  function focusEditorAfterUpload() {
    window.setTimeout(() => {
      if (
        !appleMobile &&
        window.matchMedia("(min-width: 861px) and (pointer: fine)").matches &&
        !document.activeElement?.matches("input, textarea, select, [contenteditable]")
      ) {
        editorPanelRef.current?.focus({ preventScroll: true });
      }
    }, 120);
  }

  const currentPreview =
    selectedPhoto?.renderedUrl ?? selectedPhoto?.previewUrl;

  const editing =
    tab === "home" && mobileScreen === "editor" && !!selectedPhoto;
  const pick = () => fileInputRef.current?.click();
  const goHome = () => {
    setTab("home");
    setMobileScreen("main");
  };
  return (
    <EditorContext.Provider
      value={{
        print: printSettings,
        setPrint: setPrintSettings,
        resetLocation,
        photo: selectedPhoto,
        babyProfile,
      }}
    >
      <div className={"studio-app " + (editing ? "is-editing" : "")}>
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          onChange={(event) => handleFiles(event.target.files)}
        />
        <header className="studio-header">
          <button className="brand" onClick={goHome}>
            <img className="brand-icon" src="/icons/brand.png?v=girl-v2" alt="" width={40} height={40} />
            <span>
              时光印记<small>相册工作室</small>
            </span>
          </button>
          <nav aria-label="主导航">
            <button className={tab === "home" ? "active" : ""} onClick={goHome}>
              首页
            </button>
            <button
              className={tab === "templates" ? "active" : ""}
              onClick={() => setTab("templates")}
            >
              模板
            </button>
            <button
              className={tab === "settings" ? "active" : ""}
              onClick={() => setTab("settings")}
            >
              设置
            </button>
          </nav>
          <button
            className="header-import"
            onClick={pick}
            aria-label={photos.length ? "添加照片" : "选择照片"}
            title={photos.length ? "添加照片" : "选择照片"}
          >
            <Icons.ImagePlus size={18} />
            <span>{photos.length ? "添加照片" : "选择照片"}</span>
          </button>
        </header>
        {importFailures.length > 0 && <section className="import-failures" role="status">
          <strong>已跳过 {importFailures.length} 张无法读取的照片，其余照片可继续编辑。</strong>
          <ul>{importFailures.map((failure, index) => <li key={index}>{failure}</li>)}</ul>
          <button onClick={() => setImportFailures([])}>关闭提示</button>
        </section>}
        {tab === "home" && !editing && (
          <StudioHome
            template={template}
            onChoose={chooseTemplate}
            onPick={pick}
            hasPhotos={!!photos.length}
            onContinue={() => setMobileScreen("editor")}
          />
        )}
        {editing && (
          <main className="studio-workspace">
            <section className="canvas-column">
              <div className="workspace-title">
                <div>
                  <h1>相册工作室</h1>
                  <span>
                    {photos.length} 张照片 ·{" "}
                    {printSettings.size === "original"
                      ? "自由尺寸"
                      : printSettings.size + " 寸相纸"}
                  </span>
                </div>
                <button onClick={goHome}>
                  <Icons.ChevronLeft size={16} />
                  首页
                </button>
              </div>
              <PhotoPreview preview={currentPreview} photo={selectedPhoto} />
              <div className="filmstrip" aria-label="照片列表">
                {photos.map((photo, index) => (
                  <div
                    className={
                      "film-item " +
                      (photo.id === selectedPhoto?.id ? "selected" : "")
                    }
                    key={photo.id}
                  >
                    <button
                      onClick={() => setSelectedId(photo.id)}
                      aria-label={"选择照片 " + (index + 1)}
                      aria-pressed={photo.id === selectedPhoto?.id}
                    >
                      <img src={photo.renderedUrl ?? photo.previewUrl} alt={photo.name} loading="lazy" />
                      <span>{index + 1}</span>
                    </button>
                    <button
                      className="remove-photo"
                      title="移除照片"
                      aria-label={"移除照片 " + (index + 1)}
                      onClick={() => {
                        ++renderVersion.current;
                        revokePhotoUrls(photo);
                        const remaining = photos.filter(
                          (item) => item.id !== photo.id,
                        );
                        setPhotos(remaining);
                        if (selectedPhoto?.id === photo.id)
                          setSelectedId(remaining[0]?.id ?? "");
                        if (!remaining.length) setMobileScreen("main");
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  className="film-add"
                  onClick={pick}
                  title="添加照片"
                  aria-label="添加照片"
                >
                  <Icons.ImagePlus />
                </button>
              </div>
            </section>
            <aside className="inspector" ref={editorPanelRef} tabIndex={-1}
              onFocusCapture={(event) => {
                if (appleMobile && event.target.matches('input:not([type]), input[type="text"], textarea')) setTextEditing(true);
              }}
              onBlurCapture={(event) => {
                if (!(event.relatedTarget instanceof Element) || !event.relatedTarget.matches('input:not([type]), input[type="text"], textarea')) setTextEditing(false);
              }}
            >
              <div className="inspector-heading">
                <h2>编辑照片</h2>
                <span>{selectedPhoto?.name}</span>
              </div>
              <div className="editor-tabs" role="tablist" aria-label="照片编辑">
                {(["style", "text", "print"] as const).map((section, index) => (
                  <button
                    role="tab"
                    aria-selected={editorSection === section}
                    key={section}
                    className={editorSection === section ? "active" : ""}
                    onClick={() => setEditorSection(section)}
                  >
                    {["模板", "文字", "相纸"][index]}
                  </button>
                ))}
              </div>
              <div className="inspector-body" role="tabpanel">
                {appleMobile && editorSection === "text" && <p className="hint-text">结束输入后更新预览，保存时会使用最新文字。</p>}
                {editorSection === "style" && (
                  <>
                    <div className="studio-template-grid">
                      {defaultTemplates.map((item) => (
                        <button
                          key={item.id}
                          className={template.id === item.id ? "selected" : ""}
                          aria-pressed={template.id === item.id}
                          onClick={() => chooseTemplate(item)}
                        >
                          <TemplatePreview template={item} />
                          <span>{item.name}</span>
                        </button>
                      ))}
                    </div>
                    <details className="advanced-style">
                      <summary>调整样式与位置</summary>
                      <StyleEditor
                        template={template}
                        style={style}
                        onChooseTemplate={chooseTemplate}
                        onStyleChange={setStyle}
                      />
                      {style.frame !== "postcard" && <PositionEditor style={style} onStyleChange={setStyle} />}
                    </details>
                    <button
                      className="reset-template-style"
                      title="恢复当前模板的默认样式，保留照片和文字内容"
                      onClick={() => {
                        setStyle({ ...template.style });
                        showToast(`已恢复「${template.name}」默认样式`);
                      }}
                    >
                      <Icons.RotateCcw size={16} />
                      恢复默认样式
                    </button>
                  </>
                )}
                {editorSection === "text" && (
                  <TextEditor
                    selectedPhoto={selectedPhoto}
                    babyProfile={babyProfile}
                    style={style}
                    onPhotoChange={updateSelectedPhoto}
                    onStyleChange={setStyle}
                  />
                )}
                {editorSection === "print" && (
                  <>
                    <PrintControls />
                    <label className="format-select">
                      导出格式
                      <select
                        value={outputFormat}
                        onChange={(event) =>
                          setOutputFormat(event.target.value as "jpeg" | "png")
                        }
                      >
                        <option value="jpeg">JPEG</option>
                        <option value="png">PNG</option>
                      </select>
                    </label>
                  </>
                )}
              </div>
              <div className="studio-export">
                <div className="export-summary">
                  <span>
                    {photos.length > 1
                      ? "全部照片共用当前样式"
                      : "照片仅在本机处理"}
                  </span>
                  <Icons.Lock size={13} />
                </div>
                <div className="export-buttons">
                  <button
                    className="primary-action"
                    disabled={!canExport}
                    onClick={appleMobile ? saveToAlbum : downloadCurrent}
                  >
                    <Icons.Download size={18} />
                    {appleMobile ? "保存到相册" : "保存图片"}
                  </button>
                  <details className="more-actions">
                    <summary title="更多导出选项" aria-label="更多导出选项">
                      <Icons.SlidersHorizontal size={18} />
                    </summary>
                    <div className="export-menu">
                      {appleMobile && <button onClick={downloadCurrent}><Icons.Download size={16} />下载到文件</button>}
                      <button onClick={shareCurrent}>
                        <Icons.Share2 size={16} />
                        分享图片
                      </button>
                      <button onClick={downloadPdf}>
                        <Icons.FileText size={16} />
                        导出 PDF
                      </button>
                      {photos.length > 1 && (
                        <>
                          <button onClick={downloadZip}>
                            <Icons.FileArchive size={16} />
                            全部打包
                          </button>
                          <button onClick={rerenderAll}>
                            <Icons.Sparkles size={16} />
                            更新全部预览
                          </button>
                        </>
                      )}
                    </div>
                  </details>
                </div>
              </div>
            </aside>
          </main>
        )}
        {tab === "templates" && (
          <div className="page-container">
            <StudioTemplateLibrary
              template={template}
              onChoose={(item) => {
                chooseTemplate(item);
                setTab("home");
                setMobileScreen(photos.length ? "editor" : "main");
              }}
            />
          </div>
        )}
        {tab === "settings" && (
          <div className="page-container">
            <SettingsScreen
              babyProfile={babyProfile}
              locationSettings={locationSettings}
              outputFormat={outputFormat}
              onBabyChange={setBabyProfile}
              onLocationSettingsChange={setLocationSettings}
              onClearLocationAliases={() => {
                clearLocationAliases();
                showToast("位置记忆已清除");
              }}
              onOutputFormatChange={setOutputFormat}
            />
            {!!photos.length && (
              <button
                className="primary-action return-editor"
                onClick={() => {
                  setTab("home");
                  setMobileScreen("editor");
                }}
              >
                继续编辑照片
              </button>
            )}
          </div>
        )}
        {albumPhoto && <SavePhotoDialog photo={albumPhoto} onClose={() => setAlbumPhoto(undefined)} />}
        {busyText && (
          <div className="loading-layer" role="status">
            <div className="loading-card">
              <Icons.Loader2 className="spin" size={26} />
              <span>{busyText}</span>
              {batchCancelable && <button onClick={() => {
                batchController.current?.abort();
                setBusyText("正在停止，当前照片处理结束后生效...");
                setBatchCancelable(false);
              }}>取消后续处理</button>}
            </div>
          </div>
        )}
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </div>
    </EditorContext.Provider>
  );
}

function SettingsScreen(props: {
  babyProfile: BabyProfile;
  locationSettings: LocationSettings;
  outputFormat: "jpeg" | "png";
  onBabyChange: (profile: BabyProfile) => void;
  onLocationSettingsChange: (settings: LocationSettings) => void;
  onClearLocationAliases: () => void;
  onOutputFormatChange: (format: "jpeg" | "png") => void;
}) {
  return (
    <div className="screen-content">
      <header className="simple-head">
        <h1>设置</h1>
        <p>本地保存偏好，不上传照片和个人信息。</p>
      </header>

      <div className="form-card">
        <h2>宝宝档案</h2>
        <p className="hint-text">填写宝宝生日后，才会根据照片拍摄时间计算月龄。</p>
        <label>
          名称
          <input
            value={props.babyProfile.name}
            onChange={(event) =>
              props.onBabyChange({
                ...props.babyProfile,
                name: event.target.value,
              })
            }
          />
        </label>
        <label>
          生日
          <input
            type="date"
            value={props.babyProfile.birthday}
            onChange={(event) =>
              props.onBabyChange({
                ...props.babyProfile,
                birthday: event.target.value,
              })
            }
          />
        </label>
      </div>

      <div className="form-card">
        <h2>地点解析</h2>
        <div className="settings-field" role="group" aria-label="解析服务">
          <span>解析服务</span>
          <div className="segmented">
            <button
              className={
                props.locationSettings.provider === "offline" ? "active" : ""
              }
              onClick={() =>
                props.onLocationSettingsChange({
                  ...props.locationSettings,
                  provider: "offline",
                })
              }
            >
              本地离线
            </button>
            <button
              className={
                props.locationSettings.provider === "osm" ? "active" : ""
              }
              onClick={() =>
                props.onLocationSettingsChange({
                  ...props.locationSettings,
                  provider: "osm",
                })
              }
            >
              OSM
            </button>
            <button
              className={
                props.locationSettings.provider === "amap" ? "active" : ""
              }
              onClick={() =>
                props.onLocationSettingsChange({
                  ...props.locationSettings,
                  provider: "amap",
                })
              }
            >
              高德
            </button>
          </div>
        </div>

        {props.locationSettings.provider === "amap" && (
          <label>
            高德 Web 服务 Key
            <input
              placeholder="填写高德开放平台 Web 服务 Key"
              value={props.locationSettings.amapKey}
              onChange={(event) =>
                props.onLocationSettingsChange({
                  ...props.locationSettings,
                  amapKey: event.target.value,
                })
              }
            />
          </label>
        )}

        <div className="settings-field" role="group" aria-label="地点显示">
          <span>地点显示</span>
          <div className="segmented">
            <button
              className={
                props.locationSettings.privacyLevel === "cityOnly"
                  ? "active"
                  : ""
              }
              onClick={() =>
                props.onLocationSettingsChange({
                  ...props.locationSettings,
                  privacyLevel: "cityOnly",
                })
              }
            >
              城市级{" "}
            </button>
            <button
              className={
                props.locationSettings.privacyLevel === "precise"
                  ? "active"
                  : ""
              }
              onClick={() =>
                props.onLocationSettingsChange({
                  ...props.locationSettings,
                  privacyLevel: "precise",
                })
              }
            >
              精确
            </button>
            <button
              className={
                props.locationSettings.privacyLevel === "hidden" ? "active" : ""
              }
              onClick={() =>
                props.onLocationSettingsChange({
                  ...props.locationSettings,
                  privacyLevel: "hidden",
                })
              }
            >
              隐藏
            </button>
          </div>
        </div>

        {props.locationSettings.privacyLevel === "hidden" && <p className="hint-text">已隐藏水印中的地点和经纬度，包括已导入照片；手动输入的事件和寄语不受影响。</p>}
        {props.locationSettings.privacyLevel === "precise" && (
          <div className="field-chips">
            {locationFieldOptions.map((field) => {
              const active = props.locationSettings.fields.includes(field.id);
              return (
                <button
                  key={field.id}
                  className={active ? "active" : ""}
                  onClick={() => {
                    const fields = active
                      ? props.locationSettings.fields.filter(
                          (item) => item !== field.id,
                        )
                      : [...props.locationSettings.fields, field.id];
                    props.onLocationSettingsChange({
                      ...props.locationSettings,
                      fields,
                    });
                  }}
                >
                  {field.label}
                </button>
              );
            })}
          </div>
        )}

        <button className="soft-danger" onClick={props.onClearLocationAliases}>
          清除位置记忆
        </button>
        <p className="hint-text">
          {props.locationSettings.provider === "offline"
            ? "离线结果是最近城市的近似匹配，不是精确地址；可能跨省市，请核对。"
            : "地点名称需要联网向地图服务查询；照片和水印渲染仍在本机浏览器完成。"}
        </p>
      </div>

      <div className="form-card">
        <h2>导出格式</h2>
        <div className="segmented">
          <button
            className={props.outputFormat === "jpeg" ? "active" : ""}
            onClick={() => props.onOutputFormatChange("jpeg")}
          >
            JPEG
          </button>
          <button
            className={props.outputFormat === "png" ? "active" : ""}
            onClick={() => props.onOutputFormatChange("png")}
          >
            PNG
          </button>
        </div>
      </div>

      <div className="privacy-card">
        <Icons.Lock />
        <div>
          <strong>本地处理</strong>
          <span>
            {props.locationSettings.provider === "offline"
              ? "照片和地点匹配均在本机完成，不发送坐标。"
              : "照片不会上传；联网匹配地点时，会向所选地图服务发送坐标。"}
          </span>
        </div>
      </div>
    </div>
  );
}

function StyleEditor(props: {
  template: WatermarkTemplate;
  style: WatermarkStyle;
  onChooseTemplate: (template: WatermarkTemplate) => void;
  onStyleChange: (style: WatermarkStyle) => void;
}) {
  return (
    <div className="control-stack">
      <h3>模板风格</h3>
      <div className="template-chips">
        {defaultTemplates.map((item) => (
          <button
            key={item.id}
            className={props.template.id === item.id ? "active" : ""}
            onClick={() => props.onChooseTemplate(item)}
          >
            {item.name}
          </button>
        ))}
      </div>

      {props.style.layout === "paper" && <>
        <div className="settings-field" role="group" aria-label="边框宽度">
          <span>边框宽度</span>
          <div className="segmented">
            {(["narrow", "standard", "wide"] as const).map((width, index) => <button
              key={width}
              className={(props.style.frameWidth ?? "standard") === width ? "active" : ""}
              aria-pressed={(props.style.frameWidth ?? "standard") === width}
              onClick={() => props.onStyleChange({ ...props.style, frameWidth: width })}
            >{["窄边", "标准", "宽边"][index]}</button>)}
          </div>
        </div>
        <label className="slider-row">
          <span>底部留白</span><b>{Math.round((props.style.frameFooterScale ?? 1) * 100)}%</b>
          <input type="range" min="0.85" max="1.5" step="0.05" value={props.style.frameFooterScale ?? 1}
            onChange={event => props.onStyleChange({ ...props.style, frameFooterScale: Number(event.target.value) })} />
        </label>
      </>}
      <ControlSlider
        label="字体大小"
        value={props.style.fontSizeRatio}
        min={0.02}
        max={0.07}
        step={0.001}
        onChange={(fontSizeRatio) =>
          props.onStyleChange({ ...props.style, fontSizeRatio })
        }
      />
      <ControlSlider
        label="不透明度"
        value={props.style.opacity}
        min={0.2}
        max={1}
        step={0.01}
        onChange={(opacity) => props.onStyleChange({ ...props.style, opacity })}
      />

      <h3>文字颜色</h3>
      <div className="swatches">
        {(props.style.frame === "postcard" ? ["#42658a", "#456f65", "#8a5c6c", "#535962"] : colorOptions).map((color) => (
          <button
            key={color}
            aria-label={`文字颜色 ${color}`}
            aria-pressed={props.style.textColor === color}
            title={`文字颜色 ${color}`}
            className={props.style.textColor === color ? "active" : ""}
            style={{ background: color }}
            onClick={() =>
              props.onStyleChange({ ...props.style, textColor: color })
            }
          />
        ))}
      </div>

      {props.style.frame === "postcard" && <div className="postcard-decorations">
        <label className="toggle-row"><span>海蓝邮戳</span><input type="checkbox" checked={props.style.postcardStamp !== false} onChange={event => props.onStyleChange({ ...props.style, postcardStamp: event.target.checked })} /></label>
        <label className="toggle-row"><span>手写下划线</span><input type="checkbox" checked={props.style.postcardUnderline !== false} onChange={event => props.onStyleChange({ ...props.style, postcardUnderline: event.target.checked })} /></label>
      </div>}
      {props.style.layout !== "paper" && (
        <label className="toggle-row">
          <span>深色底板</span>
          <input
            type="checkbox"
            checked={props.style.showBackground}
            onChange={(event) =>
              props.onStyleChange({
                ...props.style,
                showBackground: event.target.checked,
              })
            }
          />
        </label>
      )}
    </div>
  );
}

function TextEditor(props: {
  selectedPhoto?: PhotoItem;
  babyProfile: BabyProfile;
  style: WatermarkStyle;
  onPhotoChange: (patch: Partial<PhotoItem>) => void;
  onStyleChange: (style: WatermarkStyle) => void;
}) {
  const capturedAt = parseCaptureDate(props.selectedPhoto?.editedDateText ?? "");
  const age = capturedAt ? babyAgeText(props.babyProfile.birthday, capturedAt) : "";
  return (
    <div className="control-stack">
      <h3>文字内容</h3>
      {props.style.frame === "postcard" && <fieldset className="postcard-copy">
        <legend>旅行寄语</legend>
        <label>手写寄语
          <input className="postcard-handwriting" maxLength={60} placeholder="写给未来的一句话" value={props.selectedPhoto?.postcardMessage ?? postcardMessage} onChange={event => props.onPhotoChange({ postcardMessage: event.target.value })} />
        </label>
        <label>落款
          <input maxLength={40} placeholder="留空不显示" value={props.selectedPhoto?.postcardSignature ?? postcardSignature(props.babyProfile.name)} onChange={event => props.onPhotoChange({ postcardSignature: event.target.value })} />
        </label>
      </fieldset>}
      <label>
        拍摄时间
        <input
          placeholder="未读取到拍摄时间，可手动填写"
          value={props.selectedPhoto?.editedDateText ?? ""}
          onChange={(event) =>
            props.onPhotoChange({ editedDateText: event.target.value })
          }
        />
      </label>
      <p className="hint-text" data-testid="capture-age-hint">
        {!capturedAt ? "填写有效日期（例如 2026-09-23 10:30）后可计算月龄；自定义文字仍会保留。"
          : !props.babyProfile.birthday ? "在设置中填写宝宝生日，即可根据这里的日期计算月龄。"
          : age ? `此日期对应月龄：${age}` : "此日期早于生日，或生日无效，暂不显示月龄。"}
      </p>
      <label>
        拍摄地点
        <input
          placeholder="例如：杭州 西湖"
          value={props.selectedPhoto?.editedLocationText ?? ""}
          onChange={(event) =>
            props.onPhotoChange({ editedLocationText: event.target.value })
          }
        />
      </label>
      <LocationSource photo={props.selectedPhoto} />
      <label>
        经纬度
        <input
          value={props.selectedPhoto?.editedCoordinateText ?? ""}
          onChange={(event) =>
            props.onPhotoChange({ editedCoordinateText: event.target.value })
          }
        />
      </label>
      <label>
        记录事件
        <input
          placeholder="例如：第一次吹泡泡"
          value={props.selectedPhoto?.eventNote ?? ""}
          onChange={(event) =>
            props.onPhotoChange({ eventNote: event.target.value })
          }
        />
      </label>

      <div className="toggle-grid">
        <ToggleChip
          label="时间"
          checked={props.style.showTime}
          onChange={(showTime) =>
            props.onStyleChange({ ...props.style, showTime })
          }
        />
        <ToggleChip
          label="地点"
          checked={props.style.showLocation}
          onChange={(showLocation) =>
            props.onStyleChange({ ...props.style, showLocation })
          }
        />
        <ToggleChip
          label="经纬度"
          checked={props.style.showCoordinate}
          onChange={(showCoordinate) =>
            props.onStyleChange({ ...props.style, showCoordinate })
          }
        />
        <ToggleChip
          label="宝宝月龄"
          checked={props.style.showBabyAge}
          onChange={(showBabyAge) =>
            props.onStyleChange({ ...props.style, showBabyAge })
          }
        />
      </div>
    </div>
  );
}

function PositionEditor(props: {
  style: WatermarkStyle;
  onStyleChange: (style: WatermarkStyle) => void;
}) {
  return (
    <div className="control-stack">
      <h3>水印位置</h3>
      <div className="position-grid">
        {positions
          .filter(
            (position) =>
              props.style.layout !== "paper" ||
              position.id.startsWith("bottom"),
          )
          .map((position) => {
            const Icon = Icons[position.icon];
            return (
              <button
                key={position.id}
                className={props.style.position === position.id ? "active" : ""}
                onClick={() =>
                  props.onStyleChange({ ...props.style, position: position.id })
                }
              >
                <Icon />
                {position.label}
              </button>
            );
          })}
      </div>
    </div>
  );
}

function ControlSlider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider-row">
      <span>{props.label}</span>
      <b>{Number((props.value * 100).toFixed(1))}%</b>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ToggleChip(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-pressed={props.checked}
      className={props.checked ? "toggle-chip active" : "toggle-chip"}
      onClick={() => props.onChange(!props.checked)}
    >
      {props.label}
      {props.checked && <Icons.CheckCircle2 />}
    </button>
  );
}

function outputName(photo: PhotoItem, format: "jpeg" | "png") {
  const base = photo.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "-");
  return base + "-时光印记." + (format === "png" ? "png" : "jpg");
}
