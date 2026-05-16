import { useEffect, useState } from "react";

type Toast = { id: number; message: string; kind: "info" | "error" };

const listeners = new Set<(toasts: Toast[]) => void>();
let toasts: Toast[] = [];
let seq = 0;

function emit() {
  for (const l of listeners) l([...toasts]);
}

export function toast(message: string, kind: "info" | "error" = "info") {
  const id = ++seq;
  toasts = [...toasts, { id, message, kind }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 4000);
}

export function ToastViewport() {
  const [items, setItems] = useState<Toast[]>(toasts);
  useEffect(() => {
    const fn = (t: Toast[]) => setItems(t);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 grid -translate-x-1/2 gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          data-toast-kind={t.kind}
          className={`pointer-events-auto rounded-md px-4 py-2 text-sm shadow ${
            t.kind === "error" ? "bg-red-600 text-white" : "bg-slate-900 text-white"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
