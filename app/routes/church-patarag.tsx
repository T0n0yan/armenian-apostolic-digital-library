import { env } from "cloudflare:workers";
import { Minus, Pencil, Plus, Sun } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/church-patarag";
import { can, getOptionalTelegramAdmin } from "../auth/admin.server";
import { card, groupTitle } from "../components/etiquette-ui";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { CHURCH_TITLE } from "../data/church";
import { getChurchAudio, listLiturgyLines } from "../data/liturgy-text.server";
import { groupByPart, isPeople, lineAt, SPEAKERS } from "../utils/liturgy-text";
import { breadcrumbJsonLd, seoMeta } from "../utils/seo";

const TITLE = "Պատարագամատույց";

export function meta({}: Route.MetaArgs) {
  return seoMeta({
    title: `${TITLE}. ${CHURCH_TITLE} — Apostolic.am`,
    description: "Սուրբ Պատարագի տեքստը՝ գրաբար և աշխարհաբար, ժողովրդի պատասխանները ընդգծված, երգչախմբի ձայնագրությամբ։",
    path: "/church/patarag",
    jsonLd: [breadcrumbJsonLd([{ name: "Գլխավոր", path: "/" }, { name: CHURCH_TITLE, path: "/church" }, { name: TITLE, path: "/church/patarag" }])],
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const [lines, audio, admin] = await Promise.all([listLiturgyLines(env.DB), getChurchAudio(env.DB, "patarag"), getOptionalTelegramAdmin(request, env.DB).catch(() => null)]);
  return { lines, audio, editor: can(admin, "guides") };
}

type TextMode = "grabar" | "ashkharhabar" | "both";
const MODES: Array<[TextMode, string]> = [["grabar", "Գրաբար"], ["ashkharhabar", "Աշխարհաբար"], ["both", "Երկուսը"]];
const SIZES = [16, 18, 20, 23, 26];
const segment = "min-h-10 flex-1 cursor-pointer rounded-button border-0 bg-transparent px-2 text-[13.5px] font-semibold text-muted";
const segmentOn = "bg-[rgb(217_181_111/18%)] text-ink shadow-[inset_0_0_0_1px_rgb(217_181_111/45%)]";
const roundButton = "grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-edge bg-subtle text-ink disabled:opacity-40";

function readPreference<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}
function writePreference(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* մասնավոր պատուհան */ }
}

/** Էկրանը չի մարում (Screen Wake Lock), քանի դեռ միացված է և էջը բաց է։ */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let active = true;
    const request = () => navigator.wakeLock.request("screen").then((sentinel) => { if (active) lock = sentinel; else void sentinel.release(); }).catch(() => null);
    const again = () => { if (document.visibilityState === "visible") void request(); };
    void request();
    document.addEventListener("visibilitychange", again);
    return () => { active = false; document.removeEventListener("visibilitychange", again); void lock?.release(); };
  }, [on]);
}

/** Սուրբ Պատարագ՝ հետևելու համար. ինքնուրույն (մեծ տառ, ժողովրդի պատասխանները) կամ ձայնագրությամբ տող առ տող։ */
export default function ChurchPatarag({ loaderData }: Route.ComponentProps) {
  const { lines, audio, editor } = loaderData;
  const [mode, setMode] = useState<TextMode>("both");
  const [size, setSize] = useState(1);
  const [awake, setAwake] = useState(false);
  const [active, setActive] = useState(-1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lineRefs = useRef<Array<HTMLLIElement | null>>([]);
  const groups = useMemo(() => groupByPart(lines), [lines]);
  const timed = audio && lines.some((line) => line.start !== null);

  useEffect(() => {
    setMode(readPreference<TextMode>("patarag-mode", "both"));
    setSize(readPreference("patarag-size", 1));
  }, []);
  useWakeLock(awake);

  const onTime = () => {
    const element = audioRef.current;
    if (!element || !timed) return;
    const index = lineAt(lines, element.currentTime);
    if (index === active) return;
    setActive(index);
    lineRefs.current[index]?.scrollIntoView({ block: "center" });
  };
  const seek = (index: number) => {
    const start = lines[index].start;
    const element = audioRef.current;
    if (!element || start === null) return;
    element.currentTime = start;
    void element.play().catch(() => null);
  };
  const choose = (next: TextMode) => { setMode(next); writePreference("patarag-mode", next); };
  const resize = (step: number) => { const next = Math.max(0, Math.min(SIZES.length - 1, size + step)); setSize(next); writePreference("patarag-size", next); };

  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/church" backLabel={CHURCH_TITLE} title="" showSearch={false} />
      <header className="mt-2 grid gap-1.5 px-1">
        <h1 className="m-0 font-noto text-[28px] leading-[36px] font-semibold tracking-[-0.3px] text-ink min-[560px]:text-[34px] min-[560px]:leading-[42px]">{TITLE}</h1>
        <p className="m-0 text-[14.5px] leading-[1.6] text-muted">Ժողովրդի պատասխաններն ընդգծված են ոսկեգույնով։ {timed ? "Սեղմեք տողի վրա՝ ձայնագրությունը այնտեղից լսելու համար։" : ""}</p>
        {editor ? <Link className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-gold-bright" to="/admin/patarag"><Pencil aria-hidden="true" size={13} />Խմբագրել</Link> : null}
      </header>

      <div className="paper-sheet sticky top-2 z-10 mt-4 grid gap-1.5 rounded-card p-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[240px] flex-1 gap-1" role="group" aria-label="Լեզու">
            {MODES.map(([value, label]) => <button key={value} type="button" className={`${segment} ${mode === value ? segmentOn : ""}`} aria-pressed={mode === value} onClick={() => choose(value)}>{label}</button>)}
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" className={roundButton} onClick={() => resize(-1)} disabled={size === 0} aria-label="Փոքրացնել տառը"><Minus aria-hidden="true" size={16} /></button>
            <button type="button" className={roundButton} onClick={() => resize(1)} disabled={size === SIZES.length - 1} aria-label="Մեծացնել տառը"><Plus aria-hidden="true" size={16} /></button>
            <button type="button" className={`${roundButton} ${awake ? "!border-[rgb(217_181_111/60%)] text-gold-bright" : ""}`} onClick={() => setAwake((value) => !value)} aria-pressed={awake} aria-label="Էկրանը չմարի" title="Էկրանը չմարի"><Sun aria-hidden="true" size={16} /></button>
          </div>
        </div>
        {audio ? <audio ref={audioRef} className="h-10 w-full" src={audio.url} controls preload="none" onTimeUpdate={onTime} /> : null}
      </div>

      {!lines.length ? <p className={`${card} mt-6 px-4 py-4 text-[14px]`}>Տեքստը դեռ մուտքագրված չէ։</p> : null}
      {groups.map((group) => (
        <section key={`${group.part}-${group.lines[0].index}`} className="mt-6 grid gap-2">
          {group.part ? <h2 className={groupTitle}>{group.part}</h2> : null}
          <ol className={`${card} m-0 list-none overflow-hidden p-0`}>
            {group.lines.map((line) => {
              const people = isPeople(line.speaker);
              return (
                <li key={line.id} ref={(element) => { lineRefs.current[line.index] = element; }}
                  className={`grid gap-1.5 border-l-[3px] px-4 py-3 ${line.index === active ? "border-l-[var(--color-gold)] bg-[rgb(217_181_111/14%)]" : people ? "border-l-[rgb(217_181_111/70%)] bg-[rgb(217_181_111/8%)]" : "border-l-transparent"} ${timed && line.start !== null ? "cursor-pointer" : ""}`}
                  onClick={timed ? () => seek(line.index) : undefined}>
                  {line.rubric ? <p className="m-0 text-[13px] leading-snug text-muted italic">{line.rubric}</p> : null}
                  <span className={`text-[11px] font-bold tracking-[1.2px] uppercase ${people ? "text-gold-bright" : "text-gold"}`}>{SPEAKERS[line.speaker]}</span>
                  {mode !== "ashkharhabar" && line.grabar ? <p className={`prayer-text m-0 whitespace-pre-line leading-[1.6] text-ink ${people ? "font-semibold" : ""}`} style={{ fontSize: SIZES[size] }}>{line.grabar}</p> : null}
                  {mode !== "grabar" && line.ashkharhabar ? <p className={`reading-body m-0 whitespace-pre-line leading-[1.6] ${mode === "both" ? "text-muted" : "text-ink"} ${people && mode === "ashkharhabar" ? "font-semibold" : ""}`} style={{ fontSize: SIZES[size] - (mode === "both" ? 2 : 0) }}>{line.ashkharhabar}</p> : null}
                  {line.note ? <p className="m-0 rounded-button bg-subtle px-3 py-2 text-[13px] leading-snug text-muted">{line.note}</p> : null}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      <p className="mx-auto mt-7 mb-0 max-w-[560px] text-center text-[12.5px] leading-relaxed text-muted">⚑ Ճշտել. տեքստը ստուգվում է քահանայի կողմից։ Ինչ է կատարվում Պատարագին՝ <Link className="text-gold-bright" to="/church/liturgy">Սուրբ Պատարագ</Link>։</p>
    </PageShell>
  );
}
