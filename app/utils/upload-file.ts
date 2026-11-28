/** Ֆայլը ուղարկվում է որպես հարցման մարմին (XHR՝ որ երևա տոկոսը)։ */
export function uploadFile(url: string, file: File, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("content-type", file.type || "audio/mpeg");
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      try { reject(new Error((JSON.parse(xhr.responseText) as { error?: string }).error ?? "Չհաջողվեց")); } catch { reject(new Error("Չհաջողվեց վերբեռնել։")); }
    };
    xhr.onerror = () => reject(new Error("Կապը ընդհատվեց։ Փորձեք նորից։"));
    xhr.send(file);
  });
}
