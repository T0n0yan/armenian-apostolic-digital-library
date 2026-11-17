import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { Pause, Play, RotateCcw, X } from "lucide-react";
import { closeAudioDock, getAudioDock, subscribeAudioDock } from "../utils/audio-dock";

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Ձայնագրության կառավարման գոտին էկրանի ներքևում, երբ մարդը դուրս է եկել նյութի էջից (utils/audio-dock.ts)։ */
export function AudioDockBar() {
  const docked = useSyncExternalStore(subscribeAudioDock, getAudioDock, () => null);
  const audio = docked?.audio ?? null;
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!audio) return;
    const sync = () => {
      setPlaying(!audio.paused);
      setTime(audio.currentTime);
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    sync();
    const events = ["play", "pause", "timeupdate", "durationchange", "seeked"];
    events.forEach((type) => audio.addEventListener(type, sync));
    document.body.dataset.audioDock = "";
    return () => {
      events.forEach((type) => audio.removeEventListener(type, sync));
      delete document.body.dataset.audioDock;
    };
  }, [audio]);

  if (!docked || !audio) return null;
  const progress = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
  return (
    <div className="audio-dock" role="region" aria-label="Լսում եք">
      <span className="now-bars" data-paused={playing ? undefined : ""} aria-hidden="true"><i /><i /><i /></span>
      <Link className="audio-dock-title" to={docked.href} aria-label={`Բացել՝ ${docked.title}`}>
        <small>{playing ? "Լսում եք" : "Կանգնած է"}</small>
        <strong>{docked.title}</strong>
      </Link>
      <span className="audio-dock-time" aria-hidden="true">{clock(time)}</span>
      <button type="button" className="audio-dock-button" aria-label="15 վայրկյան հետ" onClick={() => { audio.currentTime = Math.max(0, audio.currentTime - 15); }}>
        <RotateCcw size={18} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <button type="button" className="audio-dock-button audio-dock-main" aria-label={playing ? "Կանգնեցնել" : "Շարունակել"} onClick={() => { if (audio.paused) void audio.play().catch(() => {}); else audio.pause(); }}>
        {playing ? <Pause size={20} strokeWidth={2} aria-hidden="true" /> : <Play size={20} strokeWidth={2} aria-hidden="true" />}
      </button>
      <button type="button" className="audio-dock-button" aria-label="Փակել" onClick={closeAudioDock}>
        <X size={18} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <span className="audio-dock-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></span>
    </div>
  );
}
