package trial

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

type stubRecomputer struct{ calls []int64 }

func (s *stubRecomputer) RecomputeRace(raceID int64) error {
	s.calls = append(s.calls, raceID)
	return nil
}

func setupRig(t *testing.T) (chi.Router, *sql.DB, *stubRecomputer, string) {
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
	r := chi.NewRouter()
	stub := &stubRecomputer{}
	NewHandler(NewStore(st.DB), stub, dir).Mount(r)
	return r, st.DB, stub, dir
}

func decodeJSON[T any](t *testing.T, body io.Reader) T {
	t.Helper()
	var out T
	if err := json.NewDecoder(body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return out
}

func createTrial(t *testing.T, r chi.Router, raceID int64, body string) Trial {
	t.Helper()
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/races/"+strconv.FormatInt(raceID, 10)+"/trials", strings.NewReader(body)))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create trial status = %d, body=%s", rec.Code, rec.Body.String())
	}
	return decodeJSON[Trial](t, rec.Body)
}

func TestTrial_CreateGetPatchDelete(t *testing.T) {
	r, _, stub, _ := setupRig(t)

	tr := createTrial(t, r, 1, `{"name":"Trail","sequence":0,"front_pace":12,"tail_pace":6,"start_time":"2026-06-01T05:00:00Z"}`)
	if tr.Name != "Trail" || tr.FrontPace != 12 || tr.TailPace != 6 {
		t.Fatalf("create returned %+v", tr)
	}
	if tr.StartTime == nil || *tr.StartTime != "2026-06-01T05:00:00Z" {
		t.Fatalf("start_time = %v, want 2026-06-01T05:00:00Z", tr.StartTime)
	}
	// Create fires recompute.
	if len(stub.calls) != 1 {
		t.Fatalf("recompute calls = %d, want 1", len(stub.calls))
	}

	// List.
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/races/1/trials", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("list status = %d", rec.Code)
	}
	xs := decodeJSON[[]Trial](t, rec.Body)
	if len(xs) != 1 || xs[0].ID != tr.ID {
		t.Fatalf("list = %+v", xs)
	}

	// Patch.
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPatch, "/api/trials/"+strconv.FormatInt(tr.ID, 10),
		strings.NewReader(`{"front_pace":14}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("patch status = %d, body=%s", rec.Code, rec.Body.String())
	}
	got := decodeJSON[Trial](t, rec.Body)
	if got.FrontPace != 14 {
		t.Fatalf("after patch front_pace = %v, want 14", got.FrontPace)
	}
	// Patch(front_pace) fires recompute: 1 from create + 1 from patch = 2 total.
	if len(stub.calls) != 2 {
		t.Fatalf("recompute calls = %d, want 2 (create + patch)", len(stub.calls))
	}

	// Delete.
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, "/api/trials/"+strconv.FormatInt(tr.ID, 10), nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d", rec.Code)
	}
	// Delete fires recompute.
	if len(stub.calls) != 3 { // create + patch(pace) + delete
		t.Fatalf("recompute calls after delete = %d, want 3", len(stub.calls))
	}
}

func TestTrial_Create_MissingName_422(t *testing.T) {
	r, _, _, _ := setupRig(t)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/races/1/trials",
		strings.NewReader(`{"sequence":0,"front_pace":12,"tail_pace":6}`)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
}

func TestTrial_Reorder(t *testing.T) {
	r, _, stub, _ := setupRig(t)
	tr0 := createTrial(t, r, 1, `{"name":"Trail","sequence":0,"front_pace":12,"tail_pace":6}`)
	tr1 := createTrial(t, r, 1, `{"name":"MTB","sequence":1,"front_pace":20,"tail_pace":12}`)
	stub.calls = nil

	// Swap order.
	body := `[{"trial_id":` + strconv.FormatInt(tr0.ID, 10) + `,"sequence":1},{"trial_id":` + strconv.FormatInt(tr1.ID, 10) + `,"sequence":0}]`
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPut, "/api/races/1/trials/reorder", strings.NewReader(body)))
	if rec.Code != http.StatusOK {
		t.Fatalf("reorder status = %d, body=%s", rec.Code, rec.Body.String())
	}
	xs := decodeJSON[[]Trial](t, rec.Body)
	if len(xs) != 2 || xs[0].Name != "MTB" || xs[1].Name != "Trail" {
		t.Fatalf("after reorder: %+v", xs)
	}
	if len(stub.calls) != 1 {
		t.Fatalf("recompute calls = %d, want 1", len(stub.calls))
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

func uploadGPX(t *testing.T, r chi.Router, trialID int64, gpxBody string) (int, GPXFile) {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	part, err := mw.CreateFormFile("gpx", "track.gpx")
	if err != nil {
		t.Fatalf("CreateFormFile: %v", err)
	}
	if _, err := part.Write([]byte(gpxBody)); err != nil {
		t.Fatalf("write part: %v", err)
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("mw.Close: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/trials/"+strconv.FormatInt(trialID, 10)+"/gpx", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		return rec.Code, GPXFile{}
	}
	return rec.Code, decodeJSON[GPXFile](t, rec.Body)
}

func TestTrial_GPXUpload(t *testing.T) {
	r, db, stub, _ := setupRig(t)
	tr := createTrial(t, r, 1, `{"name":"Trail","sequence":0,"front_pace":12,"tail_pace":6}`)
	stub.calls = nil

	code, g := uploadGPX(t, r, tr.ID, fixtureGPX)
	if code != http.StatusCreated {
		t.Fatalf("upload status = %d", code)
	}
	if g.TrialID == nil || *g.TrialID != tr.ID {
		t.Fatalf("gpx trial_id = %v, want %d", g.TrialID, tr.ID)
	}
	if len(stub.calls) != 1 {
		t.Fatalf("recompute calls after upload = %d, want 1", len(stub.calls))
	}

	// Verify DB row.
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM gpx_files WHERE trial_id = ?`, tr.ID).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Fatalf("gpx_files rows = %d, want 1", n)
	}
}

func TestTrial_GPXUpload_RejectsGarbage(t *testing.T) {
	r, _, _, _ := setupRig(t)
	tr := createTrial(t, r, 1, `{"name":"Trail","sequence":0,"front_pace":12,"tail_pace":6}`)
	code, _ := uploadGPX(t, r, tr.ID, `not even xml`)
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", code)
	}
}

func TestTrial_GPXDelete(t *testing.T) {
	r, db, stub, _ := setupRig(t)
	tr := createTrial(t, r, 1, `{"name":"Trail","sequence":0,"front_pace":12,"tail_pace":6}`)
	code, g := uploadGPX(t, r, tr.ID, fixtureGPX)
	if code != http.StatusCreated {
		t.Fatalf("upload: %d", code)
	}
	stub.calls = nil

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodDelete,
		"/api/trials/"+strconv.FormatInt(tr.ID, 10)+"/gpx/"+strconv.FormatInt(g.ID, 10), nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d, body=%s", rec.Code, rec.Body.String())
	}
	if len(stub.calls) != 1 {
		t.Fatalf("recompute after delete = %d, want 1", len(stub.calls))
	}
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM gpx_files WHERE trial_id = ?`, tr.ID).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatalf("gpx_files rows = %d, want 0 after delete", n)
	}
}

func TestTrial_PutTrialVS(t *testing.T) {
	r, db, _, _ := setupRig(t)
	tr := createTrial(t, r, 1, `{"name":"Trail","sequence":0,"front_pace":12,"tail_pace":6}`)

	// Seed a VS and a race_trial_vs row.
	vsRes, _ := db.Exec(`INSERT INTO vs (name, lat, lon) VALUES ('VS-1', 0, 0)`)
	vsID, _ := vsRes.LastInsertId()
	res, _ := db.Exec(`INSERT INTO race_trial_vs (trial_id, vs_id, source) VALUES (?, ?, 'auto')`, tr.ID, vsID)
	rtvID, _ := res.LastInsertId()

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPut,
		"/api/race_trial_vs/"+strconv.FormatInt(rtvID, 10),
		strings.NewReader(`{"source":"manual_exclude"}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("put status = %d, body=%s", rec.Code, rec.Body.String())
	}
	got := decodeJSON[TrialVS](t, rec.Body)
	if got.Source != "manual_exclude" {
		t.Fatalf("source = %q, want manual_exclude", got.Source)
	}
}

func TestTrial_PutTrialVS_BadSource_422(t *testing.T) {
	r, db, _, _ := setupRig(t)
	tr := createTrial(t, r, 1, `{"name":"Trail","sequence":0,"front_pace":12,"tail_pace":6}`)
	vsRes, _ := db.Exec(`INSERT INTO vs (name, lat, lon) VALUES ('VS-1', 0, 0)`)
	vsID, _ := vsRes.LastInsertId()
	res, _ := db.Exec(`INSERT INTO race_trial_vs (trial_id, vs_id, source) VALUES (?, ?, 'auto')`, tr.ID, vsID)
	rtvID, _ := res.LastInsertId()

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPut,
		"/api/race_trial_vs/"+strconv.FormatInt(rtvID, 10),
		strings.NewReader(`{"source":"bad_value"}`)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
}
