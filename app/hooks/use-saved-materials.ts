import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { clearNavigationCache } from "../utils/navigation-cache";
import { showNotice } from "../utils/notice";

export function useSavedMaterials(savedMaterialIds: string[]) {
  const fetcher = useFetcher<{ saved: boolean; error?: string }>();
  // Վերջին ուղարկվածը՝ սերվերի մերժման դեպքում նշանը հետ բերելու համար։
  const lastSent = useRef<{ materialId: string; saved: boolean } | null>(null);
  const pendingMaterialId = fetcher.formData?.get("materialId");
  const pendingIntent = fetcher.formData?.get("intent");
  // Saves made on this page. Pages answer revalidation from the navigation cache, so the loader's
  // list can stay stale after a save; these keep the bookmark showing what the reader chose.
  const [overrides, setOverrides] = useState<Map<string, boolean>>(() => new Map());

  // Drop an override once the loader's list agrees with it.
  useEffect(() => {
    setOverrides((current) => {
      if (current.size === 0) return current;
      const listed = new Set(savedMaterialIds);
      const next = new Map([...current].filter(([id, saved]) => listed.has(id) !== saved));
      return next.size === current.size ? current : next;
    });
  }, [savedMaterialIds]);

  // Սերվերը մերժեց (նյութը հեռացված է, սխալ հարցում) կամ պատասխանը չի համընկնում խնդրածին. նշանը
  // վերադառնում է նախկին վիճակին, և ընթերցողը տեղեկանում է։
  useEffect(() => {
    const sent = lastSent.current;
    if (fetcher.state !== "idle" || !sent || !fetcher.data) return;
    lastSent.current = null;
    if (!fetcher.data.error && fetcher.data.saved === sent.saved) return;
    setOverrides((current) => { const next = new Map(current); next.delete(sent.materialId); return next; });
    showNotice(fetcher.data.error === "material-unavailable" ? "Այս նյութն այլևս հասանելի չէ, չպահվեց։" : "Չհաջողվեց պահել։ Փորձեք նորից։");
  }, [fetcher.data, fetcher.state]);

  const savedIds = useMemo(() => {
    const result = new Set(savedMaterialIds);
    for (const [id, saved] of overrides) {
      if (saved) result.add(id);
      else result.delete(id);
    }
    if (typeof pendingMaterialId === "string") {
      if (pendingIntent === "save") result.add(pendingMaterialId);
      if (pendingIntent === "remove") result.delete(pendingMaterialId);
    }
    return result;
  }, [overrides, pendingIntent, pendingMaterialId, savedMaterialIds]);

  const setSaved = useCallback(
    (materialId: string, saved: boolean, personalNote = "") => {
      lastSent.current = { materialId, saved };
      setOverrides((current) => new Map(current).set(materialId, saved));
      clearNavigationCache();
      void fetcher.submit(
        {
          intent: saved ? "save" : "remove",
          materialId,
          personalNote,
        },
        { method: "post", action: "/saved" },
      );
    },
    [fetcher],
  );

  return {
    isSaving: fetcher.state !== "idle",
    pendingMaterialId:
      typeof pendingMaterialId === "string" ? pendingMaterialId : null,
    savedIds,
    setSaved,
  };
}
