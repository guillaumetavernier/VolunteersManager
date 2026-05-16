package roadbook

import (
	"errors"
	"fmt"
	"sort"
)

// ErrVolunteerNotFound is returned by BuildVolunteerData when the id is not in
// the loaded snapshot.
var ErrVolunteerNotFound = errors.New("roadbook: volunteer not found")

// BuildVolunteerData composes the typed per-volunteer payload from an
// EventState snapshot. The result is fully sorted and deterministic.
func BuildVolunteerData(state EventState, volunteerID int64) (VolunteerRoadbook, error) {
	prof, ok := state.VolunteerByID[volunteerID]
	if !ok {
		return VolunteerRoadbook{}, ErrVolunteerNotFound
	}
	out := VolunteerRoadbook{
		EventName:           state.EventName,
		EventStartDate:      state.StartDate,
		EventEndDate:        state.EndDate,
		LogoPath:            state.LogoPath,
		SponsorPath:         state.SponsorPath,
		CoordinatorName:     state.CoordName,
		CoordinatorPhone:    state.CoordPhone,
		VolunteerID:         prof.ID,
		FirstName:           prof.FirstName,
		LastName:            prof.LastName,
		Phone:               prof.Phone,
		Email:               prof.Email,
		GeneralInfo:         prof.GeneralInfo,
		CustomizableMessage: prof.CustomizableMessage,
		DefaultVSID:         prof.DefaultVSID,
		References:          state.References,
	}
	if prof.EmergencyName != "" || prof.EmergencyPhone != "" {
		out.EmergencyContact = trimSep(prof.EmergencyName, prof.EmergencyPhone)
	}
	if defVS, ok := state.VSByID[prof.DefaultVSID]; ok {
		out.DefaultVSName = defVS.Name
	}

	// Build day → blocks.
	byDay := map[int]*DayBlock{}
	ensureDay := func(d int) *DayBlock {
		if _, ok := byDay[d]; !ok {
			byDay[d] = &DayBlock{Day: d}
		}
		return byDay[d]
	}

	// Missions the volunteer is assigned to.
	assignedMissions := []int64{}
	for _, a := range state.Engine.Assignments {
		if a.VolunteerID == volunteerID {
			assignedMissions = append(assignedMissions, a.MissionID)
		}
	}
	sort.Slice(assignedMissions, func(i, j int) bool { return assignedMissions[i] < assignedMissions[j] })

	// Volunteer name lookup (cached for co-staff listing).
	nameOf := func(id int64) string {
		p, ok := state.VolunteerByID[id]
		if !ok {
			return fmt.Sprintf("#%d", id)
		}
		return p.FirstName + " " + p.LastName
	}
	phoneOf := func(id int64) string {
		p, ok := state.VolunteerByID[id]
		if !ok {
			return ""
		}
		return p.Phone
	}

	// Index assignments by mission for co-staff listing.
	coStaffByMission := map[int64][]int64{}
	for _, a := range state.Engine.Assignments {
		coStaffByMission[a.MissionID] = append(coStaffByMission[a.MissionID], a.VolunteerID)
	}
	for k := range coStaffByMission {
		sort.Slice(coStaffByMission[k], func(i, j int) bool { return coStaffByMission[k][i] < coStaffByMission[k][j] })
	}

	for _, mID := range assignedMissions {
		meta, ok := state.MissionByID[mID]
		if !ok {
			continue
		}
		d := ensureDay(meta.Day)
		mb := MissionBlock{
			MissionID: meta.ID,
			VSID:      meta.VSID,
			VSName:    meta.VSName,
			Title:     meta.Title,
			StartTime: meta.Start,
			EndTime:   meta.End,
			RoleType:  meta.RoleType,
		}
		for _, peer := range coStaffByMission[mID] {
			if peer == volunteerID {
				continue
			}
			mb.CoStaff = append(mb.CoStaff, CoStaff{
				ID:    peer,
				Name:  nameOf(peer),
				Role:  meta.RoleType,
				Phone: phoneOf(peer),
			})
		}
		d.Missions = append(d.Missions, mb)
	}

	// Trips: the volunteer may be driver or passenger.
	for _, tr := range state.Engine.Trips {
		isDriver := tr.DriverID == volunteerID
		isPassenger := false
		for _, st := range tr.Stops {
			for _, vid := range st.Board {
				if vid == volunteerID {
					isPassenger = true
				}
			}
		}
		if !isDriver && !isPassenger {
			continue
		}
		d := ensureDay(tr.Day)
		tb := TripBlock{TripID: tr.ID, IsDriver: isDriver}
		seenCo := map[int64]bool{}
		// Stops are sorted by sequence in LoadState already.
		for _, st := range tr.Stops {
			vsName := ""
			if v, ok := state.VSByID[st.VSID]; ok {
				vsName = v.Name
			}
			tb.Stops = append(tb.Stops, TripStopRow{
				Sequence: st.Sequence,
				VSID:     st.VSID,
				VSName:   vsName,
				Time:     fmtTime(st.TimeMin),
			})
			for _, vid := range st.Board {
				if vid == volunteerID || seenCo[vid] {
					continue
				}
				seenCo[vid] = true
				tb.CoPassengers = append(tb.CoPassengers, CoPassenger{
					ID:    vid,
					Name:  nameOf(vid),
					Phone: phoneOf(vid),
					Role:  "Passager",
				})
			}
		}
		if !isDriver {
			// Driver appears as a co-passenger of any rider.
			driverID := tr.DriverID
			if driverID != 0 && driverID != volunteerID && !seenCo[driverID] {
				tb.CoPassengers = append(tb.CoPassengers, CoPassenger{
					ID:    driverID,
					Name:  nameOf(driverID),
					Phone: phoneOf(driverID),
					Role:  "Conducteur",
				})
			}
		}
		sort.Slice(tb.CoPassengers, func(i, j int) bool { return tb.CoPassengers[i].ID < tb.CoPassengers[j].ID })
		d.Trips = append(d.Trips, tb)
	}

	// Idle blocks: insert between consecutive blocks (>30min gap) on the same day.
	// Build timeline first.
	days := make([]int, 0, len(byDay))
	for d := range byDay {
		days = append(days, d)
	}
	sort.Ints(days)
	for _, d := range days {
		db := byDay[d]
		// Sort missions + trips by start time then by ID for stability.
		sort.Slice(db.Missions, func(i, j int) bool {
			if db.Missions[i].StartTime == db.Missions[j].StartTime {
				return db.Missions[i].MissionID < db.Missions[j].MissionID
			}
			return db.Missions[i].StartTime < db.Missions[j].StartTime
		})
		sort.Slice(db.Trips, func(i, j int) bool {
			si := tripStartTime(db.Trips[i])
			sj := tripStartTime(db.Trips[j])
			if si == sj {
				return db.Trips[i].TripID < db.Trips[j].TripID
			}
			return si < sj
		})
		// Combine into timeline.
		for i := range db.Missions {
			m := &db.Missions[i]
			db.Timeline = append(db.Timeline, TimelineEntry{Kind: KindMission, Mission: m, SortKey: m.StartTime})
		}
		for i := range db.Trips {
			t := &db.Trips[i]
			db.Timeline = append(db.Timeline, TimelineEntry{Kind: KindTrip, Trip: t, SortKey: tripStartTime(*t)})
		}
		sort.SliceStable(db.Timeline, func(i, j int) bool { return db.Timeline[i].SortKey < db.Timeline[j].SortKey })
		// Insert idle blocks between entries whose end < next entry's start - 30 min.
		var withIdle []TimelineEntry
		prevEnd := ""
		for _, e := range db.Timeline {
			start := e.SortKey
			end := entryEnd(e)
			if prevEnd != "" && start != "" && minutesBetween(prevEnd, start) >= 30 {
				idle := IdleBlock{FromTime: prevEnd, ToTime: start}
				db.Idles = append(db.Idles, idle)
				ip := &db.Idles[len(db.Idles)-1]
				withIdle = append(withIdle, TimelineEntry{Kind: KindIdle, Idle: ip, SortKey: prevEnd})
			}
			withIdle = append(withIdle, e)
			if end > prevEnd {
				prevEnd = end
			}
		}
		db.Timeline = withIdle
		out.Days = append(out.Days, *db)
	}

	return out, nil
}

func tripStartTime(t TripBlock) string {
	if len(t.Stops) == 0 {
		return ""
	}
	return t.Stops[0].Time
}

func tripEndTime(t TripBlock) string {
	if len(t.Stops) == 0 {
		return ""
	}
	return t.Stops[len(t.Stops)-1].Time
}

func entryEnd(e TimelineEntry) string {
	switch e.Kind {
	case KindMission:
		if e.Mission != nil {
			return e.Mission.EndTime
		}
	case KindTrip:
		if e.Trip != nil {
			return tripEndTime(*e.Trip)
		}
	}
	return ""
}

func fmtTime(absMinutes int) string {
	day := absMinutes / (24 * 60)
	_ = day
	inDay := absMinutes - day*24*60
	h := inDay / 60
	m := inDay % 60
	return fmt.Sprintf("%02d:%02d", h, m)
}

func minutesBetween(a, b string) int {
	if len(a) < 5 || len(b) < 5 {
		return 0
	}
	pa := parseHM(a)
	pb := parseHM(b)
	return pb - pa
}

func parseHM(s string) int {
	if len(s) < 5 || s[2] != ':' {
		return 0
	}
	h := int(s[0]-'0')*10 + int(s[1]-'0')
	m := int(s[3]-'0')*10 + int(s[4]-'0')
	return h*60 + m
}

func trimSep(a, b string) string {
	if a == "" {
		return b
	}
	if b == "" {
		return a
	}
	return a + " — " + b
}
