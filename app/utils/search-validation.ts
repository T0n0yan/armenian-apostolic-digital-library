/** Shared input policy: meaningful text, or a psalm number in the psalms section. */
export function searchValidation(value: string, allowPsalmNumber = false): string | null {
  const query = value.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/gu, "").trim();
  if (allowPsalmNumber && /^\d{1,3}$/u.test(query) && Number(query) >= 1 && Number(query) <= 150) return null;
  // Mostly letters, with a word of two letters or more: «Սաղմոս 23», «Ղուկաս 4.31» pass, «2223ee» doesn't.
  const visible = Array.from(query.replace(/\s+/gu, ""));
  const letters = visible.filter((character) => /\p{L}/u.test(character)).length;
  if (/\p{L}{2,}/u.test(query) && letters * 2 >= visible.length && query.length <= 120) return null;
  return allowPsalmNumber ? "Գրեք բառ կամ սաղմոսի համար՝ 1–150։" : "Գրեք առնվազն երկու նիշ պարունակող բառ կամ արտահայտություն։";
}
