import { env } from "cloudflare:workers";

const STATE_COOKIE = "library_google_oauth";
const STATE_SECONDS = 600;

type GoogleEnv = { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string };

export function googleConfig() {
  const values = env as unknown as GoogleEnv;
  const clientId = values.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = values.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function randomToken() {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function redirectUri(request: Request) {
  return `${new URL(request.url).origin}/auth/google/callback`;
}

/** Only paths on this site, so the return address can't send the reader elsewhere. */
export function safeReturnPath(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/saved";
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

function stateCookie(request: Request, value: string, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${STATE_COOKIE}=${value}; Path=/auth/google; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

/** Starts Google sign-in (authorization code flow with PKCE). */
export async function startGoogleSignIn(request: Request, returnTo: string) {
  const config = googleConfig();
  if (!config) return null;
  const state = randomToken();
  const verifier = randomToken();
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  const cookieValue = encodeURIComponent(JSON.stringify({ state, verifier, returnTo }));
  return { location: url.toString(), cookie: stateCookie(request, cookieValue, STATE_SECONDS) };
}

export type GoogleProfile = { sub: string; email: string | null; name: string };

/** Finishes Google sign-in: checks the state, exchanges the code and reads the account. */
export async function finishGoogleSignIn(request: Request) {
  const config = googleConfig();
  const url = new URL(request.url);
  const raw = readCookie(request, STATE_COOKIE);
  const clearState = stateCookie(request, "", 0);
  let saved: { state?: string; verifier?: string; returnTo?: string } = {};
  try { saved = raw ? JSON.parse(decodeURIComponent(raw)) : {}; } catch { saved = {}; }
  const code = url.searchParams.get("code");
  if (!config || !code || !saved.state || saved.state !== url.searchParams.get("state") || !saved.verifier) {
    return { profile: null, returnTo: safeReturnPath(saved.returnTo ?? null), clearState };
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri(request),
      grant_type: "authorization_code",
      code_verifier: saved.verifier,
    }),
  }).catch(() => null);
  const tokens = (await response?.json().catch(() => null)) as { id_token?: string } | null;
  // The ID token comes straight from Google's token endpoint over TLS, so its claims can be read
  // without verifying the signature (Google's guidance); the audience and expiry are still checked.
  const claims = (() => {
    try {
      const part = tokens?.id_token?.split(".")[1];
      if (!part) return null;
      const base64 = part.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    } catch { return null; }
  })();
  const valid = claims && claims.aud === config.clientId
    && (claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com")
    && typeof claims.exp === "number" && claims.exp * 1000 > Date.now() && typeof claims.sub === "string";
  const profile: GoogleProfile | null = valid ? {
    sub: claims.sub as string,
    email: typeof claims.email === "string" ? claims.email : null,
    name: (typeof claims.name === "string" && claims.name.trim()) || (typeof claims.email === "string" ? claims.email.split("@")[0] : "Google"),
  } : null;
  return { profile, returnTo: safeReturnPath(saved.returnTo ?? null), clearState };
}
