import { useCallback, useState } from "react";

// Minimal push/pop navigation stack for the right sidebar. Each tool owns its
// own stack instance; switching tools is the parent's responsibility (it
// re-mounts the tool, which discards the stack).
export function usePushStack<Frame>(initial: Frame[] = []) {
  const [stack, setStack] = useState<Frame[]>(initial);
  const push = useCallback((f: Frame) => setStack((s) => [...s, f]), []);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const reset = useCallback((next: Frame[] = []) => setStack(next), []);
  const replaceTop = useCallback(
    (f: Frame) => setStack((s) => (s.length === 0 ? [f] : [...s.slice(0, -1), f])),
    [],
  );
  return { stack, push, pop, reset, replaceTop } as const;
}
