import { Download, Image as ImageIcon, Link2 } from "lucide-react";
import { useEffect, useState } from "react";

import { drawStoryImage, type StoryContent } from "../utils/story-image";
import { BottomSheet } from "./bottom-sheet";
import { systemShare } from "./share-button";

/** Ֆայլի անունը՝ հասցեից (/psalms/22/3 → apostolic-psalms-22-3.png)։ */
function fileName(url: string) {
  const path = new URL(url, "https://apostolic.am").pathname.replace(/[^a-z0-9]+/giu, "-").replace(/^-|-$/gu, "");
  return `apostolic-${path || "home"}.png`;
}

function download(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/**
 * Կիսվելու պատուհան. վերևում նյութի ուղղահայաց նկարը (9:16), տակը՝ «Նկարով» (հեռախոսի կիսվելու
 * պատուհանով, նկարը՝ ֆայլ), «Պահել նկարը» և «Հղումով»։ Որտեղ ֆայլով կիսվել հնարավոր չէ
 * (համակարգիչ, որոշ Telegram WebView-եր), նկարը ներբեռնվում է, իսկ նախադիտումը սեղմած պահելով էլ է պահվում։
 */
export function StoryShareSheet({ open, onClose, content, url, onLink }: {
  open: boolean;
  onClose: () => void;
  content: StoryContent;
  /** Նյութի լրիվ հասցեն։ */
  url: string;
  /** «Հղումով» կոճակը. սովորական կիսվելը։ */
  onLink: () => void;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let href: string | null = null;
    setBlob(null); setPreview(null); setFailed(false); setNotice(null);
    drawStoryImage(content).then((image) => {
      if (cancelled) return;
      href = URL.createObjectURL(image);
      setBlob(image);
      setPreview(href);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (href) URL.revokeObjectURL(href); };
  }, [open, content.section, content.title, content.text, content.quoted]);

  const name = fileName(url);
  const shareImage = async () => {
    if (!blob) return;
    const file = new File([blob], name, { type: "image/png" });
    // Միայն ֆայլը. Instagram-ը տեքստով ֆայլ չի ընդունում, իսկ հասցեն արդեն նկարի ներքևում է։
    if (await systemShare({ files: [file] })) { onClose(); return; }
    download(blob, name);
    setNotice("Նկարը պահվեց");
  };
  const save = () => {
    if (!blob) return;
    download(blob, name);
    setNotice("Նկարը պահվեց. եթե չերևա, սեղմած պահեք նկարի վրա");
  };

  const button = "inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[14px] px-3 font-sans text-[14px] font-bold disabled:opacity-60";
  return (
    <BottomSheet open={open} onClose={onClose} label="Կիսվել" className="gap-3 p-4">
      <div className="mx-auto aspect-[9/16] h-[min(52svh,420px)] overflow-hidden rounded-[14px] border border-[rgb(217_181_111/45%)] bg-[#ead9b8] shadow-card">
        {preview
          ? <img className="block size-full" src={preview} alt={content.title} />
          : <div className="grid size-full place-items-center px-4 text-center font-sans text-[12px] text-[#7a5a3a]">{failed ? "Նկարը չստացվեց" : "Նկարվում է…"}</div>}
      </div>
      <button className={`${button} border-0 bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[#2a1708]`} type="button" disabled={!blob} onClick={shareImage}>
        <ImageIcon aria-hidden="true" size={18} /> Կիսվել նկարով
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button className={`${button} border border-glass-border bg-subtle text-ink`} type="button" disabled={!blob} onClick={save}>
          <Download aria-hidden="true" size={17} /> Պահել նկարը
        </button>
        <button className={`${button} border border-glass-border bg-subtle text-ink`} type="button" onClick={() => { onClose(); onLink(); }}>
          <Link2 aria-hidden="true" size={17} /> Հղումով
        </button>
      </div>
      {notice ? <p className="m-0 text-center font-sans text-[12px] font-bold text-gold-bright" role="status">{notice}</p> : null}
    </BottomSheet>
  );
}
