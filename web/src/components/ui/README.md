# UI primitives

Hand-vendored from the canonical shadcn/ui v0 source on 2026-05-16, adapted to import `cn` from `@/lib/cn`.

## Files

- `button.tsx` — variants: `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`; sizes: `default`, `sm`, `lg`, `icon`.
- `input.tsx`
- `label.tsx`
- `textarea.tsx`
- `checkbox.tsx`
- `select.tsx` — full Radix `Select` API (`Trigger`, `Content`, `Item`, …).
- `tabs.tsx`
- `dialog.tsx`
- `tooltip.tsx`
- `card.tsx` — `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
- `separator.tsx`
- `dropdown-menu.tsx` — Radix `DropdownMenu` (vendored Slice 6).

## Notes for future slices

- **Toast is intentionally not migrated** in Slice 1. The repo currently has no toast helper; if `web/src/lib/toast.tsx` is introduced later, the migration to shadcn `toast` is deferred to a later slice.
- **Native `<select>` is still preferred** at call sites exercised by Playwright `selectOption` assertions (e.g. a future `CarList` driver picker in M03). Radix `Select` is opt-in for new code that doesn't need that selector.
- **Selector strategy:** prefer `data-testid` at call sites. Radix data attributes (`data-state`, `data-orientation`) are stable secondary selectors.
- **`CarDetail` does not exist yet.** Slice 2 / M03 must add it before the map drawer can push a `car` frame.

## Slice 1 scope deviation

The Slice 1 brief assumed an `AppShell`, `MapDrawer`, `VolunteerList`, `VolunteerDetail`, `CarList`, `MissionsGrid`, `RoadbookSettingsPage`, `GlobalIssueCounter`, and the routes `/timeline`, `/roadbooks`, `/settings/*`, `/trips`, `/transport-needs`, `/travel-times`, `/settings/archive` already existed. They do not — only M00–M02 are complete (event/vs/race/map). Steps 5–9 of the brief (header IA refactor, drawer push/pop, list `onSelect` rewiring, `MapShell` stack, e2e for drawer) are therefore prerequisites of milestones M03+ and have been moved to Slice 2.

What Slice 1 actually shipped:

- Design tokens (HSL CSS variables under `:root`, single light theme, no `.dark`).
- Tailwind theme extension wired to those tokens + `tailwindcss-animate`.
- The eleven vendored primitives above + `lib/cn.ts`.
- `.input` shim now mirrors shadcn `Input`'s default classes; no caller migrated yet.
