package event

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

func TestStore_GetNotInitialized(t *testing.T) {
	s := newTestStore(t)
	_, err := s.Get()
	if err != ErrNotInitialized {
		t.Fatalf("err = %v, want ErrNotInitialized", err)
	}
}

func TestStore_UpsertInsertsThenUpdates(t *testing.T) {
	s := newTestStore(t)
	got, err := s.Upsert(Event{Name: "Trail X", StartDate: "2026-06-01", EndDate: "2026-06-03"})
	if err != nil {
		t.Fatalf("first Upsert: %v", err)
	}
	if got.ID != 1 || got.Name != "Trail X" || got.Timezone != "" {
		t.Fatalf("got = %+v, want id=1, name=Trail X, no tz override", got)
	}
	if got.Settings != "{}" {
		t.Fatalf("settings default = %q, want {}", got.Settings)
	}

	got2, err := s.Upsert(Event{Name: "Trail Y", StartDate: "2026-07-01", EndDate: "2026-07-02", Timezone: "Europe/Paris", CountryCode: "FR"})
	if err != nil {
		t.Fatalf("second Upsert: %v", err)
	}
	if got2.ID != 1 || got2.Name != "Trail Y" {
		t.Fatalf("got2 = %+v, want id=1, name=Trail Y", got2)
	}

	// Only one row ever exists.
	var n int
	if err := s.DB.QueryRow(`SELECT count(*) FROM events`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Fatalf("rows = %d, want 1", n)
	}
}
