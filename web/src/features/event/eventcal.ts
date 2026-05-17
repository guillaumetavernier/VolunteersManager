// Helpers for converting between (day-N, HH:MM) and the ISO "YYYY-MM-DDTHH:MM"
// strings the backend stores. Mirrors the cross-cutting helper described in
// .harness/STATE.md "Open questions" — kept frontend-only for now, since
// nothing in Go currently needs it.

import type { Event } from "./api";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

export function dayCount(event: Pick<Event, "start_date" | "end_date">): number {
  const s = parseDate(event.start_date);
  const e = parseDate(event.end_date);
  if (!s || !e) return 1;
  const diff = Math.round((e - s) / 86_400_000);
  return Math.max(1, diff + 1);
}

// dateForDay returns "YYYY-MM-DD" for the N-th day (1-indexed) of the event.
export function dateForDay(
  event: Pick<Event, "start_date">,
  day: number,
): string {
  const s = parseDate(event.start_date);
  if (!s) return event.start_date;
  const d = new Date(s + (day - 1) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

// composeISO builds "YYYY-MM-DDTHH:MM" from a day index + HH:MM.
export function composeISO(
  event: Pick<Event, "start_date">,
  day: number,
  hhmm: string,
): string {
  if (!hhmm) return "";
  return `${dateForDay(event, day)}T${hhmm}`;
}

// extractHHMM pulls "HH:MM" out of an ISO-ish "YYYY-MM-DDTHH:MM[:SS]" string.
// Returns "" if the input doesn't look like that.
export function extractHHMM(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /T(\d{2}:\d{2})/.exec(iso);
  return m ? m[1] : "";
}

function parseDate(ymd: string): number | null {
  const m = ISO_DATE.exec(ymd);
  if (!m) return null;
  // Treat as UTC midnight to avoid timezone drift between day arithmetic and
  // the formatter; backend stores naive local datetimes so this never leaks.
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? ms : null;
}
