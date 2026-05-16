package constraints

import (
	"context"
	"database/sql"
	"encoding/json"
)

// LoadState reads everything the engine needs in one snapshot. The loader is
// pragmatic: separate queries inside a single read transaction, no joins.
func LoadState(ctx context.Context, db *sql.DB) (EventState, error) {
	state := EventState{Settings: DefaultSettings()}

	// Volunteers.
	rows, err := db.QueryContext(ctx, `SELECT id, first_name, last_name, phone, role_types, availability, archived FROM volunteers`)
	if err != nil {
		return state, err
	}
	for rows.Next() {
		var v Volunteer
		var rolesRaw, availRaw string
		var archived int
		if err := rows.Scan(&v.ID, &v.FirstName, &v.LastName, &v.Phone, &rolesRaw, &availRaw, &archived); err != nil {
			_ = rows.Close()
			return state, err
		}
		v.Archived = archived != 0
		if rolesRaw != "" {
			_ = json.Unmarshal([]byte(rolesRaw), &v.RoleTypes)
		}
		if availRaw != "" {
			var raws []struct {
				Day   int    `json:"day"`
				Start string `json:"start"`
				End   string `json:"end"`
			}
			_ = json.Unmarshal([]byte(availRaw), &raws)
			for _, w := range raws {
				v.Availability = append(v.Availability, AvailabilityWindow{Day: w.Day, Start: w.Start, End: w.End})
			}
		}
		state.Volunteers = append(state.Volunteers, v)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return state, err
	}
	_ = rows.Close()

	// Missions.
	mrows, err := db.QueryContext(ctx, `SELECT id, day, start_time, end_time, role_type, headcount, COALESCE(title,'') FROM missions`)
	if err != nil {
		return state, err
	}
	for mrows.Next() {
		var m Mission
		if err := mrows.Scan(&m.ID, &m.Day, &m.StartTime, &m.EndTime, &m.RoleType, &m.Headcount, &m.Title); err != nil {
			_ = mrows.Close()
			return state, err
		}
		state.Missions = append(state.Missions, m)
	}
	if err := mrows.Err(); err != nil {
		_ = mrows.Close()
		return state, err
	}
	_ = mrows.Close()

	// Assignments.
	arows, err := db.QueryContext(ctx, `SELECT id, mission_id, volunteer_id FROM assignments`)
	if err != nil {
		return state, err
	}
	for arows.Next() {
		var a Assignment
		if err := arows.Scan(&a.ID, &a.MissionID, &a.VolunteerID); err != nil {
			_ = arows.Close()
			return state, err
		}
		state.Assignments = append(state.Assignments, a)
	}
	if err := arows.Err(); err != nil {
		_ = arows.Close()
		return state, err
	}
	_ = arows.Close()

	return state, nil
}
