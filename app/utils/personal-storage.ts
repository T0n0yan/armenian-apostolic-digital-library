/**
 * Այս սարքում պահված անձնական տվյալներ (localStorage/sessionStorage). մաքրվում են ելքի ժամանակ և
 * երբ մարդն այլևս մուտք գործած չէ, որ ոչինչ չմնա ուրիշի համար։ Կարգավորումները (թեմա, տառաչափ) մնում են։
 */
const PERSONAL_LOCAL = ["last-places", "my-emojis", "church-nudge", "church-nudge-day", "corner-tab"];
const PERSONAL_SESSION = ["pending-highlight"];

/** `session: false`՝ մուտք չգործած այցելուի համար. մուտքից առաջ ընտրված նշումը պետք է հասնի մուտքից հետո։ */
export function clearPersonalStorage({ session = true }: { session?: boolean } = {}) {
  try { for (const key of PERSONAL_LOCAL) localStorage.removeItem(key); } catch { /* պահեստը փակ է */ }
  if (session) try { for (const key of PERSONAL_SESSION) sessionStorage.removeItem(key); } catch { /* պահեստը փակ է */ }
}
