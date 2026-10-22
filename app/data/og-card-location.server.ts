/**
 * Satori's layout engine reads `self.location.href` when its module loads, and Workers have no
 * `location`. Imported before satori, this sets a placeholder that og-card.server.ts removes again
 * once satori has loaded.
 */
const scope = globalThis as { location?: unknown };
export const locationPlaceholder = scope.location === undefined;
if (locationPlaceholder) Object.defineProperty(globalThis, "location", { value: { href: "https://worker.invalid/" }, configurable: true, writable: true });
