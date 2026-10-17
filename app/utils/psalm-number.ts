type PsalmSource = {
  title: string;
  excerpt?: string | null;
  preview: { mediaTitle: string | null };
};

const psalmPattern = /սաղմոս\S*\s*(\d{1,3})/iu;

/** Psalm number from the audio title ("Սաղմոս 41"), the title, or the text ("(Սաղմոս 41)"). */
export function psalmNumber(material: PsalmSource): number | null {
  for (const value of [material.preview.mediaTitle, material.title, material.excerpt]) {
    const match = value ? psalmPattern.exec(value.normalize("NFC")) : null;
    const number = match ? Number(match[1]) : NaN;
    if (Number.isSafeInteger(number) && number >= 1 && number <= 151) return number;
  }
  return null;
}
