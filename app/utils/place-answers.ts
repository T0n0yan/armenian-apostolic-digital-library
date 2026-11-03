/** Answers about a place shared by the bot's /place and the site's form: the way in, and who serves. */
import { clergyName } from "./clergy-titles";
import { PLACE_CHOICES } from "./support-relay";

export const OTHER_ROLE = PLACE_CHOICES.clergy[PLACE_CHOICES.clergy.length - 1];

/**
 * Ճանապարհը և մուտքը՝ 4 առանձին հարց։ Ամեն պատասխան՝ իր տողով places.accessibility-ում,
 * օր.՝ «Մեքենայով հասանելիություն՝ այո, մինչև եկեղեցի»։ key-ը նաև բոտի քայլի անունն է։
 */
export const ACCESS_PARTS = [
  {
    key: "access", icon: "🚗", label: "Մեքենայով հասանելիություն",
    ask: "🚗 Մեքենայով կարելի՞ է հասնել մինչև եկեղեցի։",
    options: ["այո, մինչև եկեղեցի", "մասամբ, վերջին մասը՝ ոտքով", "ոչ, միայն ոտքով"],
  },
  {
    key: "road", icon: "🪨", label: "Ճանապարհ",
    ask: "🪨 Ինչպիսի՞ն է ճանապարհը եկեղեցու մոտ։",
    options: ["հարթ, ասֆալտապատ", "հողե, բայց հարթ", "քարքարոտ և անհարթ", "լեռնային արահետ"],
  },
  {
    key: "ramp", icon: "♿", label: "Թեքահարթակ",
    ask: "♿ Եկեղեցու մուտքի մոտ թեքահարթակ կա՞։",
    options: ["առկա է", "չկա"],
  },
  {
    key: "entrance", icon: "🚪", label: "Մուտք",
    ask: "🚪 Իսկ ինչպիսի՞ն է մուտքը. աստիճաններ կա՞ն։",
    options: ["առանց աստիճանի", "մեկ աստիճան, հնարավոր է օգնության անհրաժեշտություն", "մի քանի աստիճան", "շատ աստիճաններ"],
  },
] as const;
export type AccessKey = (typeof ACCESS_PARTS)[number]["key"];
export const ACCESS_KEYS = ACCESS_PARTS.map((part) => part.key) as AccessKey[];
export const ACCESS_HINT = "Ընտրեք տարբերակներից կամ նկարագրեք ինքներդ։";

const capital = (text: string) => text.charAt(0).toLocaleUpperCase("hy") + text.slice(1);
/** Կոճակի տեքստը՝ մեծատառով. «Այո, մինչև եկեղեցի»։ */
export const accessButton = (option: string) => capital(option);
export const ACCESS_BUTTONS = ACCESS_PARTS.flatMap((part) => part.options.map(accessButton));

/** Կոճակը՝ պատրաստի տարբերակ (փոքրատառով), ձեռքով գրածը՝ ինչպես կա։ */
export function accessValue(key: AccessKey, typed: string) {
  const part = ACCESS_PARTS.find((item) => item.key === key);
  return part?.options.find((option) => accessButton(option) === typed) ?? typed;
}

/** Մեկ պատասխանը փոխում է, մյուսները թողնում. տողերը միշտ նույն հերթականությամբ։ */
export function setAccessPart(current: string, key: AccessKey, value: string) {
  const answers = new Map(readAccess(current).flatMap((line) => (line.key ? [[line.key, line.value] as const] : [])));
  if (value) answers.set(key, value);
  else answers.delete(key);
  return ACCESS_PARTS.filter((part) => answers.has(part.key)).map((part) => `${part.label}՝ ${answers.get(part.key)}`).join("\n");
}

/** Հին տողեր (մինչև 2026-11-03)՝ «Ճանապարհը՝ …», «Մուտքը՝ …» և ազատ տեքստ։ */
const LEGACY: Array<[string, string]> = [["Ճանապարհը", "🛣"], ["Մուտքը", "🚪"]];

/** Ցուցադրման համար՝ ամեն տող իր նշանով և անունով։ key-ը null է հին կամ ազատ տողերի համար։ */
export function readAccess(text: string) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [label, ...rest] = line.split("՝ ");
    const part = ACCESS_PARTS.find((item) => item.label === label);
    if (part && rest.length) return { key: part.key as AccessKey | null, icon: part.icon, label: part.label, value: rest.join("՝ ") };
    const legacy = LEGACY.find(([name]) => name === label);
    if (legacy && rest.length) return { key: null, icon: legacy[1], label: legacy[0], value: rest.join("՝ ") };
    return { key: null, icon: "♿", label: "Ճանապարհը և մուտքը", value: line };
  });
}

/** «🚗 Մեքենայով հասանելիություն՝ այո, մինչև եկեղեցի» տողերը՝ բոտի հաղորդագրությունների համար։ */
export const accessText = (text: string) => readAccess(text).map((line) => `${line.icon} ${line.label}՝ ${line.value}`).join("\n");

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
