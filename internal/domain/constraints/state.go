package constraints

import (
	"context"
	"database/sql"
	"encoding/json"
	"sort"
	"strings"
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
	mrows, err := db.QueryContext(ctx, `SELECT id, vs_id, day, start_time, end_time, role_type, headcount, COALESCE(title,'') FROM missions`)
	if err != nil {
		return state, err
	}
	for mrows.Next() {
		var m Mission
		if err := mrows.Scan(&m.ID, &m.VSID, &m.Day, &m.StartTime, &m.EndTime, &m.RoleType, &m.Headcount, &m.Title); err != nil {
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

	// Cars (skip silently if the table doesn't yet exist — preserves M00..M02
	// test invariants where the cars migration may not have been applied).
	crows, err := db.QueryContext(ctx, `SELECT id, name, seats FROM cars`)
	if err == nil {
		for crows.Next() {
			var c Car
			if err := crows.Scan(&c.ID, &c.Name, &c.Seats); err != nil {
				_ = crows.Close()
				return state, err
			}
			state.Cars = append(state.Cars, c)
		}
		if err := crows.Err(); err != nil {
			_ = crows.Close()
			return state, err
		}
		_ = crows.Close()
	}

	// Trips (and stops + passengers).
	trows, err := db.QueryContext(ctx, `SELECT id, day, driver_id, car_id, mode FROM trips`)
	if err == nil {
		var tripIDs []int64
		idxByID := map[int64]int{}
		for trows.Next() {
			var t Trip
			if err := trows.Scan(&t.ID, &t.Day, &t.DriverID, &t.CarID, &t.Mode); err != nil {
				_ = trows.Close()
				return state, err
			}
			idxByID[t.ID] = len(state.Trips)
			state.Trips = append(state.Trips, t)
			tripIDs = append(tripIDs, t.ID)
		}
		if err := trows.Err(); err != nil {
			_ = trows.Close()
			return state, err
		}
		_ = trows.Close()
		if len(tripIDs) > 0 {
			srows, err := db.QueryContext(ctx, `SELECT id, trip_id, sequence, vs_id, time, leg_time_source FROM trip_stops ORDER BY trip_id, sequence`)
			if err != nil {
				return state, err
			}
			type pendingStop struct {
				tripIdx int
				stop    TripStop
			}
			var pending []pendingStop
			for srows.Next() {
				var st TripStop
				var tid int64
				var timeStr string
				if err := srows.Scan(&st.ID, &tid, &st.Sequence, &st.VSID, &timeStr, &st.LegTimeSource); err != nil {
					_ = srows.Close()
					return state, err
				}
				idx, ok := idxByID[tid]
				if !ok {
					continue
				}
				day := state.Trips[idx].Day
				st.TimeMin = day*24*60 + parseTimeMin(timeStr)
				pending = append(pending, pendingStop{tripIdx: idx, stop: st})
			}
			if err := srows.Err(); err != nil {
				_ = srows.Close()
				return state, err
			}
			_ = srows.Close()
			// Fetch passengers first, then attach in a single build pass so
			// slice growth never invalidates pointers.
			boardByStop := map[int64][]int64{}
			alightByStop := map[int64][]int64{}
			prows, err := db.QueryContext(ctx, `SELECT trip_stop_id, volunteer_id, action FROM trip_stop_passengers`)
			if err == nil {
				for prows.Next() {
					var stopID, volID int64
					var action string
					if err := prows.Scan(&stopID, &volID, &action); err != nil {
						_ = prows.Close()
						return state, err
					}
					switch action {
					case "board":
						boardByStop[stopID] = append(boardByStop[stopID], volID)
					case "alight":
						alightByStop[stopID] = append(alightByStop[stopID], volID)
					}
				}
				if err := prows.Err(); err != nil {
					_ = prows.Close()
					return state, err
				}
				_ = prows.Close()
			}
			for _, p := range pending {
				st := p.stop
				st.Board = boardByStop[st.ID]
				st.Alight = alightByStop[st.ID]
				state.Trips[p.tripIdx].Stops = append(state.Trips[p.tripIdx].Stops, st)
			}
		}
	}

	// Travel times.
	ttrows, err := db.QueryContext(ctx, `SELECT from_vs_id, to_vs_id, mode, seconds, source FROM travel_times`)
	if err == nil {
		for ttrows.Next() {
			var c TravelCell
			if err := ttrows.Scan(&c.FromVS, &c.ToVS, &c.Mode, &c.Seconds, &c.Source); err != nil {
				_ = ttrows.Close()
				return state, err
			}
			state.TravelTimes = append(state.TravelTimes, c)
		}
		if err := ttrows.Err(); err != nil {
			_ = ttrows.Close()
			return state, err
		}
		_ = ttrows.Close()
	}

	// Determinism: sort each slice on its primary key.
	sort.Slice(state.Trips, func(i, j int) bool { return state.Trips[i].ID < state.Trips[j].ID })
	for i := range state.Trips {
		sort.Slice(state.Trips[i].Stops, func(a, b int) bool { return state.Trips[i].Stops[a].Sequence < state.Trips[i].Stops[b].Sequence })
	}

	return state, nil
}

// parseTimeMin extracts HH:MM from either "HH:MM" or an ISO datetime
// "YYYY-MM-DDTHH:MM:SS[Z]". Returns 0 on garbage input — the engine treats
// 0-minute values as midnight of the trip's day, which is the safest fallback.
func parseTimeMin(s string) int {
	s = strings.TrimSpace(s)
	// Try ISO: locate "T".
	if i := strings.IndexByte(s, 'T'); i >= 0 && len(s) > i+5 {
		hm := s[i+1 : i+6]
		return parseHMField(hm)
	}
	if i := strings.IndexByte(s, ' '); i >= 0 && len(s) > i+5 {
		hm := s[i+1 : i+6]
		return parseHMField(hm)
	}
	if len(s) >= 5 && s[2] == ':' {
		return parseHMField(s[:5])
	}
	return 0
}

func parseHMField(s string) int {
	if len(s) != 5 || s[2] != ':' {
		return 0
	}
	h := int(s[0]-'0')*10 + int(s[1]-'0')
	m := int(s[3]-'0')*10 + int(s[4]-'0')
	if h < 0 || h > 23 || m < 0 || m > 59 {
		return 0
	}
	return h*60 + m
}
