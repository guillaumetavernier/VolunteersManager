package racevs

import (
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/guillaumetavernier/volunteersmanager/internal/store"
)

type stubRecomputer struct{ calls []int64 }

func (s *stubRecomputer) RecomputeRace(raceID int64) error {
	s.calls = append(s.calls, raceID)
	return nil
}

func setupRig(t *testing.T) (chi.Router, *sql.DB, *stubRecomputer) {
	t.Helper()
	dir := t.TempDir()
	st, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	if err := st.Migrate(); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if _, err := st.DB.Exec(`INSERT INTO races (name) VALUES ('R1')`); err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.Exec(`INSERT INTO vs (name, lat, lon) VALUES ('V1', 0, 0), ('V2', 1, 1), ('V3', 2, 2)`); err != nil {
		t.Fatal(err)
	}
	r := chi.NewRouter()
	stub := &stubRecomputer{}
	NewHandler(NewStore(st.DB), stub).Mount(r)
	return r, st.DB, stub
}

func decodeJSON[T any](t *testing.T, body io.Reader) T {
	t.Helper()
	var out T
	if err := json.NewDecoder(body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return out
}

func TestRaceVS_ReplaceTriggersRecomputeAndOrdersBySequence(t *testing.T) {
	r, _, stub := setupRig(t)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPut, "/api/races/1/vs",
		strings.NewReader(`[{"vs_id":2,"sequence":0},{"vs_id":1,"sequence":1},{"vs_id":3,"sequence":2}]`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("replace status = %d, body=%s", rec.Code, rec.Body.String())
	}
	xs := decodeJSON[[]Entry](t, rec.Body)
	want := []int64{2, 1, 3}
	if len(xs) != 3 {
		t.Fatalf("entries = %d, want 3", len(xs))
	}
	for i, e := range xs {
		if e.VSID != want[i] {
			t.Fatalf("xs[%d].VSID = %d, want %d", i, e.VSID, want[i])
		}
		if e.Sequence != i {
			t.Fatalf("xs[%d].Sequence = %d, want %d", i, e.Sequence, i)
		}
	}
	if len(stub.calls) != 1 || stub.calls[0] != 1 {
		t.Fatalf("recomputer calls = %v, want [1]", stub.calls)
	}
}

func TestRaceVS_ReplacePreservesManualOverrides(t *testing.T) {
	r, db, _ := setupRig(t)
	// Seed an entry with a manual override.
	if _, err := db.Exec(`INSERT INTO race_vs_entries (race_id, vs_id, sequence, manual_first_in) VALUES (1, 1, 0, '2026-06-01T07:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	// Replace order — VS 1 is now at sequence 2.
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPut, "/api/races/1/vs",
		strings.NewReader(`[{"vs_id":2,"sequence":0},{"vs_id":3,"sequence":1},{"vs_id":1,"sequence":2}]`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	xs := decodeJSON[[]Entry](t, rec.Body)
	var got *Entry
	for i := range xs {
		if xs[i].VSID == 1 {
			got = &xs[i]
		}
	}
	if got == nil {
		t.Fatalf("VS 1 missing from replaced list")
	}
	if got.ManualFirstIn == nil || *got.ManualFirstIn != "2026-06-01T07:00:00Z" {
		t.Fatalf("manual_first_in not preserved: %v", got.ManualFirstIn)
	}
}

func TestRaceVS_PatchSetsManualTimes(t *testing.T) {
	r, db, _ := setupRig(t)
	if _, err := db.Exec(`INSERT INTO race_vs_entries (race_id, vs_id, sequence) VALUES (1, 1, 0)`); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPatch, "/api/races/1/vs/1",
		strings.NewReader(`{"manual_first_in":"2026-06-01T07:00:00Z"}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	got := decodeJSON[Entry](t, rec.Body)
	if got.ManualFirstIn == nil || *got.ManualFirstIn != "2026-06-01T07:00:00Z" {
		t.Fatalf("manual_first_in = %v, want set", got.ManualFirstIn)
	}
}

func TestRaceVS_PatchUnknownEntry_404(t *testing.T) {
	r, _, _ := setupRig(t)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPatch, "/api/races/1/vs/99",
		strings.NewReader(`{"manual_first_in":"x"}`)))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestRaceVS_ClearManualNullsTheField(t *testing.T) {
	r, db, _ := setupRig(t)
	if _, err := db.Exec(`INSERT INTO race_vs_entries (race_id, vs_id, sequence, manual_first_in) VALUES (1, 1, 0, '2026-06-01T07:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, "/api/races/1/vs/1/manual?first=1", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	got := decodeJSON[Entry](t, rec.Body)
	if got.ManualFirstIn != nil {
		t.Fatalf("manual_first_in = %v, want nil", got.ManualFirstIn)
	}
	_ = strconv.Itoa // keep import
}
