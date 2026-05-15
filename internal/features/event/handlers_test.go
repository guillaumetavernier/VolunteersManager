package event

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func newTestHandler(t *testing.T) (*Handler, chi.Router) {
	t.Helper()
	h := NewHandler(newTestStore(t))
	r := chi.NewRouter()
	h.Mount(r)
	return h, r
}

func TestHandler_Get_NotInitialized(t *testing.T) {
	_, r := newTestHandler(t)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/event", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	var body errorPayload
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Code != "not_initialized" {
		t.Fatalf("code = %q, want not_initialized", body.Code)
	}
}

func TestHandler_Put_CreatesAndReturnsEvent(t *testing.T) {
	_, r := newTestHandler(t)
	rec := httptest.NewRecorder()
	body := strings.NewReader(`{"name":"Trail X","start_date":"2026-06-01","end_date":"2026-06-03"}`)
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPut, "/api/event", body))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	var got Event
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Name != "Trail X" || got.Timezone != "Europe/Paris" || got.CountryCode != "FR" {
		t.Fatalf("got = %+v, want name=Trail X, tz=Europe/Paris, country=FR (defaults applied)", got)
	}
}

func TestHandler_Put_MissingFields(t *testing.T) {
	_, r := newTestHandler(t)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPut, "/api/event", strings.NewReader(`{}`)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
}

func TestHandler_GetAfterPut(t *testing.T) {
	_, r := newTestHandler(t)
	r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPut, "/api/event",
		strings.NewReader(`{"name":"X","start_date":"2026-06-01","end_date":"2026-06-03"}`)))

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/event", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}
