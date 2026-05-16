import { MissionsGrid } from "@/features/mission/MissionsGrid";

export function AffectationsPage() {
  return (
    <div className="h-full overflow-y-auto" data-testid="affectations-page">
      <MissionsGrid />
    </div>
  );
}
