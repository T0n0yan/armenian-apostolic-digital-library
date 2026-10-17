/**
 * True when a loaded image is almost entirely black, such as a video whose first frame is a
 * fade-in. Such thumbnails look broken, so callers show a designed placeholder instead.
 * Only works for same-origin images (ours come from /media); returns false if unreadable.
 */
export function isNearlyBlackImage(image: HTMLImageElement) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || !image.naturalWidth) return false;
    context.drawImage(image, 0, 0, 16, 16);
    const { data } = context.getImageData(0, 0, 16, 16);
    let total = 0;
    for (let index = 0; index < data.length; index += 4) {
      total += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    }
    return total / (data.length / 4) < 18;
  } catch {
    return false;
  }
}
