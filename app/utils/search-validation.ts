/**
 * What a search must look like, with a short, plain reason when it doesn't: a word (mostly
 * letters), or a psalm's number where psalms are searched. null means the search may go ahead.
 */
export function searchValidation(value: string, allowPsalmNumber = false): string | null {
  const query = value.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/gu, "").trim();
  if (!/[\p{L}\p{N}]/u.test(query)) return "Գրեք, թե ինչ եք փնտրում։";
  if (/^\d+$/u.test(query)) {
    if (!allowPsalmNumber) return "Թվով կարելի է որոնել «Սաղմոսներ» բաժնում։";
    return Number(query) >= 1 && Number(query) <= 150 ? null : "Սաղմոսները համարակալված են 1-ից 150։";
  }
  if (query.length > 120) return "Որոնումը շատ երկար է։";
  // Mostly letters, with a word of two letters or more: «Սաղմոս 23», «Ղուկաս 4.31» pass, «2223ee» doesn't.
  const visible = Array.from(query.replace(/\s+/gu, ""));
  const letters = visible.filter((character) => /\p{L}/u.test(character)).length;
  if (!/\p{L}{2,}/u.test(query)) return "Ձեր հարցումը շատ կարճ է որոնում կատարելու համար։";
  if (letters * 2 < visible.length) return "Ստուգեք որոնվող բառը։";
  return null;
}
