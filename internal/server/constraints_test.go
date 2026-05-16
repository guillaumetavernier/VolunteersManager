package server

import (
	"database/sql"
	"encoding/json"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/guillaumetavernier/volunteersmanager/internal/store"
)

func newTestServer(t *testing.T) (http.Handler, *sql.DB) {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "event.db")
	st, err := store.Open(dbPath)
	if err != nil {
		t.Fatalf("store open: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	if err := st.Migrate(); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	h, err := New(Config{DB: st.DB})
	if err != nil {
		t.Fatalf("server new: %v", err)
	}
	return h, st.DB
}

func mustDo(t *testing.T, h http.Handler, method, path, body string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	var br *strings.Reader
	if body != "" {
		br = strings.NewReader(body)
	}
	var req *http.Request
	if br == nil {
		req = httptest.NewRequest(method, path, nil)
	} else {
		req = httptest.NewRequest(method, path, br)
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code < 200 || rec.Code >= 300 {
		t.Fatalf("%s %s -> %d: %s", method, path, rec.Code, rec.Body.String())
	}
	var out map[string]any
	if rec.Body.Len() > 0 {
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatalf("decode: %v body=%s", err, rec.Body.String())
		}
	}
	return rec, out
}

func dataField(t *testing.T, body map[string]any) map[string]any {
	t.Helper()
	d, ok := body["data"].(map[string]any)
	if !ok {
		t.Fatalf("missing data field: %v", body)
	}
	return d
}

func TestMiddleware_WrapsMutationResponse_DoubleBooking(t *testing.T) {
	h, db := newTestServer(t)
	_ = db
	_ = fs.WalkDir // keep import alive in early stubs

	// init event
	_, _ = mustDo(t, h, http.MethodPut, "/api/event", `{"name":"E","start_date":"2026-06-01","end_date":"2026-06-02"}`)

	// create VS
	_, vsBody := mustDo(t, h, http.MethodPost, "/api/vs", `{"name":"VS1","lat":45.0,"lon":6.0}`)
	vs := dataField(t, vsBody)
	vsID := int64(vs["id"].(float64))

	// create two overlapping missions
	mPath := "/api/vs/" + intStr(vsID) + "/missions"
	_, m1Body := mustDo(t, h, http.MethodPost, mPath, `{"day":1,"start_time":"08:00","end_time":"10:00","role_type":"poste","headcount":1}`)
	_, m2Body := mustDo(t, h, http.MethodPost, mPath, `{"day":1,"start_time":"09:00","end_time":"11:00","role_type":"poste","headcount":1}`)
	m1ID := int64(dataField(t, m1Body)["id"].(float64))
	m2ID := int64(dataField(t, m2Body)["id"].(float64))

	// create volunteer
	_, volBody := mustDo(t, h, http.MethodPost, "/api/volunteers", `{"first_name":"A","last_name":"B","phone":"0600000000","role_types":["poste"]}`)
	volID := int64(dataField(t, volBody)["id"].(float64))

	// assign vol to mission 1 — expect no double_booking yet
	_, a1Body := mustDo(t, h, http.MethodPost, "/api/assignments", `{"mission_id":`+intStr(m1ID)+`,"volunteer_id":`+intStr(volID)+`}`)
	added1 := warningsAdded(t, a1Body)
	if hasKind(added1, "double_booking") {
		t.Fatalf("first assignment should not produce double_booking, got: %v", added1)
	}

	// assign to mission 2 — should add a double_booking
	_, a2Body := mustDo(t, h, http.MethodPost, "/api/assignments", `{"mission_id":`+intStr(m2ID)+`,"volunteer_id":`+intStr(volID)+`}`)
	added2 := warningsAdded(t, a2Body)
	if !hasKind(added2, "double_booking") {
		t.Fatalf("second assignment should add double_booking, got: %v", added2)
	}

	// confirm GET /api/warnings returns it (this endpoint is NOT wrapped)
	wReq := httptest.NewRequest(http.MethodGet, "/api/warnings", nil)
	wRec := httptest.NewRecorder()
	h.ServeHTTP(wRec, wReq)
	if wRec.Code != 200 {
		t.Fatalf("GET /api/warnings: %d", wRec.Code)
	}
	var listed []map[string]any
	if err := json.Unmarshal(wRec.Body.Bytes(), &listed); err != nil {
		t.Fatalf("decode warnings: %v", err)
	}
	if !anyKind(listed, "double_booking") {
		t.Fatalf("GET /api/warnings did not include double_booking: %v", listed)
	}

	// delete one assignment — expect double_booking in removed
	a2 := dataField(t, a2Body)
	a2ID := int64(a2["id"].(float64))
	delRec, delBody := mustDo(t, h, http.MethodDelete, "/api/assignments/"+intStr(a2ID), "")
	_ = delRec
	removed, ok := delBody["warnings"].(map[string]any)["removed"].([]any)
	if !ok {
		t.Fatalf("missing removed: %v", delBody)
	}
	if len(removed) == 0 {
		t.Fatalf("expected at least one removed warning, got %v", delBody)
	}
}

func TestMiddleware_GetIsNotWrapped(t *testing.T) {
	h, _ := newTestServer(t)
	_, _ = mustDo(t, h, http.MethodPut, "/api/event", `{"name":"E","start_date":"2026-06-01","end_date":"2026-06-02"}`)

	req := httptest.NewRequest(http.MethodGet, "/api/event", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if _, ok := body["data"]; ok {
		t.Fatalf("GET should not be wrapped, got %v", body)
	}
	if _, ok := body["name"]; !ok {
		t.Fatalf("expected bare event, got %v", body)
	}
}

func intStr(n int64) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	x := n
	neg := false
	if x < 0 {
		neg = true
		x = -x
	}
	for x > 0 {
		i--
		b[i] = byte('0' + x%10)
		x /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}

func warningsAdded(t *testing.T, body map[string]any) []map[string]any {
	t.Helper()
	wm, ok := body["warnings"].(map[string]any)
	if !ok {
		t.Fatalf("no warnings field: %v", body)
	}
	addedRaw, _ := wm["added"].([]any)
	out := make([]map[string]any, 0, len(addedRaw))
	for _, a := range addedRaw {
		if m, ok := a.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func hasKind(ws []map[string]any, kind string) bool {
	for _, w := range ws {
		if w["kind"] == kind {
			return true
		}
	}
	return false
}

func anyKind(ws []map[string]any, kind string) bool { return hasKind(ws, kind) }

// silence unused-import linter when this file is iterated upon
var _ = os.Getenv
