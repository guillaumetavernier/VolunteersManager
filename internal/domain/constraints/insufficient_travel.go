package constraints

import (
	"fmt"
	"sort"
)

// insufficientTravel: consecutive different-VS missions where the gap between
// them is less than the drive-mode travel time + a buffer.
func insufficientTravel(state EventState, idx *index) []Warning {
	bufferMin := int(state.Settings.TravelBufferMins)
	if bufferMin < 0 {
		bufferMin = 0
	}
	var out []Warning
	for volID, assigns := range idx.assignsByVol {
		if len(assigns) < 2 {
			continue
		}
		type item struct {
			a Assignment
			m Mission
			s int
			e int
		}
		var items []item
		for _, a := range assigns {
			m, ok := idx.missionByID[a.MissionID]
			if !ok {
				continue
			}
			s, e := missionInterval(m)
			items = append(items, item{a: a, m: m, s: s, e: e})
		}
		sort.Slice(items, func(i, j int) bool { return items[i].s < items[j].s })
		for i := 1; i < len(items); i++ {
			prev := items[i-1]
			cur := items[i]
			if prev.m.VSID == cur.m.VSID || prev.m.VSID == 0 || cur.m.VSID == 0 {
				continue
			}
			cell, ok := idx.travelByKey[travelKey{prev.m.VSID, cur.m.VSID, "drive"}]
			if !ok {
				continue
			}
			travelMin := (cell.Seconds + 59) / 60
			gap := cur.s - prev.e
			if gap >= travelMin+bufferMin {
				continue
			}
			ents := []EntityRef{
				{Type: EntityVolunteer, ID: volID},
				{Type: EntityAssignment, ID: prev.a.ID},
				{Type: EntityAssignment, ID: cur.a.ID},
			}
			v := idx.volunteerByID[volID]
			out = append(out, Warning{
				ID:       stableID(KindInsufficientTravel, ents),
				Kind:     KindInsufficientTravel,
				Severity: SeverityWarn,
				Message:  fmt.Sprintf("Temps de trajet insuffisant entre les deux missions de %s %s (gap %d min < %d min).", v.FirstName, v.LastName, gap, travelMin+bufferMin),
				Entities: ents,
			})
		}
	}
	return out
}
