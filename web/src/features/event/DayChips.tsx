import { useEvent } from "./hooks";
import { dayCount } from "./eventcal";

interface Props {
  value: number | null;
  onChange: (day: number | null) => void;
  // Show a leading "no specific day" chip — used when the field is optional
  // (e.g., a GPX can apply across all days).
  includeNone?: boolean;
  noneLabel?: string;
  ariaLabel?: string;
  testidPrefix?: string;
}

export function DayChips({
  value,
  onChange,
  includeNone = false,
  noneLabel = "Tous",
  ariaLabel = "Jour",
  testidPrefix = "day",
}: Props) {
  const event = useEvent();
  const totalDays = event.data ? dayCount(event.data) : 1;

  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={ariaLabel}>
      {includeNone && (
        <button
          type="button"
          role="radio"
          aria-checked={value == null}
          data-testid={`${testidPrefix}-none`}
          onClick={() => onChange(null)}
          className={chipClass(value == null)}
        >
          {noneLabel}
        </button>
      )}
      {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => {
        const active = value === d;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={`${testidPrefix}-${d}`}
            onClick={() => onChange(d)}
            className={chipClass(active)}
          >
            J{d}
          </button>
        );
      })}
    </div>
  );
}

function chipClass(active: boolean): string {
  return `rounded-md border px-3 py-1 text-xs font-medium ${
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
  }`;
}
