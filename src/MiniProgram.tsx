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
            <span className="mp-desktop">微信扫一扫，打开小程序</span>
            <span className="mp-mobile">在微信里长按识别小程序码</span>
          </strong>
          <p>在微信里给照片印日期、拼成长拼图，发给家人更方便。</p>
        </div>
      )}
    </div>
  );
}

/** Full-width band under the steps: the mini program code with what it is good for. */
export function MiniProgramBand() {
  return (
    <section className="mp-band" aria-labelledby="mp-band-title">
      <img src={qrSrc} alt="时光印记微信小程序码" width={112} height={112} />
      <div className="mp-band-copy">
        <span className="mp-badge">微信小程序</span>
        <h2 id="mp-band-title">不想开电脑？微信里也能用</h2>
        <p>
          <span className="mp-desktop">微信扫一扫左边的小程序码，</span>
          <span className="mp-mobile">在微信里长按识别小程序码，</span>
          选照片、填日期，几秒印好，直接发给家人。
        </p>
      </div>
      <ul className="mp-band-points">
        <li>同样 10 款水印风格</li>
        <li>成长拼图、今年去年对比</li>
        <li>保存到相册或发给朋友</li>
      </ul>
    </section>
  );
}
