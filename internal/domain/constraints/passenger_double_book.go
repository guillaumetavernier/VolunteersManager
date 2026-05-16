package constraints

import "fmt"

// passengerDoubleBook: a volunteer's "on the vehicle" intervals across trips
// overlap with each other or with one of the volunteer's mission intervals.
func passengerDoubleBook(state EventState, idx *index) []Warning {
	// Build per-volunteer ride intervals from trip boardings.
	type rideInterval struct {
		tripID int64
		start  int
		end    int
	}
	ridesByVol := map[int64][]rideInterval{}
	for _, t := range state.Trips {
		boarded := map[int64]int{} // volunteer → stop index where boarded
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
				ridesByVol[v] = append(ridesByVol[v], rideInterval{
					tripID: t.ID,
					start:  t.Stops[bi].TimeMin,
					end:    st.TimeMin,
				})
				delete(boarded, v)
			}
		}
	}

	var out []Warning
	for volID, rides := range ridesByVol {
		// trip ↔ trip overlap.
		for i := 0; i < len(rides); i++ {
			for j := i + 1; j < len(rides); j++ {
				if rides[i].end <= rides[j].start || rides[j].end <= rides[i].start {
					continue
				}
				ents := []EntityRef{
					{Type: EntityVolunteer, ID: volID},
					{Type: EntityTrip, ID: rides[i].tripID},
					{Type: EntityTrip, ID: rides[j].tripID},
				}
				v := idx.volunteerByID[volID]
				out = append(out, Warning{
					ID:       stableID(KindPassengerDoubleBook, ents),
					Kind:     KindPassengerDoubleBook,
					Severity: SeverityError,
					Message:  fmt.Sprintf("%s %s est sur deux trajets simultanés.", v.FirstName, v.LastName),
					Entities: ents,
				})
			}
		}
		// trip ↔ mission overlap.
		for _, a := range idx.assignsByVol[volID] {
			m, ok := idx.missionByID[a.MissionID]
			if !ok {
				continue
			}
			ms, me := missionInterval(m)
			for _, ride := range rides {
				if ride.end <= ms || me <= ride.start {
					continue
				}
				ents := []EntityRef{
					{Type: EntityVolunteer, ID: volID},
					{Type: EntityTrip, ID: ride.tripID},
					{Type: EntityAssignment, ID: a.ID},
				}
				v := idx.volunteerByID[volID]
				out = append(out, Warning{
					ID:       stableID(KindPassengerDoubleBook, ents),
					Kind:     KindPassengerDoubleBook,
					Severity: SeverityError,
					Message:  fmt.Sprintf("%s %s est dans un trajet pendant une mission.", v.FirstName, v.LastName),
					Entities: ents,
				})
			}
		}
	}
	return out
}
