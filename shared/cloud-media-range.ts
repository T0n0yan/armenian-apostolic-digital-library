export const CLOUD_MEDIA_RANGE_WINDOW_BYTES = 2 * 1024 * 1024;

export function boundCloudOpenEndedRange(
  value: string | null,
  range: { start: number; end: number },
) {
  if (!value || !/^bytes=\d+-$/u.test(value.trim())) return range;
  return {
    start: range.start,
    end: Math.min(range.end, range.start + CLOUD_MEDIA_RANGE_WINDOW_BYTES - 1),
  };
}
