import { useCallback, useEffect, useRef, type FormEvent } from "react";
import { useSubmit } from "react-router";

export function useDebouncedFormSubmit(delayMs: number, minimumCharacters = 0) {
  const formRef = useRef<HTMLFormElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submit = useSubmit();

  const cancelPending = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => cancelPending, [cancelPending]);

  const submitForm = useCallback((replace: boolean) => {
    cancelPending();
    if (!formRef.current) return;
    void submit(formRef.current, { preventScrollReset: true, replace });
  }, [cancelPending, submit]);

  const submitImmediately = useCallback(() => submitForm(false), [submitForm]);
  const submitDebounced = useCallback(() => submitForm(true), [submitForm]);

  const scheduleSubmit = useCallback((event?: FormEvent<HTMLInputElement>) => {
    cancelPending();
    const value = event?.currentTarget.value.trim() ?? "";
    if (value && Array.from(value).length < minimumCharacters) return;
    timerRef.current = setTimeout(submitDebounced, delayMs);
  }, [cancelPending, delayMs, minimumCharacters, submitDebounced]);

  return { cancelPending, formRef, scheduleSubmit, submitImmediately };
}

/**
 * Keeps a search box's text in step with the URL's query without remounting the box, so typing
 * isn't interrupted when debounced results arrive. The text is only replaced while the reader
 * isn't typing in it (back/forward navigation, a cleared search).
 */
export function useSyncedQueryInput(query: string) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement !== input && input.value !== query) input.value = query;
  }, [query]);
  return inputRef;
}
