package assignment

import (
	"errors"
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
	if _, err := s.DB.Exec(`INSERT INTO missions (vs_id, day, start_time, end_time, role_type, headcount) VALUES (1, 1, 'a', 'b', 'R', 1)`); err != nil {
		t.Fatalf("seed mission: %v", err)
	}
	if _, err := s.DB.Exec(`INSERT INTO volunteers (first_name, last_name, phone) VALUES ('A','B','+33611111111')`); err != nil {
		t.Fatalf("seed v: %v", err)
	}
	return NewStore(s.DB)
}

func TestStore_CreateAndUnique(t *testing.T) {
	s := newTestStore(t)
	a, err := s.Create(Input{MissionID: 1, VolunteerID: 1})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if a.ID == 0 {
		t.Fatalf("missing id")
	}
	if _, err := s.Create(Input{MissionID: 1, VolunteerID: 1}); !errors.Is(err, ErrDuplicate) {
		t.Fatalf("err = %v, want ErrDuplicate", err)
	}
}

func TestStore_ListForVolunteer(t *testing.T) {
	s := newTestStore(t)
	if _, err := s.Create(Input{MissionID: 1, VolunteerID: 1}); err != nil {
		t.Fatalf("Create: %v", err)
	}
	xs, err := s.ListForVolunteer(1)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(xs) != 1 {
		t.Fatalf("len = %d, want 1", len(xs))
	}
}

func TestStore_Delete(t *testing.T) {
	s := newTestStore(t)
	a, _ := s.Create(Input{MissionID: 1, VolunteerID: 1})
	if err := s.Delete(a.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if err := s.Delete(a.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("re-delete err = %v, want ErrNotFound", err)
	}
}

func TestStore_DeletePair(t *testing.T) {
	s := newTestStore(t)
	if _, err := s.Create(Input{MissionID: 1, VolunteerID: 1}); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if err := s.DeletePair(1, 1); err != nil {
		t.Fatalf("DeletePair: %v", err)
	}
}
