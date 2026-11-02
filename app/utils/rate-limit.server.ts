/**
 * Հարցումների արագության սահմանափակում (Cloudflare Rate Limiting binding)։ Մեկ IP-ի համար
 * որոշակի ժամանակում X հարցումից ավելին՝ 429։ Պաշտպանում է անանուն endpoint-ները չարաշահումից
 * (A-07, A-12)։ Եթե binding-ը դրված չէ (լոկալ dev), թույլ է տալիս՝ որ մշակումը չխանգարվի։
 */
export type RateLimiter = { limit: (options: { key: string }) => Promise<{ success: boolean }> };

export async function withinRateLimit(limiter: RateLimiter | undefined, key: string): Promise<boolean> {
  if (!limiter) return true; // Binding չկա (լոկալ) → չենք խանգարում։
  try { return (await limiter.limit({ key })).success; } catch { return true; } // Սխալի դեպքում՝ fail-open։
}

/** Հարցման աղբյուրի բանալին. IP + նպատակ (ամեն endpoint առանձին)։ */
export function rateKey(request: Request, scope: string): string {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
  return `${scope}:${ip}`;
}

const TOO_MANY = { "Retry-After": "60", "Cache-Control": "no-store" };
/** Պատրաստ 429 պատասխան։ */
export function tooMany() {
  return Response.json({ error: "Չափազանց շատ հարցումներ։ Փորձեք մի փոքր ուշ։" }, { status: 429, headers: TOO_MANY });
}
