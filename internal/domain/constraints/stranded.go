package constraints

import (
	"fmt"
	"sort"
)

// stranded: volunteer has consecutive assignments whose VS differ and no trip
// leg covers the (from_vs, to_vs) pair for that volunteer.
func stranded(_ EventState, idx *index) []Warning {
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
			if idx.coveredLeg[volID] != nil &&
				idx.coveredLeg[volID][prev.m.VSID] != nil &&
				idx.coveredLeg[volID][prev.m.VSID][cur.m.VSID] {
				continue
			}
			ents := []EntityRef{
				{Type: EntityVolunteer, ID: volID},
				{Type: EntityAssignment, ID: prev.a.ID},
				{Type: EntityAssignment, ID: cur.a.ID},
				{Type: EntityMission, ID: prev.m.ID},
				{Type: EntityMission, ID: cur.m.ID},
			}
			v := idx.volunteerByID[volID]
			out = append(out, Warning{
				ID:       stableID(KindStranded, ents),
				Kind:     KindStranded,
				Severity: SeverityWarn,
				Message:  fmt.Sprintf("%s %s n'a aucun transport prévu entre deux missions sur des VS différents.", v.FirstName, v.LastName),
				Entities: ents,
			})
		}
	}
	return out
}
