import { useEffect, useRef, useState } from "react";
import { Download, Share2, X } from "lucide-react";
import { canShareImage, downloadBlob, shareBlob } from "./services/export";

export function SavePhotoDialog({ photo, onClose }: {
  photo: { blob: Blob; filename: string };
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState("");
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");
  const supported = canShareImage(photo.blob, photo.filename);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo.blob);
    setUrl(objectUrl);
    const element = dialog.current;
    element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      URL.revokeObjectURL(objectUrl);
      document.body.style.overflow = previous;
    };
  }, [photo]);

  async function share() {
    setError("");
    setSharing(true);
    try {
      // Invoke sharing in the click handler, without rendering or other awaits first.
      const shared = await shareBlob(photo.blob, photo.filename);
      if (!shared) setError("请长按下方图片，选择存储到照片。");
    } catch (reason) {
      if (!(reason && typeof reason === "object" && "name" in reason && reason.name === "AbortError")) {
        setError("系统分享暂不可用，请长按图片保存。");
      }
    } finally {
      setSharing(false);
    }
  }

  return <dialog ref={dialog} className="save-photo-dialog" aria-labelledby="save-photo-title" onCancel={onClose}>
    <header><h2 id="save-photo-title">保存到相册</h2><button type="button" aria-label="关闭保存窗口" title="关闭" onClick={onClose}><X size={20} /></button></header>
    <p>{supported ? "打开系统分享后，选择「存储图像」。也可以长按下方图片保存。" : "长按下方图片，选择「存储到照片」或「存储图像」。"}</p>
    {url && <img src={url} alt="可长按保存的完整水印照片" />}
    {error && <p role="status">{error}</p>}
    <footer>
      {supported && <button type="button" className="primary-action" onClick={share} disabled={sharing}><Share2 size={18} />{sharing ? "系统分享已打开" : "打开系统分享"}</button>}
      <button type="button" onClick={() => downloadBlob(photo.blob, photo.filename)}><Download size={18} />下载到文件</button>
    </footer>
  </dialog>;
}
