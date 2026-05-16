package constraints

import "fmt"

// availabilityViolation fires when an assigned mission's interval is not
// contained inside any of the volunteer's availability windows. Volunteers
// with no availability declared are assumed always-available (no signal).
func availabilityViolation(_ EventState, idx *index) []Warning {
	var out []Warning
	for volID, assigns := range idx.assignsByVol {
		v := idx.volunteerByID[volID]
		if len(v.Availability) == 0 {
			continue
		}
		windows := make([][2]int, 0, len(v.Availability))
		for _, a := range v.Availability {
			s, e := availInterval(a)
			if e > s {
				windows = append(windows, [2]int{s, e})
			}
		}
		if len(windows) == 0 {
			continue
		}
		for _, a := range assigns {
			m, ok := idx.missionByID[a.MissionID]
			if !ok {
				continue
			}
			ms, me := missionInterval(m)
			if me <= ms {
				continue
			}
			covered := false
			for _, w := range windows {
				if w[0] <= ms && w[1] >= me {
					covered = true
					break
				}
			}
			if covered {
				continue
			}
			ents := []EntityRef{
				{Type: EntityVolunteer, ID: volID},
				{Type: EntityMission, ID: m.ID},
				{Type: EntityAssignment, ID: a.ID},
			}
			out = append(out, Warning{
				ID:       stableID(KindAvailabilityViolation, ents),
				Kind:     KindAvailabilityViolation,
				Severity: SeverityWarn,
				Message:  fmt.Sprintf("%s %s n'est pas disponible sur ce créneau.", v.FirstName, v.LastName),
				Entities: ents,
			})
		}
	}
	return out
}
