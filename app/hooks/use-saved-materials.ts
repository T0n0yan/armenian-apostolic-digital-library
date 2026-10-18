import { useCallback, useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";

import { clearNavigationCache } from "../utils/navigation-cache";

export function useSavedMaterials(savedMaterialIds: string[]) {
  const fetcher = useFetcher<{ saved: boolean }>();
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
