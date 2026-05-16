package volunteer

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

func mustCreate(t *testing.T, s *Store, fn, ln, ph string) Volunteer {
	t.Helper()
	v, err := s.Create(Input{FirstName: fn, LastName: ln, Phone: ph})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	return v
}

func TestStore_CreateGetList(t *testing.T) {
	s := newTestStore(t)
	v := mustCreate(t, s, "Marie", "Dupont", "+33611111111")
	if v.ID == 0 {
		t.Fatalf("missing ID")
	}
	got, err := s.Get(v.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.FirstName != "Marie" || got.LastName != "Dupont" {
		t.Fatalf("got %+v", got)
	}
	xs, err := s.List(Filter{})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(xs) != 1 {
		t.Fatalf("len = %d, want 1", len(xs))
	}
}

func TestStore_ArchiveExcludesByDefault(t *testing.T) {
	s := newTestStore(t)
	v := mustCreate(t, s, "Jean", "Martin", "+33611111112")
	if _, err := s.Archive(v.ID); err != nil {
		t.Fatalf("Archive: %v", err)
	}
	xs, err := s.List(Filter{})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(xs) != 0 {
		t.Fatalf("default list len = %d, want 0", len(xs))
	}
	xs, err = s.List(Filter{Archived: "true"})
	if err != nil {
		t.Fatalf("List archived: %v", err)
	}
	if len(xs) != 1 {
		t.Fatalf("archived-only list len = %d, want 1", len(xs))
	}
	xs, err = s.List(Filter{Archived: "all"})
	if err != nil {
		t.Fatalf("List all: %v", err)
	}
	if len(xs) != 1 {
		t.Fatalf("all list len = %d, want 1", len(xs))
	}
}

func TestStore_PatchSetsFields(t *testing.T) {
	s := newTestStore(t)
	v := mustCreate(t, s, "Marie", "Dupont", "+33611111111")
	canDrive := true
	roles := []string{"Ravitaillement", "Accueil"}
	patched, err := s.Patch(v.ID, Patch{CanDrive: &canDrive, RoleTypes: &roles})
	if err != nil {
		t.Fatalf("Patch: %v", err)
	}
	if !patched.CanDrive {
		t.Fatalf("can_drive not set")
	}
	if len(patched.RoleTypes) != 2 {
		t.Fatalf("roles = %v", patched.RoleTypes)
	}
}

func TestStore_HardDeleteBlocksOnCarDependent(t *testing.T) {
	s := newTestStore(t)
	v := mustCreate(t, s, "Marie", "Dupont", "+33611111111")
	canDrive := true
	if _, err := s.Patch(v.ID, Patch{CanDrive: &canDrive}); err != nil {
		t.Fatalf("Patch: %v", err)
	}
	if _, err := s.DB.Exec(`INSERT INTO cars (name, seats, default_driver_id) VALUES (?, ?, ?)`, "Kangoo", 5, v.ID); err != nil {
		t.Fatalf("insert car: %v", err)
	}
	err := s.HardDelete(v.ID, false)
	var dep *ErrHasDependents
	if !errors.As(err, &dep) {
		t.Fatalf("err = %v, want ErrHasDependents", err)
	}
	if len(dep.Dependents.Cars) != 1 || dep.Dependents.Cars[0].Name != "Kangoo" {
		t.Fatalf("dependents = %+v", dep.Dependents)
	}
	if err := s.HardDelete(v.ID, true); err != nil {
		t.Fatalf("HardDelete force: %v", err)
	}
	if _, err := s.Get(v.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("after delete, Get = %v, want ErrNotFound", err)
	}
	// FK ON DELETE SET NULL should have nulled the car's driver.
	var n int
	if err := s.DB.QueryRow(`SELECT COUNT(*) FROM cars WHERE default_driver_id IS NULL`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Fatalf("car not nulled (%d)", n)
	}
}

func TestStore_AllRoleTypesUnion(t *testing.T) {
	s := newTestStore(t)
	a := mustCreate(t, s, "A", "A", "+33611111111")
	b := mustCreate(t, s, "B", "B", "+33611111112")
	rs1 := []string{"Ravitaillement", "Accueil"}
	rs2 := []string{"ravitaillement", "Balisage"}
	if _, err := s.Patch(a.ID, Patch{RoleTypes: &rs1}); err != nil {
		t.Fatalf("Patch a: %v", err)
	}
	if _, err := s.Patch(b.ID, Patch{RoleTypes: &rs2}); err != nil {
		t.Fatalf("Patch b: %v", err)
	}
	xs, err := s.AllRoleTypes()
	if err != nil {
		t.Fatalf("AllRoleTypes: %v", err)
	}
	// Expect 3 distinct (case-insensitive) roles.
	if len(xs) != 3 {
		t.Fatalf("xs = %v, want 3 distinct", xs)
	}
}
