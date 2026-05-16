package constraints

import (
	"reflect"
	"testing"
)

func vol(id int64, first, last, phone string, roles []string, avail []AvailabilityWindow) Volunteer {
	return Volunteer{ID: id, FirstName: first, LastName: last, Phone: phone, RoleTypes: roles, Availability: avail}
}

func miss(id int64, day int, start, end, role string, hc int) Mission {
	return Mission{ID: id, Day: day, StartTime: start, EndTime: end, RoleType: role, Headcount: hc, Title: ""}
}

func assg(id, missID, volID int64) Assignment {
	return Assignment{ID: id, MissionID: missID, VolunteerID: volID}
}

func kindsOf(ws []Warning) []WarningKind {
	out := make([]WarningKind, len(ws))
	for i, w := range ws {
		out[i] = w.Kind
	}
	return out
}

func TestCompute_DoubleBooking(t *testing.T) {
	state := EventState{
		Volunteers: []Volunteer{vol(1, "Alice", "A", "0600000000", []string{"poste"}, nil)},
		Missions: []Mission{
			miss(10, 0, "08:00", "10:00", "poste", 1),
			miss(11, 0, "09:00", "11:00", "poste", 1),
		},
		Assignments: []Assignment{assg(100, 10, 1), assg(101, 11, 1)},
	}
	ws := Compute(state)
	found := false
	for _, w := range ws {
		if w.Kind == KindDoubleBooking {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected double_booking, got %v", kindsOf(ws))
	}
}

func TestCompute_DoubleBooking_NoOverlap(t *testing.T) {
	state := EventState{
		Volunteers: []Volunteer{vol(1, "A", "B", "0600000000", []string{"poste"}, nil)},
		Missions: []Mission{
			miss(10, 0, "08:00", "10:00", "poste", 1),
			miss(11, 0, "10:00", "12:00", "poste", 1),
		},
		Assignments: []Assignment{assg(100, 10, 1), assg(101, 11, 1)},
	}
	for _, w := range Compute(state) {
		if w.Kind == KindDoubleBooking {
			t.Fatalf("unexpected double_booking")
		}
	}
}

func TestCompute_RoleMismatch_CaseInsensitive(t *testing.T) {
	state := EventState{
		Volunteers: []Volunteer{vol(1, "A", "B", "0600000000", []string{"Signaleur"}, nil)},
		Missions:   []Mission{miss(10, 0, "08:00", "10:00", "SIGNALEUR", 1)},
		Assignments: []Assignment{assg(100, 10, 1)},
	}
	for _, w := range Compute(state) {
		if w.Kind == KindRoleMismatch {
			t.Fatalf("unexpected role_mismatch: %s", w.Message)
		}
	}
}

func TestCompute_RoleMismatch_Differs(t *testing.T) {
	state := EventState{
		Volunteers: []Volunteer{vol(1, "A", "B", "0600000000", []string{"poste"}, nil)},
		Missions:   []Mission{miss(10, 0, "08:00", "10:00", "ravitaillement", 1)},
		Assignments: []Assignment{assg(100, 10, 1)},
	}
	found := false
	for _, w := range Compute(state) {
		if w.Kind == KindRoleMismatch {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected role_mismatch")
	}
}

func TestCompute_AvailabilityViolation(t *testing.T) {
	avail := []AvailabilityWindow{{Day: 0, Start: "09:00", End: "11:00"}}
	state := EventState{
		Volunteers: []Volunteer{vol(1, "A", "B", "0600000000", []string{"poste"}, avail)},
		Missions:   []Mission{miss(10, 0, "08:00", "10:00", "poste", 1)},
		Assignments: []Assignment{assg(100, 10, 1)},
	}
	found := false
	for _, w := range Compute(state) {
		if w.Kind == KindAvailabilityViolation {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected availability_violation")
	}
}

func TestCompute_AvailabilityCovered(t *testing.T) {
	avail := []AvailabilityWindow{{Day: 0, Start: "07:00", End: "12:00"}}
	state := EventState{
		Volunteers: []Volunteer{vol(1, "A", "B", "0600000000", []string{"poste"}, avail)},
		Missions:   []Mission{miss(10, 0, "08:00", "10:00", "poste", 1)},
		Assignments: []Assignment{assg(100, 10, 1)},
	}
	for _, w := range Compute(state) {
		if w.Kind == KindAvailabilityViolation {
			t.Fatalf("unexpected availability_violation")
		}
	}
}

func TestCompute_ExcessiveDuty(t *testing.T) {
	state := EventState{
		Volunteers: []Volunteer{vol(1, "A", "B", "0600000000", []string{"poste"}, nil)},
		Missions: []Mission{
			miss(10, 0, "06:00", "12:00", "poste", 1),
			miss(11, 0, "13:00", "18:00", "poste", 1),
		},
		Assignments: []Assignment{assg(100, 10, 1), assg(101, 11, 1)},
	}
	found := false
	for _, w := range Compute(state) {
		if w.Kind == KindExcessiveDuty {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected excessive_duty, got %v", kindsOf(Compute(state)))
	}
}

func TestCompute_NoBreak(t *testing.T) {
	state := EventState{
		Volunteers: []Volunteer{vol(1, "A", "B", "0600000000", []string{"poste"}, nil)},
		Missions: []Mission{
			miss(10, 0, "06:00", "10:00", "poste", 1),
			miss(11, 0, "10:00", "13:00", "poste", 1),
		},
		Assignments: []Assignment{assg(100, 10, 1), assg(101, 11, 1)},
	}
	found := false
	for _, w := range Compute(state) {
		if w.Kind == KindNoBreak {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected no_break")
	}
}

func TestCompute_Understaffed_Overstaffed(t *testing.T) {
	state := EventState{
		Volunteers: []Volunteer{
			vol(1, "A", "B", "0600000000", []string{"poste"}, nil),
			vol(2, "C", "D", "0600000001", []string{"poste"}, nil),
		},
		Missions: []Mission{
			miss(10, 0, "08:00", "10:00", "poste", 2), // under (0/2)
			miss(11, 0, "10:00", "12:00", "poste", 1), // over (2/1)
		},
		Assignments: []Assignment{assg(100, 11, 1), assg(101, 11, 2)},
	}
	var under, over bool
	for _, w := range Compute(state) {
		if w.Kind == KindUnderstaffed {
			under = true
		}
		if w.Kind == KindOverstaffed {
			over = true
		}
	}
	if !under || !over {
		t.Fatalf("expected both, got under=%v over=%v", under, over)
	}
}

func TestCompute_Unassigned(t *testing.T) {
	state := EventState{
		Volunteers: []Volunteer{vol(1, "A", "B", "0600000000", nil, nil)},
	}
	found := false
	for _, w := range Compute(state) {
		if w.Kind == KindUnassigned {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected unassigned")
	}
}

func TestCompute_MissingPhone(t *testing.T) {
	state := EventState{
		Volunteers:  []Volunteer{vol(1, "A", "B", "", []string{"poste"}, nil)},
		Missions:    []Mission{miss(10, 0, "08:00", "10:00", "poste", 1)},
		Assignments: []Assignment{assg(100, 10, 1)},
	}
	found := false
	for _, w := range Compute(state) {
		if w.Kind == KindMissingPhone {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected missing_phone")
	}
}

func TestCompute_Determinism(t *testing.T) {
	state := EventState{
		Volunteers: []Volunteer{
			vol(1, "A", "B", "0600000000", []string{"poste"}, nil),
			vol(2, "C", "D", "", []string{"poste"}, nil),
		},
		Missions: []Mission{
			miss(10, 0, "08:00", "10:00", "poste", 1),
			miss(11, 0, "09:00", "11:00", "poste", 1),
		},
		Assignments: []Assignment{assg(100, 10, 1), assg(101, 11, 1), assg(102, 10, 2)},
	}
	a := Compute(state)
	b := Compute(state)
	if !reflect.DeepEqual(a, b) {
		t.Fatalf("non-deterministic: %v vs %v", a, b)
	}
	// Confirm sorted by ID.
	for i := 1; i < len(a); i++ {
		if a[i-1].ID > a[i].ID {
			t.Fatalf("not sorted: %s > %s", a[i-1].ID, a[i].ID)
		}
	}
}

func TestStableID_SameEntities_SameID(t *testing.T) {
	a := stableID(KindDoubleBooking, []EntityRef{
		{Type: EntityVolunteer, ID: 1},
		{Type: EntityAssignment, ID: 2},
	})
	b := stableID(KindDoubleBooking, []EntityRef{
		{Type: EntityAssignment, ID: 2},
		{Type: EntityVolunteer, ID: 1},
	})
	if a != b {
		t.Fatalf("order should not change ID: %s != %s", a, b)
	}
}

func TestStableID_DifferentKind_DifferentID(t *testing.T) {
	a := stableID(KindDoubleBooking, []EntityRef{{Type: EntityVolunteer, ID: 1}})
	b := stableID(KindRoleMismatch, []EntityRef{{Type: EntityVolunteer, ID: 1}})
	if a == b {
		t.Fatalf("kind should affect ID")
	}
}
