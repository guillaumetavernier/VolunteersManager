package constraints

import "fmt"

// excessiveDuty: sum of mission durations on a single day exceeds the threshold.
// One warning per (volunteer, day) with all that day's assignments listed.
func excessiveDuty(state EventState, idx *index) []Warning {
	thr := state.Settings.MaxDutyHours * 60
	if thr <= 0 {
		return nil
	}
	var out []Warning
	for volID, assigns := range idx.assignsByVol {
		// (day -> total minutes, day -> []assignment IDs)
		totals := map[int]int{}
		ids := map[int][]int64{}
		for _, a := range assigns {
			m, ok := idx.missionByID[a.MissionID]
			if !ok {
				continue
			}
			s, e := missionInterval(m)
			if e <= s {
				continue
			}
			totals[m.Day] += e - s
			ids[m.Day] = append(ids[m.Day], a.ID)
		}
		v := idx.volunteerByID[volID]
		for day, mins := range totals {
			if float64(mins) <= thr {
				continue
			}
			ents := []EntityRef{{Type: EntityVolunteer, ID: volID}}
			for _, id := range ids[day] {
				ents = append(ents, EntityRef{Type: EntityAssignment, ID: id})
			}
			out = append(out, Warning{
				ID:       stableID(KindExcessiveDuty, ents),
				Kind:     KindExcessiveDuty,
				Severity: SeverityWarn,
				Message:  fmt.Sprintf("%s %s a %.1fh de service le jour %d.", v.FirstName, v.LastName, float64(mins)/60, day+1),
				Entities: ents,
			})
		}
	}
	return out
}
