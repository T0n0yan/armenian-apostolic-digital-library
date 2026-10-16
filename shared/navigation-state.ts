export function isPendingNavigation(
  state: "idle" | "loading" | "submitting",
  pendingPathname: string | undefined,
  targetPathname: string,
) {
  return state !== "idle" && pendingPathname === targetPathname;
}
