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
	out = append(out, stranded(state, idx)...)
	out = append(out, insufficientTravel(state, idx)...)
	out = append(out, capacityExceeded(state, idx)...)
	out = append(out, driverDoubleBook(state, idx)...)
	out = append(out, passengerDoubleBook(state, idx)...)
	out = append(out, boardAlightConsistency(state, idx)...)

	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// index precomputes lookups used by multiple checkers.
type index struct {
	missionByID   map[int64]Mission
	volunteerByID map[int64]Volunteer
	assignsByVol  map[int64][]Assignment
	assignsByMiss map[int64][]Assignment
	carByID       map[int64]Car
	travelByKey   map[travelKey]TravelCell
	// coveredLeg[volID][fromVSID][toVSID] = true when some trip carries the volunteer
	// (boards at from, alights at to) over the matching VS pair.
	coveredLeg map[int64]map[int64]map[int64]bool
}

type travelKey struct {
	from, to int64
	mode     string
}

func newIndex(s EventState) *index {
	idx := &index{
		missionByID:   make(map[int64]Mission, len(s.Missions)),
		volunteerByID: make(map[int64]Volunteer, len(s.Volunteers)),
		assignsByVol:  make(map[int64][]Assignment, len(s.Volunteers)),
		assignsByMiss: make(map[int64][]Assignment, len(s.Missions)),
		carByID:       make(map[int64]Car, len(s.Cars)),
		travelByKey:   make(map[travelKey]TravelCell, len(s.TravelTimes)),
		coveredLeg:    map[int64]map[int64]map[int64]bool{},
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
	for _, c := range s.Cars {
		idx.carByID[c.ID] = c
	}
	for _, c := range s.TravelTimes {
		idx.travelByKey[travelKey{c.FromVS, c.ToVS, c.Mode}] = c
	}
	for _, t := range s.Trips {
		boarded := map[int64]int{}
		for i, st := range t.Stops {
			for _, v := range st.Board {
				if _, exists := boarded[v]; !exists {
					boarded[v] = i
				}
			}
			for _, v := range st.Alight {
				bi, ok := boarded[v]
				if !ok {
					continue
				}
				from := t.Stops[bi].VSID
				to := st.VSID
				if idx.coveredLeg[v] == nil {
					idx.coveredLeg[v] = map[int64]map[int64]bool{}
				}
				if idx.coveredLeg[v][from] == nil {
					idx.coveredLeg[v][from] = map[int64]bool{}
				}
				idx.coveredLeg[v][from][to] = true
				delete(boarded, v)
			}
		}
	}
	return idx
}
