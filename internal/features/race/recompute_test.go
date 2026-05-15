package race

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"math"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/guillaumetavernier/volunteersmanager/internal/store"
)

func setupRecomputeRig(t *testing.T) (chi.Router, *sql.DB, *Service) {
	t.Helper()
	dir := t.TempDir()
	s, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	if err := s.Migrate(); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	r := chi.NewRouter()
	svc := NewService(s.DB)
	NewHandler(NewStore(s.DB), svc, dir).Mount(r)
	return r, s.DB, svc
}

func TestRecompute_AutoTimesFromPaces(t *testing.T) {
	r, db, svc := setupRecomputeRig(t)

	// Create race with paces and start time.
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/races",
		strings.NewReader(`{"name":"42km","front_pace":12,"tail_pace":6,"start_time":"2026-06-01T05:00:00Z"}`)))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create race: %d %s", rec.Code, rec.Body.String())
	}
	var ra Race
	_ = json.NewDecoder(rec.Body).Decode(&ra)

	// Upload a 4-point GPX (~333 m of track along the equator).
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	part, _ := mw.CreateFormFile("gpx", "t.gpx")
	_, _ = part.Write([]byte(`<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>
<trkpt lat="0" lon="0"/><trkpt lat="0" lon="0.001"/><trkpt lat="0" lon="0.002"/><trkpt lat="0" lon="0.003"/>
</trkseg></trk></gpx>`))
	mw.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/races/"+strconv.FormatInt(ra.ID, 10)+"/gpx", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("upload gpx: %d %s", rec.Code, rec.Body.String())
	}

	// Insert a VS near the second track point and one race_vs_entry.
	res, err := db.Exec(`INSERT INTO vs (name, lat, lon) VALUES ('VS-1', 0, 0.0015)`)
	if err != nil {
		t.Fatalf("insert vs: %v", err)
	}
	vsID, _ := res.LastInsertId()
	if _, err := db.Exec(`INSERT INTO race_vs_entries (race_id, vs_id, sequence) VALUES (?, ?, 0)`, ra.ID, vsID); err != nil {
		t.Fatalf("insert entry: %v", err)
	}

	if err := svc.RecomputeRace(ra.ID); err != nil {
		t.Fatalf("recompute: %v", err)
	}

	var projDist float64
	var autoFirst, autoLast string
	if err := db.QueryRow(`SELECT projected_dist_m, auto_first_in, auto_last_in FROM race_vs_entries WHERE race_id = ? AND vs_id = ?`, ra.ID, vsID).Scan(&projDist, &autoFirst, &autoLast); err != nil {
		t.Fatalf("read entry: %v", err)
	}
	// At lon=0.0015 on lat=0 the projected distance is ~167 m.
	if math.Abs(projDist-167) > 5 {
		t.Fatalf("projected_dist_m = %.1f, want ~167", projDist)
	}

	start, _ := time.Parse(time.RFC3339, "2026-06-01T05:00:00Z")
	expectedFirst := start.Add(time.Duration(projDist/(12*1000.0/3600.0)) * time.Second).UTC().Format(time.RFC3339)
	expectedLast := start.Add(time.Duration(projDist/(6*1000.0/3600.0)) * time.Second).UTC().Format(time.RFC3339)
	if autoFirst != expectedFirst {
		t.Fatalf("auto_first_in = %s, want %s", autoFirst, expectedFirst)
	}
	if autoLast != expectedLast {
		t.Fatalf("auto_last_in = %s, want %s", autoLast, expectedLast)
	}
}

func TestRecompute_ForVS_FiresAllOwnerRaces(t *testing.T) {
	_, db, svc := setupRecomputeRig(t)
	// Two races; one VS in both.
	if _, err := db.Exec(`INSERT INTO races (name) VALUES ('A'), ('B')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO vs (name, lat, lon) VALUES ('VS-X', 0, 0)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO race_vs_entries (race_id, vs_id, sequence) VALUES (1, 1, 0), (2, 1, 0)`); err != nil {
		t.Fatal(err)
	}
	if err := svc.RecomputeForVS(1); err != nil {
		t.Fatalf("RecomputeForVS: %v", err)
	}
	// With no GPX, projected_dist_m stays NULL. That's the contract; the call
	// must succeed regardless.
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM race_vs_entries WHERE projected_dist_m IS NULL`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Fatalf("rows with NULL projected_dist_m = %d, want 2 (no GPX uploaded)", n)
	}
}
