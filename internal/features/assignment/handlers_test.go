package assignment

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

func TestHandlers_CreateDuplicate409(t *testing.T) {
	_, r := newTestHandler(t)
	body := `{"mission_id":1,"volunteer_id":1}`
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/assignments", strings.NewReader(body)))
	if rec.Code != http.StatusCreated {
		t.Fatalf("first create = %d", rec.Code)
	}
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/assignments", strings.NewReader(body)))
	if rec.Code != http.StatusConflict {
		t.Fatalf("second create = %d, want 409", rec.Code)
	}
}

func TestHandlers_DeleteByID(t *testing.T) {
	s, r := newTestHandler(t)
	a, _ := s.Create(Input{MissionID: 1, VolunteerID: 1})
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, "/api/assignments/"+strconv.FormatInt(a.ID, 10), nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestHandlers_DeleteByPair(t *testing.T) {
	s, r := newTestHandler(t)
	_, _ = s.Create(Input{MissionID: 1, VolunteerID: 1})
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, "/api/assignments?volunteer=1&mission=1", nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestHandlers_ListForVolunteer(t *testing.T) {
	s, r := newTestHandler(t)
	_, _ = s.Create(Input{MissionID: 1, VolunteerID: 1})
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/assignments?volunteer=1", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var xs []Assignment
	_ = json.NewDecoder(rec.Body).Decode(&xs)
	if len(xs) != 1 {
		t.Fatalf("len = %d, want 1", len(xs))
	}
}

func TestHandlers_MissingFields422(t *testing.T) {
	_, r := newTestHandler(t)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/assignments", strings.NewReader(`{"mission_id":1}`)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d", rec.Code)
	}
}
