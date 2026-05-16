package roadbook

import (
	"testing"

	"github.com/guillaumetavernier/volunteersmanager/internal/domain/constraints"
)

func TestBuildVolunteerData_FixturePicksUpAssignmentsAndTrips(t *testing.T) {
	state := fixtureState()
	data, err := BuildVolunteerData(state, 1)
	if err != nil {
		t.Fatalf("gather: %v", err)
	}
	if data.FirstName != "Alice" || data.LastName != "Aigle" {
		t.Fatalf("identity wrong: %+v", data)
	}
	if len(data.Days) != 2 {
		t.Fatalf("days = %d, want 2", len(data.Days))
	}
	// Day 0 has 3 missions (1,2,3); Day 1 has trip + nothing else for Alice.
	if got := len(data.Days[0].Missions); got != 3 {
		t.Fatalf("day0 missions = %d, want 3", got)
	}
	if got := len(data.Days[1].Trips); got != 1 {
		t.Fatalf("day1 trips = %d, want 1", got)
	}
}

func TestBuildVolunteerData_NoAssignments(t *testing.T) {
	state := fixtureState()
	// New volunteer with no assignments.
	state.VolunteerByID[99] = VolunteerProfile{ID: 99, FirstName: "Empty", LastName: "Zero"}
	state.VolunteerIDs = append(state.VolunteerIDs, 99)
	data, err := BuildVolunteerData(state, 99)
	if err != nil {
		t.Fatalf("gather: %v", err)
	}
	if len(data.Days) != 0 {
		t.Fatalf("days = %d, want 0", len(data.Days))
	}
}

func TestBuildVolunteerData_NotFound(t *testing.T) {
	state := fixtureState()
	if _, err := BuildVolunteerData(state, 999); err != ErrVolunteerNotFound {
		t.Fatalf("err = %v, want ErrVolunteerNotFound", err)
	}
}

func TestBuildVolunteerData_DriverHasTripBlock(t *testing.T) {
	state := fixtureState()
	data, err := BuildVolunteerData(state, 2) // Bob drives trip 1 on day 0
	if err != nil {
		t.Fatalf("gather: %v", err)
	}
	if len(data.Days) == 0 {
		t.Fatalf("no days for driver")
	}
	if len(data.Days[0].Trips) != 1 || !data.Days[0].Trips[0].IsDriver {
		t.Fatalf("day0 trips = %+v", data.Days[0].Trips)
	}
}

func TestBuildVolunteerData_IdleInsertionBetweenSpacedMissions(t *testing.T) {
	state := EventState{
		VolunteerByID: map[int64]VolunteerProfile{1: {ID: 1, FirstName: "A", LastName: "B"}},
		MissionByID: map[int64]MissionMeta{
			1: {ID: 1, Day: 0, Start: "08:00", End: "09:00", VSID: 1, VSName: "VS1"},
			2: {ID: 2, Day: 0, Start: "12:00", End: "13:00", VSID: 1, VSName: "VS1"},
		},
		VSByID: map[int64]VSReference{1: {ID: 1, Name: "VS1"}},
	}
	state.Engine.Assignments = []constraints.Assignment{
		{ID: 1, MissionID: 1, VolunteerID: 1},
		{ID: 2, MissionID: 2, VolunteerID: 1},
	}
	data, err := BuildVolunteerData(state, 1)
	if err != nil {
		t.Fatalf("gather: %v", err)
	}
	if len(data.Days) != 1 {
		t.Fatalf("days=%d", len(data.Days))
	}
	if len(data.Days[0].Idles) != 1 {
		t.Fatalf("idles=%d want 1", len(data.Days[0].Idles))
	}
}

func TestBuildVolunteerData_CoStaffStripsSelf(t *testing.T) {
	state := fixtureState()
	data, err := BuildVolunteerData(state, 1) // Alice has co-staff Bob on mission 1
	if err != nil {
		t.Fatalf("gather: %v", err)
	}
	if len(data.Days) == 0 {
		t.Fatal("no days")
	}
	for _, m := range data.Days[0].Missions {
		if m.MissionID == 1 {
			if len(m.CoStaff) != 1 || m.CoStaff[0].Name != "Bob Belier" {
				t.Fatalf("co-staff = %+v, want [Bob Belier]", m.CoStaff)
			}
		}
	}
}
