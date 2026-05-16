package constraints

import "fmt"

// understaffed: assigned < headcount.
func understaffed(_ EventState, idx *index) []Warning {
	var out []Warning
	for _, m := range idx.missionByID {
		assigned := len(idx.assignsByMiss[m.ID])
		if assigned >= m.Headcount {
			continue
		}
		ents := []EntityRef{{Type: EntityMission, ID: m.ID}}
		title := m.Title
		if title == "" {
			title = m.RoleType
		}
		out = append(out, Warning{
			ID:       stableID(KindUnderstaffed, ents),
			Kind:     KindUnderstaffed,
			Severity: SeverityWarn,
			Message:  fmt.Sprintf("Mission « %s » sous-staffée (%d/%d).", title, assigned, m.Headcount),
			Entities: ents,
		})
	}
	return out
}

// overstaffed: assigned > headcount (informational).
func overstaffed(_ EventState, idx *index) []Warning {
	var out []Warning
	for _, m := range idx.missionByID {
		assigned := len(idx.assignsByMiss[m.ID])
		if assigned <= m.Headcount {
			continue
		}
		ents := []EntityRef{{Type: EntityMission, ID: m.ID}}
		title := m.Title
		if title == "" {
			title = m.RoleType
		}
		out = append(out, Warning{
			ID:       stableID(KindOverstaffed, ents),
			Kind:     KindOverstaffed,
			Severity: SeverityInfo,
			Message:  fmt.Sprintf("Mission « %s » sur-staffée (%d/%d).", title, assigned, m.Headcount),
			Entities: ents,
		})
	}
	return out
}
