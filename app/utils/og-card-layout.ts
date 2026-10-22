/** The link-preview card's size (Open Graph's usual 1.91:1). */
export const OG_CARD_WIDTH = 1200;
export const OG_CARD_HEIGHT = 630;

/** At most `limit` characters, cut at a word, with "…" when shortened. */
export function excerpt(text: string, limit: number) {
  const clean = text.replace(/[​-‍﻿]/gu, "").replace(/\s+/gu, " ").trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit).replace(/\s+\S*$/u, "").replace(/[,;:։՝.\s]+$/u, "")}…`;
}

const comparable = (value: string) => value.replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLocaleLowerCase("hy");

type Node = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({ type, props: { style, children } });

/**
 * The card as Satori's element tree, on the site's parchment: the section and the material's name
 * in gold above, a short passage of its text, and the library's name below. A passage that starts
 * with the name does not repeat it.
 */
export function ogCardElement({ label, text, section }: { label: string; text: string; section: string }) {
  const title = excerpt(label, 64);
  let body = text.replace(/\s+/gu, " ").trim();
  const head = comparable(label);
  if (head && comparable(body).startsWith(head)) {
    // Drop as many leading words as the title has.
    const words = label.trim().split(/\s+/u).length;
    body = body.split(" ").slice(words).join(" ").replace(/^[\s,։:.;—–-]+/u, "");
  }
  const passage = excerpt(body || text, 170);
  const size = passage.length <= 80 ? 50 : passage.length <= 130 ? 42 : 36;
  return h("div", {
    width: "100%", height: "100%", display: "flex", padding: 34,
    backgroundColor: "#ead9b8",
    backgroundImage: "radial-gradient(circle at 50% -10%, rgba(255,246,222,0.85), rgba(255,246,222,0) 60%), radial-gradient(circle at 6% 45%, rgba(196,150,86,0.22), rgba(196,150,86,0) 420px), radial-gradient(circle at 96% 78%, rgba(176,128,70,0.2), rgba(176,128,70,0) 460px), linear-gradient(170deg, #f3e8cf 0%, #ead9b8 55%, #e6d3ae 100%)",
  }, h("div", {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", width: "100%", height: "100%",
    border: "2px solid rgba(176,125,46,0.55)", borderRadius: 26, padding: "38px 64px 30px",
  }, [
    h("div", { display: "flex", flexDirection: "column", alignItems: "center" }, [
      h("div", { fontSize: 22, letterSpacing: 3, color: "#8a5a1c", fontWeight: 400 }, section),
      h("div", { fontSize: title.length > 40 ? 32 : 40, color: "#a06d22", fontWeight: 600, marginTop: 6, textAlign: "center", maxWidth: 1000 }, title),
      h("div", { width: 220, height: 2, marginTop: 14, backgroundImage: "linear-gradient(90deg, rgba(176,125,46,0), #b07d2e, rgba(176,125,46,0))" }),
    ]),
    h("div", { display: "flex", fontSize: size, lineHeight: 1.45, color: "#3a2412", textAlign: "center", fontWeight: 400, maxWidth: 1000 }, `«${passage}»`),
    h("div", { fontSize: 22, color: "#7a5a3a", fontWeight: 400 }, "Հոգևոր ժառանգություն · apostolic.am"),
  ]));
}
