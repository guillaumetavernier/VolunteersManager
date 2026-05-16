package constraints

import (
	"fmt"
	"sort"
)

// doubleBooking surfaces a warning when a volunteer is assigned to two
// missions whose intervals overlap. One warning per pair.
func doubleBooking(_ EventState, idx *index) []Warning {
	var out []Warning
	for volID, assigns := range idx.assignsByVol {
		if len(assigns) < 2 {
			continue
		}
		type pair struct {
			a, b   Assignment
			am, bm Mission
		}
		// resolve to mission intervals
		type ami struct {
			a     Assignment
			start int
			end   int
		}
		amis := make([]ami, 0, len(assigns))
		for _, a := range assigns {
			m, ok := idx.missionByID[a.MissionID]
			if !ok {
				continue
			}
			s, e := missionInterval(m)
			if e <= s {
				continue
			}
			amis = append(amis, ami{a: a, start: s, end: e})
		}
		sort.Slice(amis, func(i, j int) bool {
			if amis[i].start != amis[j].start {
				return amis[i].start < amis[j].start
			}
			return amis[i].a.ID < amis[j].a.ID
		})
		for i := 0; i < len(amis); i++ {
			for j := i + 1; j < len(amis); j++ {
				if amis[j].start >= amis[i].end {
					break
				}
				ents := []EntityRef{
					{Type: EntityVolunteer, ID: volID},
					{Type: EntityAssignment, ID: amis[i].a.ID},
					{Type: EntityAssignment, ID: amis[j].a.ID},
				}
				v := idx.volunteerByID[volID]
				out = append(out, Warning{
					ID:       stableID(KindDoubleBooking, ents),
					Kind:     KindDoubleBooking,
					Severity: SeverityError,
					Message:  fmt.Sprintf("%s %s a deux missions qui se chevauchent.", v.FirstName, v.LastName),
					Entities: ents,
				})
			}
		}
	}
	return out
}
