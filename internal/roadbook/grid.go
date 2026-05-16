package roadbook

import (
	"fmt"
	"sort"

	"github.com/johnfercher/maroto/v2/pkg/components/text"
	"github.com/johnfercher/maroto/v2/pkg/consts/fontstyle"
	"github.com/johnfercher/maroto/v2/pkg/core"
	"github.com/johnfercher/maroto/v2/pkg/props"
)

// addGridSheet appends a VS × 30-minute-slots grid per day to the master PDF.
// Rows are VS ids (ascending). Each cell shows assigned volunteer initials.
func addGridSheet(m core.Maroto, state EventState, primary *props.Color) {
	vsIDs := make([]int64, 0, len(state.VSByID))
	for id := range state.VSByID {
		vsIDs = append(vsIDs, id)
	}
	sort.Slice(vsIDs, func(i, j int) bool { return vsIDs[i] < vsIDs[j] })

	days := map[int]bool{}
	for _, mm := range state.MissionByID {
		days[mm.Day] = true
	}
	dayList := make([]int, 0, len(days))
	for d := range days {
		dayList = append(dayList, d)
	}
	sort.Ints(dayList)

	// 30-min slots covering 06:00 → 22:00 (33 slots) for compactness.
	slots := []string{}
	for h := 6; h < 22; h++ {
		slots = append(slots, fmt.Sprintf("%02d:00", h), fmt.Sprintf("%02d:30", h))
	}

	for _, d := range dayList {
		m.AddRow(6, text.NewCol(12, fmt.Sprintf("Grille — Jour %d", d+1),
			props.Text{Size: 11, Style: fontstyle.Bold, Color: primary, Top: 1}))
		// Slot header — first col is VS name (size 2/12), then collapse the 16 slots into 10/12.
		headerCols := []core.Col{text.NewCol(2, "VS", props.Text{Size: 6, Style: fontstyle.Bold})}
		// Show every 2nd slot label to keep header sane; full grid below uses dot density.
		for i, s := range slots {
			if i%2 == 0 {
				headerCols = append(headerCols, text.NewCol(1, s[:2], props.Text{Size: 5}))
			}
		}
		// pad to 12 columns
		for sum := colSum(headerCols); sum < 12; sum++ {
			headerCols = append(headerCols, text.NewCol(1, "", props.Text{}))
		}
		m.AddRow(4, headerCols...)
		for _, vsID := range vsIDs {
			vs := state.VSByID[vsID]
			line := []core.Col{text.NewCol(2, truncate(vs.Name, 14), props.Text{Size: 6})}
			for i, slot := range slots {
				if i%2 != 0 {
					continue
				}
				cell := slotInitials(state, vsID, d, slot)
				line = append(line, text.NewCol(1, cell, props.Text{Size: 5}))
			}
			for sum := colSum(line); sum < 12; sum++ {
				line = append(line, text.NewCol(1, "", props.Text{}))
			}
			m.AddRow(4, line...)
		}
	}
}

func slotInitials(state EventState, vsID int64, day int, slot string) string {
	out := ""
	// For each mission at this VS on this day overlapping the slot, list initials.
	for _, mm := range state.MissionByID {
		if mm.VSID != vsID || mm.Day != day {
			continue
		}
		if !overlapsSlot(mm.Start, mm.End, slot) {
			continue
		}
		// Find assigned volunteers.
		for _, a := range state.Engine.Assignments {
			if a.MissionID != mm.ID {
				continue
			}
			if v, ok := state.VolunteerByID[a.VolunteerID]; ok {
				init := ""
				if v.FirstName != "" {
					init += string(v.FirstName[0])
				}
				if v.LastName != "" {
					init += string(v.LastName[0])
				}
				if out != "" {
					out += " "
				}
				out += init
			}
		}
	}
	return out
}

func overlapsSlot(start, end, slot string) bool {
	a := parseHM(start)
	b := parseHM(end)
	s := parseHM(slot)
	return a <= s && s < b
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}

func colSum(cs []core.Col) int {
	n := 0
	for _, c := range cs {
		n += c.GetSize()
	}
	return n
}
