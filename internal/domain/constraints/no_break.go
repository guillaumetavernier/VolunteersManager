package constraints

import (
	"fmt"
	"sort"
)

// noBreak: a continuous run of assignments (gap < minGap) whose total
// duration exceeds afterHours emits one warning naming the run.
func noBreak(state EventState, idx *index) []Warning {
	afterMins := state.Settings.NoBreakAfterHours * 60
	gapMins := state.Settings.NoBreakMinGapMins
	if afterMins <= 0 {
		return nil
	}
	var out []Warning
	type slot struct {
		assignID, missID int64
		start, end       int
	}
	for volID, assigns := range idx.assignsByVol {
		slots := make([]slot, 0, len(assigns))
		for _, a := range assigns {
			m, ok := idx.missionByID[a.MissionID]
			if !ok {
				continue
			}
			s, e := missionInterval(m)
			if e <= s {
				continue
			}
			slots = append(slots, slot{a.ID, m.ID, s, e})
		}
		if len(slots) < 2 {
			continue
		}
		sort.Slice(slots, func(i, j int) bool { return slots[i].start < slots[j].start })
		// Walk runs of consecutive slots whose gap < gapMins.
		runStart := 0
		flushIfBig := func(end int) {
			if end-runStart < 1 {
				return
			}
			runSlots := slots[runStart : end+1]
			total := 0
			minS := runSlots[0].start
			maxE := runSlots[0].end
			for _, s := range runSlots {
				total += s.end - s.start
				if s.start < minS {
					minS = s.start
				}
				if s.end > maxE {
					maxE = s.end
				}
			}
			span := maxE - minS
			if float64(span) <= afterMins {
				return
			}
			_ = total
			v := idx.volunteerByID[volID]
			ents := []EntityRef{{Type: EntityVolunteer, ID: volID}}
			for _, s := range runSlots {
				ents = append(ents, EntityRef{Type: EntityAssignment, ID: s.assignID})
			}
			out = append(out, Warning{
				ID:       stableID(KindNoBreak, ents),
				Kind:     KindNoBreak,
				Severity: SeverityWarn,
				Message:  fmt.Sprintf("%s %s enchaîne %.1fh sans pause.", v.FirstName, v.LastName, float64(span)/60),
				Entities: ents,
			})
		}
		for i := 1; i < len(slots); i++ {
			gap := slots[i].start - slots[i-1].end
			if float64(gap) >= gapMins {
				flushIfBig(i - 1)
				runStart = i
			}
		}
		flushIfBig(len(slots) - 1)
	}
	return out
}
