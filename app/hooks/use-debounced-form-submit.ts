import { useCallback, useEffect, useRef } from "react";
import { useSubmit } from "react-router";

export function useDebouncedFormSubmit(delayMs: number) {
  const formRef = useRef<HTMLFormElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submit = useSubmit();

  const cancelPending = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => cancelPending, [cancelPending]);

  const submitImmediately = useCallback(() => {
    cancelPending();
    if (!formRef.current) return;
    void submit(formRef.current, { preventScrollReset: true, replace: true });
  }, [cancelPending, submit]);

  const scheduleSubmit = useCallback(() => {
    cancelPending();
    timerRef.current = setTimeout(submitImmediately, delayMs);
  }, [cancelPending, delayMs, submitImmediately]);

  return { cancelPending, formRef, scheduleSubmit, submitImmediately };
}
