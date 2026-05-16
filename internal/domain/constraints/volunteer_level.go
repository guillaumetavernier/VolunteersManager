package constraints

import "fmt"

// unassigned: a non-archived volunteer with zero assignments. Informational.
func unassigned(state EventState, idx *index) []Warning {
	var out []Warning
	for _, v := range state.Volunteers {
		if v.Archived {
			continue
		}
		if len(idx.assignsByVol[v.ID]) > 0 {
			continue
		}
		ents := []EntityRef{{Type: EntityVolunteer, ID: v.ID}}
		out = append(out, Warning{
			ID:       stableID(KindUnassigned, ents),
			Kind:     KindUnassigned,
			Severity: SeverityInfo,
			Message:  fmt.Sprintf("%s %s n'a aucune mission.", v.FirstName, v.LastName),
			Entities: ents,
		})
	}
	return out
}

// missingPhone: an assigned volunteer with a blank phone number. Error-level.
func missingPhone(state EventState, idx *index) []Warning {
	var out []Warning
	for _, v := range state.Volunteers {
		if v.Archived {
			continue
		}
		if v.Phone != "" {
			continue
		}
		if len(idx.assignsByVol[v.ID]) == 0 {
			continue
		}
		ents := []EntityRef{{Type: EntityVolunteer, ID: v.ID}}
		out = append(out, Warning{
			ID:       stableID(KindMissingPhone, ents),
			Kind:     KindMissingPhone,
			Severity: SeverityError,
			Message:  fmt.Sprintf("%s %s est affecté·e mais sans téléphone.", v.FirstName, v.LastName),
			Entities: ents,
		})
	}
	return out
}
