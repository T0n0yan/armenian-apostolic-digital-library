export function normalizeContentText(value: string) {
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeSearchText(value: string) {
  return normalizeContentText(value)
    .replace(/[՚-՟]/gu, "")
    .replace(/[։֍֎.,!?;:()[\]{}"'«»—–-]+/gu, " ")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("hy-AM")
    .replace(/եւ/gu, "և")
    .trim();
}
