import { Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { useRevalidator } from "react-router";
import { uploadFile } from "../utils/upload-file";

const small = "inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-full border border-edge bg-subtle px-3 text-[12.5px] font-bold text-ink";

/** Ձայնագրության վերբեռնում/ջնջում (/admin/church-audio/:id)։ */
export function ChurchAudioUpload({ id, audio }: { id: string; audio: { url: string; size: number } | null }) {
  const { revalidate } = useRevalidator();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(""); setProgress(0);
    try { await uploadFile(`/admin/church-audio/${id}`, file, setProgress); revalidate(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Չհաջողվեց"); }
    finally { setProgress(null); }
  };
  const remove = async () => {
    if (!confirm("Ջնջե՞լ ձայնագրությունը")) return;
    await fetch(`/admin/church-audio/${id}`, { method: "DELETE" });
    revalidate();
  };
  return (
    <div className="grid gap-2">
      {audio ? <audio className="w-full" src={audio.url} controls preload="none" /> : <p className="m-0 text-[13px] text-muted">Ձայնագրություն դեռ չկա։</p>}
      <div className="flex flex-wrap items-center gap-2">
        <label className={small}>
          <Upload aria-hidden="true" size={14} />{progress !== null ? `${progress}%` : audio ? "Փոխել" : "Վերբեռնել"}
          <input className="sr-only" type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,.mp3,.m4a,.ogg" disabled={progress !== null} onChange={(event) => void choose(event.target.files?.[0])} />
        </label>
        {audio ? <button type="button" className={small} onClick={() => void remove()}><Trash2 aria-hidden="true" size={14} />Ջնջել</button> : null}
        {audio ? <span className="text-[12px] text-muted">{(audio.size / 1_000_000).toFixed(1)} ՄԲ</span> : null}
        <span className="text-[12px] text-muted">MP3, M4A կամ OGG, մինչև 95 ՄԲ</span>
      </div>
      {error ? <p className="m-0 text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}
