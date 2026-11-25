import { Check, Plus } from "lucide-react";
import { useState } from "react";

import { fieldControl, fieldHint, fieldLabel } from "./ui-styles";
import { ACCESS_PARTS, accessButton, readAccess } from "../utils/place-answers";
import { appendLine, normalizeSlot, SCHEDULE_DAYS, SCHEDULE_PRESETS, scheduleLine, type ScheduleKind } from "../utils/place-schedule";

const textarea = `${fieldControl} min-h-[84px] resize-y leading-relaxed`;
const box = "grid gap-2.5 rounded-control border border-edge bg-subtle p-2.5";
const smallTitle = "text-[12px] font-semibold text-muted";

/** Կլոր ընտրության կոճակներ (ինչպես «Ավելացնել սրբավայր» ձևում)։ */
export function ChoiceChips({ options, selected, onToggle }: { options: readonly string[]; selected: readonly string[]; onToggle: (option: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const on = selected.includes(option);
        return (
          <button key={option} type="button" aria-pressed={on} onClick={() => onToggle(option)}
            className={`inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-full border px-3 text-[13px] font-semibold tabular-nums transition-colors ${on ? "border-[rgb(217_181_111/70%)] bg-[rgb(217_181_111/18%)] text-gold-bright" : "border-edge bg-subtle text-muted"}`}>
            {on ? <Check aria-hidden="true" size={13} strokeWidth={3} /> : null}{option}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Պատարագի, ժամերգությունների կամ բաց ժամերի դաշտ՝ ընտրիչով. օրը մեկ սեղմումով, ժամերը՝ մի քանիսը
 * միանգամից (կամ իր ժամը), «+ Ավելացնել»՝ պատրաստի տողը դաշտում։ Դաշտը մնում է ազատ խմբագրելի։
 */
export function ScheduleField({ name, label, kind, initial }: { name: string; label: string; kind: ScheduleKind; initial: string }) {
  const preset = SCHEDULE_PRESETS[kind];
  const [value, setValue] = useState(initial);
  const [day, setDay] = useState(preset.day);
  const [options, setOptions] = useState(preset.slots);
  const [slots, setSlots] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const line = scheduleLine(day, slots);
  const custom = normalizeSlot(preset.ranges ? `${from}–${to}` : from);
  const addCustom = () => {
    if (!custom) return;
    if (!options.includes(custom)) setOptions([...options, custom].sort());
    if (!slots.includes(custom)) setSlots([...slots, custom]);
    setFrom("");
    setTo("");
  };
  const add = () => {
    if (!slots.length && day !== "Տոն օրերին") return;
    setValue(appendLine(value, line));
    setSlots([]);
  };
  return (
    <div className={fieldLabel}>
      {label}
      <div className={box}>
        <span className={smallTitle}>Օրերը</span>
        <ChoiceChips options={SCHEDULE_DAYS} selected={[day]} onToggle={(option) => setDay(option === day ? "" : option)} />
        <span className={smallTitle}>Ժամերը (կարելի է մի քանիսը)</span>
        <ChoiceChips options={options} selected={slots} onToggle={(option) => setSlots(slots.includes(option) ? slots.filter((item) => item !== option) : [...slots, option])} />
        <div className={`grid items-center gap-1.5 ${preset.ranges ? "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"}`}>
          <input className={fieldControl} type="time" value={from} onChange={(event) => setFrom(event.target.value)} aria-label={preset.ranges ? "Սկիզբը" : "Այլ ժամ"} />
          {preset.ranges ? <><span aria-hidden="true" className="text-muted">–</span><input className={fieldControl} type="time" value={to} onChange={(event) => setTo(event.target.value)} aria-label="Ավարտը" /></> : null}
          <button type="button" onClick={addCustom} disabled={!custom} aria-label="Ավելացնել այս ժամը"
            className="grid size-10 cursor-pointer place-items-center rounded-full border border-edge bg-subtle text-gold-bright disabled:cursor-default disabled:opacity-40"><Plus aria-hidden="true" size={17} /></button>
        </div>
        {slots.length ? <span className="px-1 text-[12.5px] text-muted">Կավելանա՝ <strong className="text-ink">{line}</strong></span> : null}
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={add} disabled={!slots.length && day !== "Տոն օրերին"}
            className="min-h-10 flex-1 cursor-pointer rounded-control border border-[rgb(217_181_111/45%)] bg-[rgb(217_181_111/10%)] px-3 text-[13.5px] font-semibold text-gold-bright disabled:cursor-default disabled:opacity-50">+ Ավելացնել</button>
          {preset.quick.map((text) => (
            <button key={text} type="button" onClick={() => setValue(text)}
              className="min-h-10 cursor-pointer rounded-control border border-edge bg-subtle px-3 text-[13px] font-semibold text-muted">{text}</button>
          ))}
        </div>
      </div>
      <textarea className={textarea} name={name} value={value} onChange={(event) => setValue(event.target.value)} rows={2} />
      <span className={fieldHint}>Ամեն տողը՝ առանձին։ Կարելի է նաև ձեռքով ուղղել։</span>
    </div>
  );
}

/** Մեկ հարցի տողը փոխում է՝ մյուս (հին կամ ազատ) տողերը թողնելով տեղում։ */
function setAccessLine(current: string, label: string, answer: string) {
  const lines = current.split("\n").filter((line) => line.trim());
  const index = lines.findIndex((line) => line.trim().startsWith(`${label}՝`));
  const next = answer ? `${label}՝ ${answer}` : null;
  if (index >= 0) { if (next) lines[index] = next; else lines.splice(index, 1); }
  else if (next) lines.push(next);
  return lines.join("\n");
}

/** «Ճանապարհը և մուտքը»՝ 4 հարցի պատասխանները կոճակներով (ինչպես բոտում և ձևում)։ */
export function AccessField({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const answers = new Map(readAccess(value).flatMap((line) => (line.key ? [[line.key, line.value] as const] : [])));
  return (
    <div className={fieldLabel}>
      Ճանապարհը և մուտքը
      <div className={box}>
        {ACCESS_PARTS.map((part) => {
          const options = part.options.map(accessButton);
          const current = answers.get(part.key);
          const selected = options.filter((option) => option.toLocaleLowerCase("hy") === current?.toLocaleLowerCase("hy"));
          return (
            <div key={part.key} className="grid gap-1.5">
              <span className={smallTitle}>{part.icon} {part.label}</span>
              <ChoiceChips options={options} selected={selected} onToggle={(option) => {
                const index = options.indexOf(option);
                setValue(setAccessLine(value, part.label, selected.includes(option) ? "" : part.options[index]));
              }} />
            </div>
          );
        })}
      </div>
      <textarea className={textarea} name="accessibility" value={value} onChange={(event) => setValue(event.target.value)} rows={3} />
    </div>
  );
}
