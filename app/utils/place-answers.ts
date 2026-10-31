/** Answers about a place shared by the bot's /place and the site's form: the way in, and who serves. */
import { clergyName } from "./clergy-titles";
import { PLACE_CHOICES } from "./support-relay";

export const OTHER_ROLE = PLACE_CHOICES.clergy[PLACE_CHOICES.clergy.length - 1];

/** The way to the church and its entrance, each on its own line in places.accessibility. */
export const ROAD = "Ճանապարհը";
export const ENTRANCE = "Մուտքը";
export function setAccessPart(current: string, part: typeof ROAD | typeof ENTRANCE, value: string) {
  const lines = current.split("\n").filter((line) => line.startsWith(`${ROAD}՝ `) || line.startsWith(`${ENTRANCE}՝ `));
  const kept = lines.filter((line) => !line.startsWith(`${part}՝ `));
  return [...kept, `${part}՝ ${value}`].sort((a, b) => Number(a.startsWith(ENTRANCE)) - Number(b.startsWith(ENTRANCE))).join("\n");
}

/** «Քահանա՝ Տեր Ա, Տեր Բ»: one line per role, people of the same role on one line. */
export function addServant(current: string, role: string | null, typed: string) {
  const lines = current ? current.split("\n") : [];
  if (!role || role === OTHER_ROLE) return [...lines, typed].join("\n");
  // Written with the rank's address: «Արժանապատիվ Տ. Հովհաննես քհն. Աբրահամյան».
  const name = clergyName(role, typed);
  const index = lines.findIndex((line) => line.startsWith(`${role}՝ `));
  if (index >= 0) lines[index] = `${lines[index]}, ${name}`;
  else lines.push(`${role}՝ ${name}`);
  return lines.join("\n");
}

