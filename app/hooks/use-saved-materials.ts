import { useCallback, useMemo } from "react";
import { useFetcher } from "react-router";

export function useSavedMaterials(savedMaterialIds: string[]) {
  const fetcher = useFetcher<{ saved: boolean }>();
  const pendingMaterialId = fetcher.formData?.get("materialId");
  const pendingIntent = fetcher.formData?.get("intent");

  const savedIds = useMemo(() => {
    const result = new Set(savedMaterialIds);
    if (typeof pendingMaterialId === "string") {
      if (pendingIntent === "save") result.add(pendingMaterialId);
      if (pendingIntent === "remove") result.delete(pendingMaterialId);
    }
    return result;
  }, [pendingIntent, pendingMaterialId, savedMaterialIds]);

  const setSaved = useCallback(
    (materialId: string, saved: boolean) => {
      void fetcher.submit(
        { intent: saved ? "save" : "remove", materialId },
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
