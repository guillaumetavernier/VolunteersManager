package race

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/guillaumetavernier/volunteersmanager/internal/store"
)

func newTestRig(t *testing.T) (chi.Router, *sql.DB, string) {
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
	r := chi.NewRouter()
	NewHandler(NewStore(s.DB), NewService(s.DB), dir).Mount(r)
	return r, s.DB, dir
}

func decodeJSON[T any](t *testing.T, body io.Reader) T {
	t.Helper()
	var out T
	if err := json.NewDecoder(body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return out
}

func createRace(t *testing.T, r chi.Router, body string) Race {
	t.Helper()
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/races", strings.NewReader(body)))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body=%s", rec.Code, rec.Body.String())
	}
	return decodeJSON[Race](t, rec.Body)
}

func TestRace_CreateGetPatchDelete(t *testing.T) {
	r, _, _ := newTestRig(t)

	ra := createRace(t, r, `{"name":"100km","color":"#ff0000","front_pace":15,"tail_pace":6,"start_time":"2026-06-01T05:00:00Z"}`)
	if ra.Name != "100km" || ra.Color != "#ff0000" {
		t.Fatalf("create returned %+v", ra)
	}
	if ra.FrontPace != 15 || ra.TailPace != 6 {
		t.Fatalf("paces = %v/%v", ra.FrontPace, ra.TailPace)
	}

	// Duplicate name → 409.
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/races",
		strings.NewReader(`{"name":"100km"}`)))
	if rec.Code != http.StatusConflict {
		t.Fatalf("dup status = %d, want 409", rec.Code)
	}

	// Patch.
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPatch, "/api/races/"+strconv.FormatInt(ra.ID, 10),
		strings.NewReader(`{"front_pace":14}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("patch status = %d, body=%s", rec.Code, rec.Body.String())
	}
	got := decodeJSON[Race](t, rec.Body)
	if got.FrontPace != 14 {
		t.Fatalf("after patch front_pace = %v, want 14", got.FrontPace)
	}

	// Delete + 404.
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, "/api/races/"+strconv.FormatInt(ra.ID, 10), nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d, want 204", rec.Code)
	}
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/races/"+strconv.FormatInt(ra.ID, 10), nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("get after delete status = %d, want 404", rec.Code)
	}
}

const fixtureGPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="48.0" lon="2.0"/>
    <trkpt lat="48.0" lon="2.001"/>
    <trkpt lat="48.0" lon="2.002"/>
    <trkpt lat="48.0" lon="2.003"/>
  </trkseg></trk>
</gpx>`

func uploadGPX(t *testing.T, r chi.Router, raceID int64, body string) int {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	part, err := mw.CreateFormFile("gpx", "track.gpx")
	if err != nil {
		t.Fatalf("CreateFormFile: %v", err)
	}
	if _, err := part.Write([]byte(body)); err != nil {
		t.Fatalf("write part: %v", err)
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("mw.Close: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/races/"+strconv.FormatInt(raceID, 10)+"/gpx", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec.Code
}

func TestRace_GPXUploadStoresFileAndPoints(t *testing.T) {
	r, db, assetDir := newTestRig(t)
	ra := createRace(t, r, `{"name":"42km"}`)
	code := uploadGPX(t, r, ra.ID, fixtureGPX)
	if code != http.StatusCreated {
		t.Fatalf("upload status = %d, want 201", code)
	}

	var n int
	if err := db.QueryRow(`SELECT count(*) FROM gpx_files WHERE race_id = ?`, ra.ID).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Fatalf("gpx_files rows = %d, want 1", n)
	}

	var filePath string
	var total float64
	if err := db.QueryRow(`SELECT file_path, total_distance_m FROM gpx_files WHERE race_id = ?`, ra.ID).Scan(&filePath, &total); err != nil {
		t.Fatalf("read: %v", err)
	}
	if !strings.HasPrefix(filePath, "/assets/gpx/") {
		t.Fatalf("file_path = %q, want /assets/gpx/* prefix", filePath)
	}
	if total <= 0 {
		t.Fatalf("total_distance_m = %v, want > 0", total)
	}
	_ = assetDir
}

func TestRace_GPXUploadRejectsGarbage(t *testing.T) {
	r, _, _ := newTestRig(t)
	ra := createRace(t, r, `{"name":"trail"}`)
	code := uploadGPX(t, r, ra.ID, `not even xml`)
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", code)
	}
}
