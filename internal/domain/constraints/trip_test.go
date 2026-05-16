package constraints

import "testing"

func TestCompute_Stranded(t *testing.T) {
	state := EventState{
		Volunteers: []Volunteer{vol(1, "A", "B", "0600000000", []string{"poste"}, nil)},
		Missions: []Mission{
			{ID: 10, VSID: 1, Day: 0, StartTime: "08:00", EndTime: "10:00", RoleType: "poste", Headcount: 1},
			{ID: 11, VSID: 2, Day: 0, StartTime: "11:00", EndTime: "13:00", RoleType: "poste", Headcount: 1},
		},
		Assignments: []Assignment{assg(100, 10, 1), assg(101, 11, 1)},
	}
	found := false
	for _, w := range Compute(state) {
		if w.Kind == KindStranded {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected stranded")
	}
}

func TestCompute_StrandedClearsWhenTripCovers(t *testing.T) {
	state := EventState{
		Volunteers: []Volunteer{vol(1, "A", "B", "0600000000", []string{"poste"}, nil)},
		Missions: []Mission{
			{ID: 10, VSID: 1, Day: 0, StartTime: "08:00", EndTime: "10:00", RoleType: "poste", Headcount: 1},
			{ID: 11, VSID: 2, Day: 0, StartTime: "11:00", EndTime: "13:00", RoleType: "poste", Headcount: 1},
		},
		Assignments: []Assignment{assg(100, 10, 1), assg(101, 11, 1)},
		Cars:        []Car{{ID: 1, Name: "Fiat", Seats: 4}},
		Trips: []Trip{
			{
				ID: 1, Day: 0, DriverID: 2, CarID: 1, Mode: "drive",
				Stops: []TripStop{
					{ID: 1, Sequence: 0, VSID: 1, TimeMin: 10 * 60, Board: []int64{1}},
					{ID: 2, Sequence: 1, VSID: 2, TimeMin: 10*60 + 30, Alight: []int64{1}},
				},
			},
		},
	}
	for _, w := range Compute(state) {
		if w.Kind == KindStranded {
			t.Fatalf("stranded should have cleared with trip cover")
		}
	}
}

func TestCompute_InsufficientTravel(t *testing.T) {
	state := EventState{
		Volunteers: []Volunteer{vol(1, "A", "B", "0600000000", []string{"poste"}, nil)},
		Missions: []Mission{
			{ID: 10, VSID: 1, Day: 0, StartTime: "08:00", EndTime: "10:00", RoleType: "poste", Headcount: 1},
			{ID: 11, VSID: 2, Day: 0, StartTime: "10:05", EndTime: "12:00", RoleType: "poste", Headcount: 1},
		},
		Assignments: []Assignment{assg(100, 10, 1), assg(101, 11, 1)},
		TravelTimes: []TravelCell{
			{FromVS: 1, ToVS: 2, Mode: "drive", Seconds: 600, Source: "fallback"},
		},
	}
	found := false
	for _, w := range Compute(state) {
		if w.Kind == KindInsufficientTravel {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected insufficient_travel")
	}
}

func TestCompute_CapacityExceeded(t *testing.T) {
	state := EventState{
		Volunteers: []Volunteer{vol(1, "P1", "X", "0", nil, nil), vol(2, "P2", "X", "0", nil, nil), vol(3, "D", "X", "0", nil, nil)},
		Cars:       []Car{{ID: 1, Name: "Bike", Seats: 1}},
		Trips: []Trip{{
			ID: 1, Day: 0, DriverID: 3, CarID: 1, Mode: "drive",
			Stops: []TripStop{
				{ID: 1, Sequence: 0, VSID: 1, TimeMin: 0, Board: []int64{1, 2}},
				{ID: 2, Sequence: 1, VSID: 2, TimeMin: 30, Alight: []int64{1, 2}},
			},
		}},
	}
	found := false
	for _, w := range Compute(state) {
		if w.Kind == KindCapacityExceeded {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected capacity_exceeded")
	}
}

func TestCompute_DriverDoubleBook(t *testing.T) {
	state := EventState{
		Volunteers: []Volunteer{vol(1, "D", "X", "0", []string{"poste"}, nil)},
		Missions: []Mission{
			{ID: 10, VSID: 1, Day: 0, StartTime: "10:00", EndTime: "12:00", RoleType: "poste", Headcount: 1},
		},
		Assignments: []Assignment{assg(100, 10, 1)},
		Cars:        []Car{{ID: 1, Name: "Fiat", Seats: 4}},
		Trips: []Trip{{
			ID: 1, Day: 0, DriverID: 1, CarID: 1, Mode: "drive",
			Stops: []TripStop{
				{ID: 1, Sequence: 0, VSID: 1, TimeMin: 10*60 + 30},
				{ID: 2, Sequence: 1, VSID: 2, TimeMin: 11 * 60},
			},
		}},
	}
	found := false
	for _, w := range Compute(state) {
		if w.Kind == KindDriverDoubleBook {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected driver_double_book")
	}
}

func TestCompute_PassengerDoubleBookTwoTrips(t *testing.T) {
	state := EventState{
		Volunteers: []Volunteer{vol(1, "P", "X", "0", nil, nil), vol(2, "D", "X", "0", nil, nil)},
		Cars:       []Car{{ID: 1, Name: "Fiat", Seats: 4}},
		Trips: []Trip{
			{ID: 1, Day: 0, DriverID: 2, CarID: 1, Mode: "drive", Stops: []TripStop{
				{ID: 1, Sequence: 0, VSID: 1, TimeMin: 600, Board: []int64{1}},
				{ID: 2, Sequence: 1, VSID: 2, TimeMin: 660, Alight: []int64{1}},
			}},
			{ID: 2, Day: 0, DriverID: 2, CarID: 1, Mode: "drive", Stops: []TripStop{
				{ID: 3, Sequence: 0, VSID: 3, TimeMin: 630, Board: []int64{1}},
				{ID: 4, Sequence: 1, VSID: 4, TimeMin: 700, Alight: []int64{1}},
			}},
		},
	}
	found := false
	for _, w := range Compute(state) {
		if w.Kind == KindPassengerDoubleBook {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected passenger_double_book")
	}
}

func TestCompute_BoardWithoutAlight(t *testing.T) {
	state := EventState{
		Volunteers: []Volunteer{vol(1, "P", "X", "0", nil, nil)},
		Cars:       []Car{{ID: 1, Name: "Fiat", Seats: 4}},
		Trips: []Trip{{
			ID: 1, Day: 0, DriverID: 2, CarID: 1, Mode: "drive",
			Stops: []TripStop{
				{ID: 1, Sequence: 0, VSID: 1, TimeMin: 0, Board: []int64{1}},
				{ID: 2, Sequence: 1, VSID: 2, TimeMin: 30},
			},
		}},
	}
	found := false
	for _, w := range Compute(state) {
		if w.Kind == KindBoardWithoutAlight {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected board_without_alight")
	}
}

func TestCompute_AlightBeforeBoard(t *testing.T) {
	state := EventState{
		Volunteers: []Volunteer{vol(1, "P", "X", "0", nil, nil)},
		Cars:       []Car{{ID: 1, Name: "Fiat", Seats: 4}},
		Trips: []Trip{{
			ID: 1, Day: 0, DriverID: 2, CarID: 1, Mode: "drive",
			Stops: []TripStop{
				{ID: 1, Sequence: 0, VSID: 1, TimeMin: 0, Alight: []int64{1}},
				{ID: 2, Sequence: 1, VSID: 2, TimeMin: 30, Board: []int64{1}},
			},
		}},
	}
	found := false
	for _, w := range Compute(state) {
		if w.Kind == KindAlightBeforeBoard {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected alight_before_board")
	}
}
