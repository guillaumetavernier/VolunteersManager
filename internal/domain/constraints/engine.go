package constraints

import "sort"

// Compute is the engine's single public entry point. It runs every checker on
// the given state, concatenates the results, and sorts by Warning.ID for
// deterministic output. Pure: no DB, no clock, no randomness.
func Compute(state EventState) []Warning {
	if state.Settings == (Settings{}) {
		state.Settings = DefaultSettings()
	}
	idx := newIndex(state)

	var out []Warning
	out = append(out, doubleBooking(state, idx)...)
	out = append(out, roleMismatch(state, idx)...)
	out = append(out, availabilityViolation(state, idx)...)
	out = append(out, excessiveDuty(state, idx)...)
	out = append(out, noBreak(state, idx)...)
	out = append(out, understaffed(state, idx)...)
	out = append(out, overstaffed(state, idx)...)
	out = append(out, unassigned(state, idx)...)
	out = append(out, missingPhone(state, idx)...)

	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// index precomputes lookups used by multiple checkers.
type index struct {
	missionByID    map[int64]Mission
	volunteerByID  map[int64]Volunteer
	assignsByVol   map[int64][]Assignment
	assignsByMiss  map[int64][]Assignment
}

func newIndex(s EventState) *index {
	idx := &index{
		missionByID:   make(map[int64]Mission, len(s.Missions)),
		volunteerByID: make(map[int64]Volunteer, len(s.Volunteers)),
		assignsByVol:  make(map[int64][]Assignment, len(s.Volunteers)),
		assignsByMiss: make(map[int64][]Assignment, len(s.Missions)),
	}
	for _, m := range s.Missions {
		idx.missionByID[m.ID] = m
	}
	for _, v := range s.Volunteers {
		idx.volunteerByID[v.ID] = v
	}
	for _, a := range s.Assignments {
		idx.assignsByVol[a.VolunteerID] = append(idx.assignsByVol[a.VolunteerID], a)
		idx.assignsByMiss[a.MissionID] = append(idx.assignsByMiss[a.MissionID], a)
	}
	return idx
}
