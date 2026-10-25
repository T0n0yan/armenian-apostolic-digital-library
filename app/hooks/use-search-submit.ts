import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { searchValidation } from "../utils/search-validation";

/** Explicit searches only. Typing or erasing never submits or changes the current route. */
export function useSearchSubmit(allowPsalmNumber: boolean | ((form: HTMLFormElement) => boolean) = false) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const validateSubmit = useCallback((event?: FormEvent<HTMLFormElement>) => {
    const input = formRef.current?.elements.namedItem("q") as HTMLInputElement | null;
    const message = searchValidation(input?.value ?? "", typeof allowPsalmNumber === "function" && formRef.current ? allowPsalmNumber(formRef.current) : allowPsalmNumber === true);
    setError(message);
    if (message) event?.preventDefault();
  }, [allowPsalmNumber]);
  const clearError = useCallback(() => setError(null), []);
  // requestSubmit follows the same validation path for Enter, buttons and suggestions.
  const submitImmediately = useCallback(() => formRef.current?.requestSubmit(), []);
  return { validateSubmit, formRef, clearError, submitImmediately, error };
}

export function useSyncedQueryInput(query: string) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement !== input && input.value !== query) input.value = query;
  }, [query]);
  return inputRef;
}
