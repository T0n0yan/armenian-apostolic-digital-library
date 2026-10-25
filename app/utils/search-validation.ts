/** Shared input policy: meaningful text, or a psalm number in the psalms section. */
export function searchValidation(value: string, allowPsalmNumber = false): string | null {
  const query = value.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/gu, "").trim();
  if (allowPsalmNumber && /^\d{1,3}$/u.test(query) && Number(query) >= 1 && Number(query) <= 150) return null;
  if (/\p{L}/u.test(query) && Array.from(query).length >= 2 && query.length <= 120) return null;
  return allowPsalmNumber ? "Գրեք բառ կամ սաղմոսի համար՝ 1–150։" : "Գրեք առնվազն երկու նիշ պարունակող բառ կամ արտահայտություն։";
}
