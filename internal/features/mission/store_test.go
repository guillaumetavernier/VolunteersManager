package mission

import (
	"path/filepath"
	"testing"

	"github.com/guillaumetavernier/volunteersmanager/internal/store"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	dir := t.TempDir()
	s, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	if err := s.Migrate(); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	if _, err := s.DB.Exec(`INSERT INTO vs (name, lat, lon) VALUES ('VS1', 45, 6)`); err != nil {
		t.Fatalf("seed vs: %v", err)
	}
	return NewStore(s.DB)
}

func TestStore_CreateAndList(t *testing.T) {
	s := newTestStore(t)
	in := Input{VSID: 1, Day: 1, StartTime: "2026-06-01T08:00", EndTime: "2026-06-01T12:00", RoleType: "Ravitaillement", Headcount: 2}
	m, err := s.Create(in)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if m.ID == 0 || m.Headcount != 2 || m.Status != "under" || m.Assigned != 0 {
		t.Fatalf("got %+v", m)
	}
	vsID := int64(1)
	xs, err := s.List(Filter{VSID: &vsID})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(xs) != 1 {
		t.Fatalf("len = %d, want 1", len(xs))
	}
}

func TestStore_StaffingStatus(t *testing.T) {
	s := newTestStore(t)
	in := Input{VSID: 1, Day: 1, StartTime: "2026-06-01T08:00", EndTime: "2026-06-01T12:00", RoleType: "R", Headcount: 1}
	m, err := s.Create(in)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if _, err := s.DB.Exec(`INSERT INTO volunteers (first_name, last_name, phone) VALUES ('A','B','+33611111111')`); err != nil {
		t.Fatalf("seed v: %v", err)
	}
	if _, err := s.DB.Exec(`INSERT INTO assignments (mission_id, volunteer_id) VALUES (?, ?)`, m.ID, 1); err != nil {
		t.Fatalf("seed assignment: %v", err)
	}
	m2, _ := s.Get(m.ID)
	if m2.Assigned != 1 || m2.Status != "exact" {
		t.Fatalf("got %+v", m2)
	}
	if _, err := s.DB.Exec(`INSERT INTO volunteers (first_name, last_name, phone) VALUES ('C','D','+33611111112')`); err != nil {
		t.Fatalf("seed v2: %v", err)
	}
	if _, err := s.DB.Exec(`INSERT INTO assignments (mission_id, volunteer_id) VALUES (?, ?)`, m.ID, 2); err != nil {
		t.Fatalf("seed assignment2: %v", err)
	}
	m3, _ := s.Get(m.ID)
	if m3.Assigned != 2 || m3.Status != "over" {
		t.Fatalf("got %+v", m3)
	}
}

func TestStore_FilterByDayAndRole(t *testing.T) {
	s := newTestStore(t)
	_, _ = s.Create(Input{VSID: 1, Day: 1, StartTime: "a", EndTime: "b", RoleType: "Ravito"})
	_, _ = s.Create(Input{VSID: 1, Day: 2, StartTime: "a", EndTime: "b", RoleType: "Balisage"})
	d := 1
	xs, err := s.List(Filter{Day: &d})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(xs) != 1 || xs[0].Day != 1 {
		t.Fatalf("got %+v", xs)
	}
	role := "balisage"
	xs, err = s.List(Filter{Role: &role})
	if err != nil {
		t.Fatalf("List role: %v", err)
	}
	if len(xs) != 1 || xs[0].RoleType != "Balisage" {
		t.Fatalf("got %+v", xs)
	}
}

func TestStore_FilterByRace(t *testing.T) {
	s := newTestStore(t)
	_, _ = s.Create(Input{VSID: 1, Day: 1, StartTime: "a", EndTime: "b", RoleType: "X", TaggedRaceIDs: []int64{42}})
	_, _ = s.Create(Input{VSID: 1, Day: 1, StartTime: "a", EndTime: "b", RoleType: "Y", TaggedRaceIDs: []int64{}})
	race := int64(42)
	xs, err := s.List(Filter{Race: &race})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(xs) != 1 || xs[0].RoleType != "X" {
		t.Fatalf("got %+v", xs)
	}
}

func TestStore_PatchAndDelete(t *testing.T) {
	s := newTestStore(t)
	m, err := s.Create(Input{VSID: 1, Day: 1, StartTime: "a", EndTime: "b", RoleType: "R", Headcount: 1})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	hc := 5
	m2, err := s.Patch(m.ID, Patch{Headcount: &hc})
	if err != nil {
		t.Fatalf("Patch: %v", err)
	}
	if m2.Headcount != 5 {
		t.Fatalf("headcount = %d", m2.Headcount)
	}
	if err := s.Delete(m.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := s.Get(m.ID); err != ErrNotFound {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestStore_CountByVS(t *testing.T) {
	s := newTestStore(t)
	_, _ = s.Create(Input{VSID: 1, Day: 1, StartTime: "a", EndTime: "b", RoleType: "R"})
	_, _ = s.Create(Input{VSID: 1, Day: 1, StartTime: "a", EndTime: "b", RoleType: "R"})
	n, err := s.CountByVS(1)
	if err != nil {
		t.Fatalf("CountByVS: %v", err)
	}
	if n != 2 {
		t.Fatalf("n = %d, want 2", n)
	}
}

func TestStore_ScrubRaceTag(t *testing.T) {
	s := newTestStore(t)
	_, _ = s.Create(Input{VSID: 1, Day: 1, StartTime: "a", EndTime: "b", RoleType: "R", TaggedRaceIDs: []int64{1, 2, 3}})
	_, _ = s.Create(Input{VSID: 1, Day: 1, StartTime: "a", EndTime: "b", RoleType: "R", TaggedRaceIDs: []int64{2}})
	_, _ = s.Create(Input{VSID: 1, Day: 1, StartTime: "a", EndTime: "b", RoleType: "R", TaggedRaceIDs: []int64{}})
	if err := s.ScrubRaceTag(2); err != nil {
		t.Fatalf("ScrubRaceTag: %v", err)
	}
	xs, _ := s.List(Filter{})
	for _, m := range xs {
		for _, id := range m.TaggedRaceIDs {
			if id == 2 {
				t.Fatalf("race 2 still present: %+v", m.TaggedRaceIDs)
			}
		}
	}
}
