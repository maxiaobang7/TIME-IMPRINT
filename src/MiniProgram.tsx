import { useEffect, useRef, useState } from "react";
import { QrCode, X } from "lucide-react";

const qrSrc = "/mp/qrcode.jpg";

/** Header button that opens the mini program code in a small popover. */
export function HeaderMiniProgram() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div className="header-mp" ref={root}>
      <button
        className={open ? "header-mp-button open" : "header-mp-button"}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="微信小程序"
        title="微信小程序"
        onClick={() => setOpen((value) => !value)}
      >
        <QrCode size={17} />
        <span>小程序</span>
      </button>
      {open && (
        <div className="header-mp-pop" role="dialog" aria-label="微信小程序码">
          <button className="header-mp-close" aria-label="关闭" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
          <img src={qrSrc} alt="时光印记微信小程序码" width={168} height={168} />
          <strong>
            <span className="mp-card-desktop">微信扫一扫，打开小程序</span>
            <span className="mp-card-mobile">在微信里长按识别小程序码</span>
          </strong>
          <p>在微信里给照片印日期、拼成长拼图，发给家人更方便。</p>
        </div>
      )}
    </div>
  );
}

/** First-screen card: the mini program code with a short reason to use it. */
export function MiniProgramCard() {
  return (
    <aside className="mp-card" aria-label="微信小程序">
      <img src={qrSrc} alt="时光印记微信小程序码" width={96} height={96} />
      <div>
        <span className="mp-card-badge">微信小程序</span>
        <strong>在微信里也能用</strong>
        <p>
          <span className="mp-card-desktop">微信扫码打开，</span>
          <span className="mp-card-mobile">在微信里长按识别，</span>
          照片在手机上完成，还能做成长拼图。
        </p>
      </div>
    </aside>
  );
}
