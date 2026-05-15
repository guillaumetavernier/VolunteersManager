package vs

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
	return NewStore(s.DB)
}

func TestStore_CRUD(t *testing.T) {
	s := newTestStore(t)

	xs, err := s.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(xs) != 0 {
		t.Fatalf("empty List = %d items, want 0", len(xs))
	}

	v, err := s.Create("Refuge Nord", 45.123, 6.456, nil, nil)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if v.ID == 0 || v.Name != "Refuge Nord" {
		t.Fatalf("Create returned %+v", v)
	}

	got, err := s.Get(v.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Lat != 45.123 {
		t.Fatalf("lat = %v, want 45.123", got.Lat)
	}

	newLat := 45.999
	patched, err := s.Patch(v.ID, Patch{Lat: &newLat})
	if err != nil {
		t.Fatalf("Patch: %v", err)
	}
	if patched.Lat != 45.999 {
		t.Fatalf("after Patch lat = %v, want 45.999", patched.Lat)
	}

	if err := s.Delete(v.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := s.Get(v.ID); err != ErrNotFound {
		t.Fatalf("after Delete Get err = %v, want ErrNotFound", err)
	}
}

func TestStore_DuplicateName(t *testing.T) {
	s := newTestStore(t)
	if _, err := s.Create("A", 1, 1, nil, nil); err != nil {
		t.Fatalf("first Create: %v", err)
	}
	if _, err := s.Create("A", 2, 2, nil, nil); err != ErrDuplicateName {
		t.Fatalf("dup Create err = %v, want ErrDuplicateName", err)
	}
}

func TestStore_DuplicateNameOnPatch(t *testing.T) {
	s := newTestStore(t)
	a, _ := s.Create("A", 1, 1, nil, nil)
	_, _ = s.Create("B", 2, 2, nil, nil)
	name := "B"
	if _, err := s.Patch(a.ID, Patch{Name: &name}); err != ErrDuplicateName {
		t.Fatalf("rename to existing name err = %v, want ErrDuplicateName", err)
	}
}

func TestStore_PatchNotFound(t *testing.T) {
	s := newTestStore(t)
	name := "X"
	if _, err := s.Patch(999, Patch{Name: &name}); err != ErrNotFound {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestStore_ListSortedByName(t *testing.T) {
	s := newTestStore(t)
	for _, n := range []string{"Charlie", "alpha", "Bravo"} {
		if _, err := s.Create(n, 1, 1, nil, nil); err != nil {
			t.Fatalf("Create %s: %v", n, err)
		}
	}
	xs, err := s.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	want := []string{"alpha", "Bravo", "Charlie"}
	for i, v := range xs {
		if v.Name != want[i] {
			t.Fatalf("xs[%d].Name = %q, want %q (case-insensitive sort)", i, v.Name, want[i])
		}
	}
}
