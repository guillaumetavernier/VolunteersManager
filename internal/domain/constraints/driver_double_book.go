package constraints

import "fmt"

// driverDoubleBook: a trip's driver is assigned to a mission whose interval
// overlaps the trip window [stop[0].time, stop[N].time].
func driverDoubleBook(state EventState, idx *index) []Warning {
	var out []Warning
	for _, t := range state.Trips {
		if len(t.Stops) < 2 {
			continue
		}
		s := t.Stops[0].TimeMin
		e := t.Stops[len(t.Stops)-1].TimeMin
		if e <= s {
			continue
		}
		for _, a := range idx.assignsByVol[t.DriverID] {
			m, ok := idx.missionByID[a.MissionID]
			if !ok {
				continue
			}
			ms, me := missionInterval(m)
			if me <= s || ms >= e {
				continue
			}
			ents := []EntityRef{
				{Type: EntityVolunteer, ID: t.DriverID},
				{Type: EntityTrip, ID: t.ID},
				{Type: EntityAssignment, ID: a.ID},
			}
			v := idx.volunteerByID[t.DriverID]
			out = append(out, Warning{
				ID:       stableID(KindDriverDoubleBook, ents),
				Kind:     KindDriverDoubleBook,
				Severity: SeverityError,
				Message:  fmt.Sprintf("%s %s (conducteur du trajet n°%d) est sur une mission qui chevauche le trajet.", v.FirstName, v.LastName, t.ID),
				Entities: ents,
			})
		}
	}
	return out
}
