package mission

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func newTestHandler(t *testing.T) (*Store, chi.Router) {
	t.Helper()
	s := newTestStore(t)
	r := chi.NewRouter()
	NewHandler(s).Mount(r)
	return s, r
}

func TestHandlers_CreateForVS(t *testing.T) {
	_, r := newTestHandler(t)
	rec := httptest.NewRecorder()
	body := `{"day":1,"start_time":"2026-06-01T08:00","end_time":"2026-06-01T12:00","role_type":"Ravito","headcount":2}`
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/vs/1/missions", strings.NewReader(body)))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d; body=%s", rec.Code, rec.Body.String())
	}
	var m Mission
	if err := json.NewDecoder(rec.Body).Decode(&m); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if m.VSID != 1 || m.Headcount != 2 || m.Status != "under" {
		t.Fatalf("got %+v", m)
	}
}

func TestHandlers_ListByVS(t *testing.T) {
	s, r := newTestHandler(t)
	_, _ = s.Create(Input{VSID: 1, Day: 1, StartTime: "a", EndTime: "b", RoleType: "R", Headcount: 1})
	_, _ = s.Create(Input{VSID: 1, Day: 2, StartTime: "a", EndTime: "b", RoleType: "R", Headcount: 1})

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/vs/1/missions?day=1", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var xs []Mission
	_ = json.NewDecoder(rec.Body).Decode(&xs)
	if len(xs) != 1 || xs[0].Day != 1 {
		t.Fatalf("got %+v", xs)
	}
}

func TestHandlers_MissingFields(t *testing.T) {
	_, r := newTestHandler(t)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/vs/1/missions", strings.NewReader(`{"day":1}`)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
}

func TestHandlers_PatchAndDelete(t *testing.T) {
	s, r := newTestHandler(t)
	m, _ := s.Create(Input{VSID: 1, Day: 1, StartTime: "a", EndTime: "b", RoleType: "R", Headcount: 1})

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPatch, "/api/missions/"+strconv.FormatInt(m.ID, 10), strings.NewReader(`{"headcount":4}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("patch status = %d", rec.Code)
	}

	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, "/api/missions/"+strconv.FormatInt(m.ID, 10), nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d", rec.Code)
	}
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/missions/"+strconv.FormatInt(m.ID, 10), nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("get status = %d", rec.Code)
	}
}

func TestHandlers_GlobalList(t *testing.T) {
	s, r := newTestHandler(t)
	_, _ = s.Create(Input{VSID: 1, Day: 1, StartTime: "a", EndTime: "b", RoleType: "Ravito"})
	_, _ = s.Create(Input{VSID: 1, Day: 1, StartTime: "a", EndTime: "b", RoleType: "Balisage"})

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/missions?role=Ravito", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var xs []Mission
	_ = json.NewDecoder(rec.Body).Decode(&xs)
	if len(xs) != 1 || xs[0].RoleType != "Ravito" {
		t.Fatalf("got %+v", xs)
	}
}
