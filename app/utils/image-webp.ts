/** Նկարի երկար կողմի առավելագույնը (px). բավական է էկրանի և ամբողջ էկրանով դիտելու համար։ */
export const PHOTO_SIDE = 1920;

/**
 * Բրաուզերում նկարը դարձնում է թեթև WebP (առավելագույնը 1920 px, որակը 0.82)։ Ցանկացած ձևաչափ,
 * որ բրաուզերը կարող է բացել (JPEG, PNG, HEIC iPhone-ում, GIF, BMP…), դառնում է WebP։ Եթե բրաուզերը
 * WebP չի կարող գրել (հին Safari), JPEG է։ Եթե բացել չի կարող, վերադարձնում է բնօրինակը։
 */
export async function toWebp(file: Blob): Promise<Blob> {
  if (!file.type.startsWith("image/") && file.type !== "") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    const blob = webp?.type === "image/webp" ? webp : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return file;
    // Արդեն թեթև WebP-ն թողնում ենք ինչպես կա։
    return file.type === "image/webp" && blob.size >= file.size ? file : blob;
  } catch {
    return file;
  }
}

/** Ֆայլի անունը ըստ իր տեսակի (photo.webp / photo.jpg)։ */
export function photoName(blob: Blob) {
  return blob.type === "image/webp" ? "photo.webp" : blob.type === "image/png" ? "photo.png" : "photo.jpg";
}

/**
 * Տեղի հին (JPEG/PNG) նկարները մեկ առ մեկ դարձնում է WebP. բրաուզերը ներբեռնում է, փոխարկում և ետ
 * ուղարկում ադմինի էջին (intent=replace-photo)։ Worker-ը միայն պահում է. Worker-ում փոխարկելը
 * անվճար պլանի CPU սահմանից դուրս է։ Վերադարձնում է չհաջողվածների թիվը։
 */
export async function convertPlacePhotos(placeId: string, keys: string[], mediaUrl: (key: string) => string, onStep: (index: number) => void) {
  let failed = 0;
  for (const [index, key] of keys.entries()) {
    onStep(index);
    try {
      const original = await fetch(mediaUrl(key), { cache: "no-store" }).then((response) => response.ok ? response.blob() : Promise.reject(new Error("fetch")));
      const blob = await toWebp(original);
      if (blob === original) { failed++; continue; }
      const form = new FormData();
      form.set("intent", "replace-photo");
      form.set("key", key);
      form.set("photo", blob, photoName(blob));
      const response = await fetch(`/admin/places/${encodeURIComponent(placeId)}`, { method: "POST", body: form });
      if (!response.ok) failed++;
    } catch {
      failed++;
    }
  }
  return failed;
}

/** Արդեն WebP չդարձած նկարները։ */
export const oldPhotos = (photos: string[]) => photos.filter((key) => !key.endsWith(".webp"));
