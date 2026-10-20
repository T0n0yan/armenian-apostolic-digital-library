/**
 * Prayers grouped by when and what for, so a reader finds the one they need. Groups come from
 * words (checked in this order, so «Գիշերային և առավոտյան ժամերգություններ» are hours) in the title and opening (classical and modern spelling alike); the rest are "Այլ".
 */
export type PrayerGroupId = "daily" | "morning" | "evening" | "hours" | "communion" | "others" | "more";

export const PRAYER_GROUPS: Array<{ id: PrayerGroupId; label: string; hint: string; words: RegExp }> = [
  { id: "daily", label: "Ամենօրյա", hint: "Հայր մեր, պահպանության, ճանապարհի, գործից առաջ", words: /ամենօր|պահպանութ|գործ\s*սկսել|ճանապարհ|եկեղեցի\s*մտնել|խ[օո]սքը\s*կարդալ|հայր\s*մեր/u },
  { id: "hours", label: "Ժամերգություններ", hint: "Ճաշու ժամեր և ժամերգություններ", words: /ժամերգութ|ճաշու|\d-րդ\s*ժամ/u },
  { id: "morning", label: "Առավոտյան", hint: "Առավոտյան մաղթանքներ", words: /առա[վւ][օո]տ/u },
  { id: "evening", label: "Երեկոյան և գիշերային", hint: "Երեկոյան և գիշերային մաղթանքներ", words: /երեկո|գիշերային/u },
  { id: "communion", label: "Հաղորդություն և ապաշխարություն", hint: "Մեղքերի թողության և Սբ. Հաղորդության", words: /հաղորդութ|մեղքերի|ապաշխար|խոստովան/u },
  { id: "others", label: "Մերձավորների համար", hint: "Ընտանիք, երեխաներ, ննջեցյալներ, թշնամիներ", words: /ընտանի|մանուկ|երեխա|ննջեց|թշնամի|հիվանդ|ծնող/u },
];

export const MORE_GROUP = { id: "more" as const, label: "Այլ աղոթքներ", hint: "" };

function fold(value: string) {
  return value.normalize("NFC").toLocaleLowerCase("hy").replaceAll("է", "ե").replace(/[​-‍﻿]/gu, "");
}

export function prayerGroupOf(material: { title: string; excerpt?: string | null }): PrayerGroupId {
  const title = fold(material.title);
  const opening = fold((material.excerpt ?? "").slice(0, 160));
  // The title decides first; the opening only when the title says nothing.
  for (const group of PRAYER_GROUPS) if (group.words.test(title)) return group.id;
  for (const group of PRAYER_GROUPS) if (group.words.test(opening)) return group.id;
  return "more";
}
