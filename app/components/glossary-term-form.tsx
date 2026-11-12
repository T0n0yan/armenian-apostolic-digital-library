import { Check, Plus, X } from "lucide-react";
import { Form, useNavigation, type FetcherWithComponents } from "react-router";

import { GLOSSARY_KINDS, type GlossaryKind, type GlossaryTerm } from "../utils/glossary";
import { fieldControl, fieldHint, primaryButton } from "./ui-styles";

/** Մեկ բառի ձևը՝ և՛ նորի, և՛ փոփոխության համար։ */
export function TermForm({ term, error, onDone, kind, word, fetcher }: {
  term?: GlossaryTerm; error?: string; onDone?: () => void; kind?: GlossaryKind;
  /** Տեքստից ավելացնելիս՝ սեղմած բառը։ */
  word?: string;
  /** Տեքստից ավելացնելիս ձևը ուղարկվում է fetcher-ով, էջը չի փոխվում։ */
  fetcher?: FetcherWithComponents<unknown>;
}) {
  const navigating = useNavigation().state === "submitting";
  const busy = fetcher ? fetcher.state !== "idle" : navigating;
  const FormTag = fetcher ? fetcher.Form : Form;
  return (
    <FormTag method="post" action={fetcher ? "/admin/glossary" : undefined} preventScrollReset className="grid gap-2.5" onSubmit={() => { if (!fetcher) onDone?.(); }}>
      {fetcher ? <input type="hidden" name="stay" value="1" /> : null}
      {term ? <input type="hidden" name="id" value={term.id} /> : null}
      <label className="grid gap-1 text-[13px] font-semibold text-ink">Բաժինը
        <select className={fieldControl} name="kind" defaultValue={term?.kind ?? kind ?? "word"}>
          {Object.entries(GLOSSARY_KINDS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <div className="grid gap-2.5 min-[620px]:grid-cols-2">
        <label className="grid gap-1 text-[13px] font-semibold text-ink">Բառը<input className={fieldControl} name="word" defaultValue={term?.word ?? word} required maxLength={60} placeholder="Օր.՝ ամբարիշտ" /></label>
        <label className="grid gap-1 text-[13px] font-semibold text-ink">Այլ ձևեր (ստորակետով)<input className={fieldControl} name="forms" defaultValue={term?.forms.join(", ")} maxLength={600} placeholder="Օր.՝ ամբարշտաց, ամբարշտութիւն" /></label>
      </div>
      <p className={fieldHint}>Վերջավորությունները (-ը, -ի, -ների…) և դասական ուղղագրությունը («է», «իւ») ինքնաբերաբար են գտնվում։ Այլ ձևերում գրեք միայն այն, ինչ արմատից տարբեր է։</p>
      <label className="grid gap-1 text-[13px] font-semibold text-ink">Բացատրությունը<textarea className={`${fieldControl} min-h-[70px] resize-y`} name="meaning" defaultValue={term?.meaning} required maxLength={600} /></label>
      <label className="grid gap-1 text-[13px] font-semibold text-ink">Նշում (ոչ պարտադիր)<input className={fieldControl} name="note" defaultValue={term?.note} maxLength={600} placeholder="Ծագումը, օրինակ, աղբյուրը" /></label>
      <label className="flex items-center gap-2 text-[13.5px] text-ink"><input type="checkbox" name="verified" defaultChecked={term?.verified} /> Ստուգված է հոգևորականի կողմից (առանց սրա՝ «⚑ Ճշտել»)</label>
      {error ? <p className="m-0 text-[13px] font-semibold text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button className={primaryButton} type="submit" disabled={busy}>{term ? <Check aria-hidden="true" size={16} /> : <Plus aria-hidden="true" size={16} />} {term ? "Պահել" : "Ավելացնել"}</button>
        {onDone ? <button className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-button border border-glass-border bg-transparent px-3 text-[13px] text-muted" type="button" onClick={onDone}><X aria-hidden="true" size={15} /> Չեղարկել</button> : null}
      </div>
    </FormTag>
  );
}
