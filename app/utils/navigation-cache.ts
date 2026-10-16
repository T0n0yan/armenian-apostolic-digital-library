const MAX_ENTRIES = 12;
const MAX_AGE_MS = 5 * 60_000;

type CacheEntry = {
  data: unknown;
  expiresAt: number;
};

const entries = new Map<string, CacheEntry>();
let activeScope = "guest";

function canonicalUrl(value: string | URL) {
  const url = typeof value === "string" ? new URL(value, "https://navigation.local") : value;
  return `${url.pathname}${url.search}`;
}

function cacheKey(namespace: string, value: string | URL) {
  return `${activeScope}|${namespace}|${canonicalUrl(value)}`;
}

function prune() {
  const now = Date.now();
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(key);
  }
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value as string | undefined;
    if (!oldest) break;
    entries.delete(oldest);
  }
}

export function setNavigationCacheScope(scope: string) {
  const nextScope = scope.trim() || "guest";
  if (nextScope === activeScope) return;
  activeScope = nextScope;
  entries.clear();
}

export function readNavigationCache<T>(namespace: string, value: string | URL) {
  prune();
  const key = cacheKey(namespace, value);
  const entry = entries.get(key);
  if (!entry) return null;
  entries.delete(key);
  entries.set(key, entry);
  return entry.data as T;
}

export function writeNavigationCache<T>(namespace: string, value: string | URL, scope: string, data: T) {
  setNavigationCacheScope(scope);
  const key = cacheKey(namespace, value);
  entries.delete(key);
  entries.set(key, { data, expiresAt: Date.now() + MAX_AGE_MS });
  prune();
}

export async function loadNavigationData<T extends { navigationCacheScope: string }>(
  namespace: string,
  value: string | URL,
  serverLoader: () => Promise<T>,
) {
  const cached = readNavigationCache<T>(namespace, value);
  if (cached) return cached;
  const data = await serverLoader();
  writeNavigationCache(namespace, value, data.navigationCacheScope, data);
  return data;
}

export function clearNavigationCache() {
  entries.clear();
}

export const navigationCachePolicy = {
  maximumEntries: MAX_ENTRIES,
  maximumAgeMs: MAX_AGE_MS,
} as const;
