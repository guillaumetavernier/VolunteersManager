package roadbook

import (
	"github.com/guillaumetavernier/volunteersmanager/internal/domain/constraints"
)

// fixtureState builds the 5-volunteer / 10-mission / 2-trip / 2-day snapshot
// used by golden + table-driven tests. All inputs are constants — no DB.
func fixtureState() EventState {
	state := EventState{
		EventName:     "Trail Demo",
		StartDate:     "2026-06-01",
		EndDate:       "2026-06-02",
		CoordName:     "Coord Test",
		CoordPhone:    "+33611223344",
		VolunteerByID: map[int64]VolunteerProfile{},
		MissionByID:   map[int64]MissionMeta{},
		VSByID:        map[int64]VSReference{},
	}
	vs := []VolunteerProfile{
		{ID: 1, FirstName: "Alice", LastName: "Aigle", Phone: "+33611111111", DefaultVSID: 1},
		{ID: 2, FirstName: "Bob", LastName: "Belier", Phone: "+33622222222", DefaultVSID: 1},
		{ID: 3, FirstName: "Carla", LastName: "Cigogne", Phone: "+33633333333", DefaultVSID: 2},
		{ID: 4, FirstName: "Dan", LastName: "Dauphin", Phone: "+33644444444", DefaultVSID: 2},
		{ID: 5, FirstName: "Eve", LastName: "Elan", Phone: "+33655555555", DefaultVSID: 3},
	}
	for _, v := range vs {
		state.VolunteerByID[v.ID] = v
		state.VolunteerIDs = append(state.VolunteerIDs, v.ID)
	}
	vsList := []VSReference{
		{ID: 1, Name: "Col du Lac", Lat: 45.1, Lon: 6.1},
		{ID: 2, Name: "Refuge Nord", Lat: 45.2, Lon: 6.2},
		{ID: 3, Name: "Source", Lat: 45.3, Lon: 6.3},
	}
	for _, v := range vsList {
		state.VSByID[v.ID] = v
		state.References = append(state.References, v)
	}
	mm := []MissionMeta{
		{ID: 1, VSID: 1, VSName: "Col du Lac", Day: 0, Start: "08:00", End: "12:00", RoleType: "ravito", Title: "Matin ravito"},
		{ID: 2, VSID: 1, VSName: "Col du Lac", Day: 0, Start: "12:00", End: "14:00", RoleType: "balise"},
		{ID: 3, VSID: 1, VSName: "Col du Lac", Day: 0, Start: "14:00", End: "18:00", RoleType: "ravito"},
		{ID: 4, VSID: 2, VSName: "Refuge Nord", Day: 0, Start: "09:00", End: "13:00", RoleType: "signaleur"},
		{ID: 5, VSID: 2, VSName: "Refuge Nord", Day: 0, Start: "13:00", End: "17:00", RoleType: "signaleur"},
		{ID: 6, VSID: 3, VSName: "Source", Day: 1, Start: "08:00", End: "12:00", RoleType: "ravito"},
		{ID: 7, VSID: 3, VSName: "Source", Day: 1, Start: "12:00", End: "16:00", RoleType: "ravito"},
		{ID: 8, VSID: 1, VSName: "Col du Lac", Day: 1, Start: "10:00", End: "14:00", RoleType: "balise"},
		{ID: 9, VSID: 2, VSName: "Refuge Nord", Day: 1, Start: "09:00", End: "12:00", RoleType: "signaleur"},
		{ID: 10, VSID: 2, VSName: "Refuge Nord", Day: 1, Start: "14:00", End: "18:00", RoleType: "signaleur"},
	}
	for _, m := range mm {
		state.MissionByID[m.ID] = m
		state.Engine.Missions = append(state.Engine.Missions, constraints.Mission{
			ID: m.ID, VSID: m.VSID, Day: m.Day, StartTime: m.Start, EndTime: m.End,
			RoleType: m.RoleType, Headcount: 1, Title: m.Title,
		})
	}
	assigns := []struct{ mid, vid int64 }{
		{1, 1}, {1, 2},
		{2, 1},
		{3, 1},
		{4, 3}, {4, 4},
		{5, 3},
		{6, 5},
		{7, 5},
		{8, 2},
		{9, 4},
		{10, 4},
	}
	for i, a := range assigns {
		state.Engine.Assignments = append(state.Engine.Assignments, constraints.Assignment{
			ID:          int64(i + 1),
			MissionID:   a.mid,
			VolunteerID: a.vid,
		})
	}
	state.Engine.Trips = []constraints.Trip{
		{
			ID: 1, Day: 0, DriverID: 2, CarID: 1, Mode: "drive",
			Stops: []constraints.TripStop{
				{ID: 1, Sequence: 0, VSID: 1, TimeMin: 0*1440 + 7*60, Board: []int64{3}},
				{ID: 2, Sequence: 1, VSID: 2, TimeMin: 0*1440 + 8*60, Alight: []int64{3}},
			},
		},
		{
			ID: 2, Day: 1, DriverID: 4, CarID: 1, Mode: "drive",
			Stops: []constraints.TripStop{
				{ID: 3, Sequence: 0, VSID: 2, TimeMin: 1*1440 + 7*60, Board: []int64{1}},
				{ID: 4, Sequence: 1, VSID: 3, TimeMin: 1*1440 + 8*60, Alight: []int64{1}},
			},
		},
	}
	return state
}
