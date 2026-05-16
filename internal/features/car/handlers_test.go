package car

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

func TestHandlers_CreateAndList(t *testing.T) {
	_, r := newTestHandler(t)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/cars", strings.NewReader(`{"name":"Kangoo","seats":5}`)))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/cars", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("list status = %d", rec.Code)
	}
	var xs []Car
	_ = json.NewDecoder(rec.Body).Decode(&xs)
	if len(xs) != 1 {
		t.Fatalf("len = %d", len(xs))
	}
}

func TestHandlers_CreateWithInvalidDriver422(t *testing.T) {
	s, r := newTestHandler(t)
	id := mustInsertVolunteer(t, s, "A", "B", false)
	rec := httptest.NewRecorder()
	body := `{"name":"X","seats":4,"default_driver_id":` + strconv.FormatInt(id, 10) + `}`
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/cars", strings.NewReader(body)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422; body=%s", rec.Code, rec.Body.String())
	}
}

func TestHandlers_DuplicateName409(t *testing.T) {
	_, r := newTestHandler(t)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/cars", strings.NewReader(`{"name":"A","seats":1}`)))
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/cars", strings.NewReader(`{"name":"A","seats":2}`)))
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", rec.Code)
	}
}
