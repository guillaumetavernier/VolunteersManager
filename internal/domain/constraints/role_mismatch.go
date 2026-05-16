package constraints

import (
	"fmt"
	"strings"
)

// roleMismatch fires when a mission's role_type is not present (case-insensitive)
// in the assigned volunteer's role_types. Missions with no role and volunteers
// with no roles are skipped (no signal).
func roleMismatch(_ EventState, idx *index) []Warning {
	var out []Warning
	for volID, assigns := range idx.assignsByVol {
		v := idx.volunteerByID[volID]
		roleSet := make(map[string]struct{}, len(v.RoleTypes))
		for _, r := range v.RoleTypes {
			r = strings.TrimSpace(strings.ToLower(r))
			if r != "" {
				roleSet[r] = struct{}{}
			}
		}
		for _, a := range assigns {
			m, ok := idx.missionByID[a.MissionID]
			if !ok {
				continue
			}
			needed := strings.TrimSpace(strings.ToLower(m.RoleType))
			if needed == "" {
				continue
			}
			if _, ok := roleSet[needed]; ok {
				continue
			}
			ents := []EntityRef{
				{Type: EntityVolunteer, ID: volID},
				{Type: EntityMission, ID: m.ID},
				{Type: EntityAssignment, ID: a.ID},
			}
			out = append(out, Warning{
				ID:       stableID(KindRoleMismatch, ents),
				Kind:     KindRoleMismatch,
				Severity: SeverityWarn,
				Message:  fmt.Sprintf("%s %s n'a pas le rôle « %s ».", v.FirstName, v.LastName, m.RoleType),
				Entities: ents,
			})
		}
	}
	return out
}
