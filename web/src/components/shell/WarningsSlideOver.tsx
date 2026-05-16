import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useState } from "react";

import { topSeverity, useWarnings } from "@/features/warnings/hooks";
import type { EntityRef, Warning, WarningKind } from "@/features/warnings/api";
import { Button } from "@/components/ui/button";
import { navigate } from "@/lib/router";

const SEVERITY_CLASS: Record<string, string> = {
  error: "bg-red-600 text-white",
  warn: "bg-amber-500 text-white",
  info: "bg-blue-500 text-white",
};

const KIND_LABEL: Record<WarningKind, string> = {
  double_booking: "Double affectation",
  role_mismatch: "Rôle non conforme",
  availability_violation: "Hors disponibilité",
  excessive_duty: "Service trop long",
  no_break: "Sans pause",
  understaffed: "Sous-staffé",
  overstaffed: "Sur-staffé",
  unassigned: "Sans mission",
  missing_phone_with_assignments: "Téléphone manquant",
  stranded: "Sans transport",
  insufficient_travel: "Temps de trajet insuffisant",
  capacity_exceeded: "Capacité dépassée",
  driver_double_book: "Conducteur occupé",
  passenger_double_book: "Passager occupé",
  board_without_alight: "Monte sans descendre",
  alight_before_board: "Descend avant de monter",
};

export function WarningsSlideOver() {
  const { data } = useWarnings();
  const [open, setOpen] = useState(false);
  const ws = data ?? [];
  const sev = topSeverity(ws) ?? "info";
  const isEmpty = ws.length === 0;
  const triggerClass = isEmpty
    ? "h-auto rounded-full bg-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-300"
    : `h-auto rounded-full px-3 py-1 text-xs font-semibold ${SEVERITY_CLASS[sev] ?? SEVERITY_CLASS.info}`;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button
          type="button"
          size="sm"
          className={triggerClass}
          data-testid="global-issue-counter"
          data-count={ws.length}
        >
          {isEmpty
            ? "Aucun problème"
            : `${ws.length} problème${ws.length > 1 ? "s" : ""}`}
          <span className="sr-only">⚠</span>
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-40 bg-black/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          data-testid="warnings-slide-over"
          className="fixed right-0 top-0 z-50 flex h-full w-[min(28rem,100vw)] flex-col border-l border-slate-200 bg-white shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
        >
          <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <DialogPrimitive.Title className="text-base font-semibold">
              Problèmes ({ws.length})
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Fermer" data-testid="warnings-close">
                ✕
              </Button>
            </DialogPrimitive.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <Body
              warnings={ws}
              onNavigate={(target) => {
                setOpen(false);
                navigate(target);
              }}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Body({
  warnings,
  onNavigate,
}: {
  warnings: Warning[];
  onNavigate: (target: string) => void;
}) {
  if (warnings.length === 0) {
    return <p className="text-sm text-slate-600">Aucun problème détecté.</p>;
  }
  const grouped = new Map<WarningKind, Warning[]>();
  for (const w of warnings) {
    const arr = grouped.get(w.kind) ?? [];
    arr.push(w);
    grouped.set(w.kind, arr);
  }
  return (
    <div className="grid gap-4">
      {Array.from(grouped.entries()).map(([kind, items]) => (
        <section key={kind} data-testid={`group-${kind}`}>
          <h3 className="mb-2 text-xs font-semibold uppercase text-slate-600">
            {KIND_LABEL[kind] ?? kind} ({items.length})
          </h3>
          <ul className="divide-y rounded-md border bg-white">
            {items.map((w) => (
              <li
                key={w.id}
                className="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-slate-50"
                onClick={() => onNavigate(targetFor(w.entities))}
                data-testid={`warning-${w.id}`}
                data-kind={w.kind}
              >
                <span className="pr-2 text-sm">{w.message}</span>
                <span
                  className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-xs ${
                    SEVERITY_CLASS[w.severity] ?? ""
                  }`}
                >
                  {w.severity}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function targetFor(ents: EntityRef[]): string {
  const vol = ents.find((e) => e.type === "volunteer");
  if (vol) return `/ressources/benevoles/${vol.id}`;
  const miss = ents.find((e) => e.type === "mission");
  if (miss) return "/affectations";
  return "/";
}
