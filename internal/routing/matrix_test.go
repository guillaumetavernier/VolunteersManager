package routing

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/guillaumetavernier/volunteersmanager/internal/store"
)

func newTestDB(t *testing.T) *store.Store {
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
	return s
}

func mustVS(t *testing.T, s *store.Store, name string, lat, lon float64) int64 {
	t.Helper()
	res, err := s.DB.Exec(`INSERT INTO vs (name, lat, lon) VALUES (?, ?, ?)`, name, lat, lon)
	if err != nil {
		t.Fatalf("insert vs: %v", err)
	}
	id, _ := res.LastInsertId()
	return id
}

func TestRecomputeMatrix_FillsFallback(t *testing.T) {
	s := newTestDB(t)
	id1 := mustVS(t, s, "A", 48.0, 2.0)
	id2 := mustVS(t, s, "B", 48.1, 2.1)
	vs := []VS{{ID: id1, Lat: 48.0, Lon: 2.0}, {ID: id2, Lat: 48.1, Lon: 2.1}}
	p := HaversineOnly{Settings: DefaultSettings()}
	if err := RecomputeMatrix(context.Background(), s.DB, vs, p); err != nil {
		t.Fatalf("RecomputeMatrix: %v", err)
	}
	cells, err := ListCells(context.Background(), s.DB)
	if err != nil {
		t.Fatalf("ListCells: %v", err)
	}
	// 2 VS × 2 VS × 2 modes = 8 cells.
	if len(cells) != 8 {
		t.Fatalf("len(cells) = %d, want 8", len(cells))
	}
	for _, c := range cells {
		if c.Source != SourceFallback {
			t.Fatalf("cell source = %q, want fallback", c.Source)
		}
	}
}

func TestRecomputeMatrix_PreservesManual(t *testing.T) {
	s := newTestDB(t)
	id1 := mustVS(t, s, "A", 48.0, 2.0)
	id2 := mustVS(t, s, "B", 48.1, 2.1)
	if err := SetManual(context.Background(), s.DB, id1, id2, ModeDrive, 9999); err != nil {
		t.Fatalf("SetManual: %v", err)
	}
	vs := []VS{{ID: id1, Lat: 48.0, Lon: 2.0}, {ID: id2, Lat: 48.1, Lon: 2.1}}
	if err := RecomputeMatrix(context.Background(), s.DB, vs, HaversineOnly{Settings: DefaultSettings()}); err != nil {
		t.Fatalf("RecomputeMatrix: %v", err)
	}
	cells, err := ListCells(context.Background(), s.DB)
	if err != nil {
		t.Fatalf("ListCells: %v", err)
	}
	var found bool
	for _, c := range cells {
		if c.FromVS == id1 && c.ToVS == id2 && c.Mode == ModeDrive {
			if c.Source != SourceManual || c.Seconds != 9999 {
				t.Fatalf("manual cell overwritten: %+v", c)
			}
			found = true
		}
	}
	if !found {
		t.Fatalf("manual cell not found among %d cells", len(cells))
	}
}

func TestRecomputeMatrix_AutoOverwritesAfterMove(t *testing.T) {
	s := newTestDB(t)
	id1 := mustVS(t, s, "A", 48.0, 2.0)
	id2 := mustVS(t, s, "B", 48.0, 2.135) // ~10 km east
	vs1 := []VS{{ID: id1, Lat: 48.0, Lon: 2.0}, {ID: id2, Lat: 48.0, Lon: 2.135}}
	p := HaversineOnly{Settings: DefaultSettings()}
	if err := RecomputeMatrix(context.Background(), s.DB, vs1, p); err != nil {
		t.Fatalf("RecomputeMatrix: %v", err)
	}
	// Move B far away.
	vs2 := []VS{{ID: id1, Lat: 48.0, Lon: 2.0}, {ID: id2, Lat: 48.0, Lon: 3.0}}
	if _, err := s.DB.Exec(`UPDATE vs SET lon=? WHERE id=?`, 3.0, id2); err != nil {
		t.Fatalf("update vs: %v", err)
	}
	if err := RecomputeMatrix(context.Background(), s.DB, vs2, p); err != nil {
		t.Fatalf("RecomputeMatrix2: %v", err)
	}
	cells, err := ListCells(context.Background(), s.DB)
	if err != nil {
		t.Fatalf("ListCells: %v", err)
	}
	for _, c := range cells {
		if c.FromVS == id1 && c.ToVS == id2 && c.Mode == ModeDrive {
			// At ~74 km / 40 km/h ≈ 6650 s.
			if c.Seconds < 5000 {
				t.Fatalf("after move, drive seconds = %d (want >5000)", c.Seconds)
			}
		}
	}
}
