package constraints

import "fmt"

// capacityExceeded: per leg, the number of passengers riding (between stop i
// and stop i+1) exceeds the car's seat count. Stops with zero seats config are
// not checked (treated as unknown).
func capacityExceeded(state EventState, idx *index) []Warning {
	var out []Warning
	for _, t := range state.Trips {
		car := idx.carByID[t.CarID]
		if car.Seats <= 0 {
			continue
		}
		// Walk the trip; at each stop add boards and remove alights, then the
		// passenger count after-departure is what rides to the next stop.
		onboard := map[int64]bool{}
		for i := 0; i < len(t.Stops)-1; i++ {
			for _, v := range t.Stops[i].Board {
				onboard[v] = true
			}
			for _, v := range t.Stops[i].Alight {
				delete(onboard, v)
			}
			if len(onboard) > car.Seats {
				ents := []EntityRef{
					{Type: EntityTrip, ID: t.ID},
					{Type: EntityTripStop, ID: t.Stops[i].ID},
					{Type: EntityCar, ID: t.CarID},
				}
				out = append(out, Warning{
					ID:       stableID(KindCapacityExceeded, ents),
					Kind:     KindCapacityExceeded,
					Severity: SeverityError,
					Message:  fmt.Sprintf("Trajet n°%d : %d passagers > %d places.", t.ID, len(onboard), car.Seats),
					Entities: ents,
				})
			}
		}
	}
	return out
}
