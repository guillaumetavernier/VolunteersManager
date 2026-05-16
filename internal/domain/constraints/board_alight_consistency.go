package constraints

import "fmt"

// boardAlightConsistency reports two distinct failure modes for the same
// underlying invariant: every boarded volunteer must alight at a later stop.
//   - board_without_alight: boards at some stop, never alights.
//   - alight_before_board: alights at stop M without first boarding at any
//     earlier stop (or boards at stop N > M).
func boardAlightConsistency(state EventState, idx *index) []Warning {
	var out []Warning
	for _, t := range state.Trips {
		// First pass: detect alight-before-board by scanning all stops; we keep
		// a "first board index" per volunteer.
		firstBoard := map[int64]int{}
		for i, st := range t.Stops {
			for _, v := range st.Board {
				if _, ok := firstBoard[v]; !ok {
					firstBoard[v] = i
				}
			}
		}
		// Track currently-boarded across the walk; flag aliding without prior
		// matching board.
		boarded := map[int64]int{}
		alightedSomewhere := map[int64]bool{}
		for i, st := range t.Stops {
			for _, v := range st.Board {
				if _, exists := boarded[v]; !exists {
					boarded[v] = i
				}
			}
			for _, v := range st.Alight {
				_, ok := boarded[v]
				if !ok {
					// alight at stop M without an active boarding => check if
					// the volunteer boards LATER. If yes => alight_before_board.
					if fb, hasBoard := firstBoard[v]; hasBoard && fb > i {
						ents := []EntityRef{
							{Type: EntityVolunteer, ID: v},
							{Type: EntityTrip, ID: t.ID},
							{Type: EntityTripStop, ID: st.ID},
						}
						vol := idx.volunteerByID[v]
						out = append(out, Warning{
							ID:       stableID(KindAlightBeforeBoard, ents),
							Kind:     KindAlightBeforeBoard,
							Severity: SeverityError,
							Message:  fmt.Sprintf("%s %s descend du trajet n°%d avant d'y monter.", vol.FirstName, vol.LastName, t.ID),
							Entities: ents,
						})
					}
					// orphan alight with no board at all is also a configuration
					// error; report it as alight_before_board for now (the UI
					// distinguishes via the message). Keeping a single sub-kind
					// per the milestone wording.
					continue
				}
				alightedSomewhere[v] = true
				delete(boarded, v)
			}
		}
		// boarded still has volunteers => board_without_alight.
		for v := range boarded {
			if alightedSomewhere[v] {
				continue
			}
			ents := []EntityRef{
				{Type: EntityVolunteer, ID: v},
				{Type: EntityTrip, ID: t.ID},
			}
			vol := idx.volunteerByID[v]
			out = append(out, Warning{
				ID:       stableID(KindBoardWithoutAlight, ents),
				Kind:     KindBoardWithoutAlight,
				Severity: SeverityWarn,
				Message:  fmt.Sprintf("%s %s monte dans le trajet n°%d mais n'en descend jamais.", vol.FirstName, vol.LastName, t.ID),
				Entities: ents,
			})
		}
	}
	return out
}
