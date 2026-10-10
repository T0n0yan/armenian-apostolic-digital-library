import { env } from "cloudflare:workers";
import { createRemoteJWKSet, jwtVerify } from "jose";

type AdminEnvironment = Env & {
  CF_ACCESS_AUD?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
};

const ADMIN_NAVIGATION_COOKIE = "library_admin_navigation";

export type AdminIdentity = {
  email: string;
  source: "cloudflare-access" | "local-development";
};

const jwksByIssuer = new Map<
  string,
  ReturnType<typeof createRemoteJWKSet>
>();

function isLocalDevelopmentRequest(request: Request) {
  if (!import.meta.env.DEV) {
    return false;
  }

  const { hostname } = new URL(request.url);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function getAccessConfiguration() {
  const { CF_ACCESS_AUD, CF_ACCESS_TEAM_DOMAIN } = env as AdminEnvironment;

  if (!CF_ACCESS_AUD || !CF_ACCESS_TEAM_DOMAIN) {
    return null;
  }

  try {
    const teamDomain = new URL(CF_ACCESS_TEAM_DOMAIN);
    const isCloudflareAccessDomain =
      teamDomain.protocol === "https:" &&
      teamDomain.hostname.endsWith(".cloudflareaccess.com") &&
      teamDomain.pathname === "/" &&
      !teamDomain.search &&
      !teamDomain.hash;

    if (!isCloudflareAccessDomain) {
      return null;
    }

    return {
      audience: CF_ACCESS_AUD,
      issuer: teamDomain.origin,
    };
  } catch {
    return null;
  }
}

function getJwks(issuer: string) {
  const cachedJwks = jwksByIssuer.get(issuer);

  if (cachedJwks) {
    return cachedJwks;
  }

  const jwks = createRemoteJWKSet(
    new URL("/cdn-cgi/access/certs", `${issuer}/`),
  );
  jwksByIssuer.set(issuer, jwks);
  return jwks;
}

export async function requireAdmin(request: Request): Promise<AdminIdentity> {
  if (isLocalDevelopmentRequest(request)) {
    return {
      email: "local-development",
      source: "local-development",
    };
  }

  const configuration = getAccessConfiguration();
  const token = request.headers.get("cf-access-jwt-assertion");

  if (!configuration || !token) {
    throw new Response("Admin access is not configured or authorized.", {
      status: 403,
      statusText: "Forbidden",
    });
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(configuration.issuer), {
      algorithms: ["RS256"],
      audience: configuration.audience,
      issuer: configuration.issuer,
    });

    if (payload.type !== "app" || typeof payload.email !== "string") {
      throw new Error("Cloudflare Access identity is missing.");
    }

    return {
      email: payload.email,
      source: "cloudflare-access",
    };
  } catch {
    throw new Response("Admin access token is invalid.", {
      status: 403,
      statusText: "Forbidden",
    });
  }
}

export function requireSameOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const submittedOrigin = request.headers.get("origin");

  if (submittedOrigin !== requestOrigin) {
    throw new Response("Cross-origin admin request is not allowed.", {
      status: 403,
      statusText: "Forbidden",
    });
  }
}

export function createAdminNavigationCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${ADMIN_NAVIGATION_COOKIE}=1; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${secure}`;
}

export function hasAdminNavigationCookie(request: Request) {
  const cookies = request.headers.get("cookie") ?? "";
  return cookies
    .split(";")
    .map((cookie) => cookie.trim())
    .some((cookie) => cookie === `${ADMIN_NAVIGATION_COOKIE}=1`);
}
