package car

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
	return NewStore(s.DB)
}

func mustInsertVolunteer(t *testing.T, s *Store, fn, ln string, canDrive bool) int64 {
	t.Helper()
	d := 0
	if canDrive {
		d = 1
	}
	res, err := s.DB.Exec(`INSERT INTO volunteers (first_name, last_name, phone, can_drive) VALUES (?, ?, ?, ?)`, fn, ln, "+33600000000", d)
	if err != nil {
		t.Fatalf("insert volunteer: %v", err)
	}
	id, _ := res.LastInsertId()
	return id
}

func TestStore_CreateAndUnique(t *testing.T) {
	s := newTestStore(t)
	c, err := s.Create(Input{Name: "Kangoo", Seats: 5})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if c.ID == 0 {
		t.Fatalf("missing ID")
	}
	if _, err := s.Create(Input{Name: "Kangoo", Seats: 7}); !errors.Is(err, ErrDuplicateName) {
		t.Fatalf("dup err = %v, want ErrDuplicateName", err)
	}
}

func TestStore_RejectsNonCanDriveDriver(t *testing.T) {
	s := newTestStore(t)
	id := mustInsertVolunteer(t, s, "A", "B", false)
	if _, err := s.Create(Input{Name: "X", Seats: 4, DefaultDriverID: &id}); !errors.Is(err, ErrDriverInvalid) {
		t.Fatalf("err = %v, want ErrDriverInvalid", err)
	}
	id2 := mustInsertVolunteer(t, s, "C", "D", true)
	if _, err := s.Create(Input{Name: "X", Seats: 4, DefaultDriverID: &id2}); err != nil {
		t.Fatalf("Create with valid driver: %v", err)
	}
}

func TestStore_PatchDriver(t *testing.T) {
	s := newTestStore(t)
	driver := mustInsertVolunteer(t, s, "C", "D", true)
	c, err := s.Create(Input{Name: "Y", Seats: 4})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	patched, err := s.Patch(c.ID, Patch{DefaultDriverID: &driver})
	if err != nil {
		t.Fatalf("Patch: %v", err)
	}
	if patched.DefaultDriverID == nil || *patched.DefaultDriverID != driver {
		t.Fatalf("driver not set")
	}
	// Clear driver with 0.
	zero := int64(0)
	patched, err = s.Patch(c.ID, Patch{DefaultDriverID: &zero})
	if err != nil {
		t.Fatalf("Patch clear: %v", err)
	}
	if patched.DefaultDriverID != nil {
		t.Fatalf("driver not cleared")
	}
}

func TestStore_Delete(t *testing.T) {
	s := newTestStore(t)
	c, _ := s.Create(Input{Name: "Z", Seats: 2})
	if err := s.Delete(c.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := s.Get(c.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}
