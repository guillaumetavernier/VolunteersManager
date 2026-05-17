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

	ra := createRace(t, r, `{"name":"100km","color":"#ff0000"}`)
	if ra.Name != "100km" || ra.Color != "#ff0000" {
		t.Fatalf("create returned %+v", ra)
	}

	// Duplicate name → 409.
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/races",
		strings.NewReader(`{"name":"100km"}`)))
	if rec.Code != http.StatusConflict {
		t.Fatalf("dup status = %d, want 409", rec.Code)
	}

	// Patch name.
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPatch, "/api/races/"+strconv.FormatInt(ra.ID, 10),
		strings.NewReader(`{"name":"Ultra"}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("patch status = %d, body=%s", rec.Code, rec.Body.String())
	}
	got := decodeJSON[Race](t, rec.Body)
	if got.Name != "Ultra" {
		t.Fatalf("after patch name = %q, want Ultra", got.Name)
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

func TestRace_TrackReturnsFeatureCollection(t *testing.T) {
	r, _, _ := newTestRig(t)
	ra := createRace(t, r, `{"name":"42km"}`)

	// No GPX yet → empty FeatureCollection.
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/races/"+strconv.FormatInt(ra.ID, 10)+"/track", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("track status = %d", rec.Code)
	}
	var fc map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&fc); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if fc["type"] != "FeatureCollection" {
		t.Fatalf("type = %v, want FeatureCollection", fc["type"])
	}
}

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

func TestRace_OldGPXEndpointGone(t *testing.T) {
	// The old race-scoped GPX upload endpoint no longer exists (moved to trial).
	// Posting to the old path should get a 404.
	r, _, _ := newTestRig(t)
	ra := createRace(t, r, `{"name":"42km"}`)
	code := uploadGPX(t, r, ra.ID, fixtureGPX)
	if code != http.StatusNotFound {
		t.Fatalf("old gpx upload path: status = %d, want 404", code)
	}
}

func TestRace_DeleteFiresOnDelete(t *testing.T) {
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
	h := NewHandler(NewStore(s.DB), NewService(s.DB), dir)
	called := int64(0)
	h.OnDelete = func(id int64) error {
		called = id
		return nil
	}
	h.Mount(r)

	ra := createRace(t, r, `{"name":"X"}`)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, "/api/races/"+strconv.FormatInt(ra.ID, 10), nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d", rec.Code)
	}
	if called != ra.ID {
		t.Fatalf("OnDelete not called for %d (got %d)", ra.ID, called)
	}
}
