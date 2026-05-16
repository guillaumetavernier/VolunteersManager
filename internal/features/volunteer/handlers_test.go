package volunteer

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/guillaumetavernier/volunteersmanager/internal/features/event"
)

func newTestHandler(t *testing.T) (*Store, chi.Router) {
	t.Helper()
	return newTestHandlerWithCountry(t, "FR")
}

func newTestHandlerWithCountry(t *testing.T, country string) (*Store, chi.Router) {
	t.Helper()
	s := newTestStore(t)
	ev := event.NewStore(s.DB)
	if _, err := ev.Upsert(event.Event{
		Name:        "Test",
		StartDate:   "2026-06-01",
		EndDate:     "2026-06-02",
		Timezone:    "Europe/Paris",
		CountryCode: country,
	}); err != nil {
		t.Fatalf("seed event: %v", err)
	}
	r := chi.NewRouter()
	NewHandler(s, ev).Mount(r)
	return s, r
}

func postJSON(t *testing.T, r chi.Router, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, path, strings.NewReader(body)))
	return rec
}

func TestHandlers_CreateAndList(t *testing.T) {
	_, r := newTestHandler(t)
	rec := postJSON(t, r, "/api/volunteers", `{"first_name":"Marie","last_name":"Dupont","phone":"+33611111111","role_types":["Ravitaillement"]}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d; body=%s", rec.Code, rec.Body.String())
	}
	var v Volunteer
	if err := json.NewDecoder(rec.Body).Decode(&v); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if v.ID == 0 || len(v.RoleTypes) != 1 {
		t.Fatalf("got %+v", v)
	}

	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/volunteers", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("list status = %d", rec.Code)
	}
	var xs []Volunteer
	if err := json.NewDecoder(rec.Body).Decode(&xs); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(xs) != 1 {
		t.Fatalf("len = %d, want 1", len(xs))
	}
}

func TestHandlers_DeleteArchivesByDefault(t *testing.T) {
	_, r := newTestHandler(t)
	rec := postJSON(t, r, "/api/volunteers", `{"first_name":"A","last_name":"B","phone":"+33611111111"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create %d", rec.Code)
	}
	var v Volunteer
	_ = json.NewDecoder(rec.Body).Decode(&v)

	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, "/api/volunteers/"+strconv.FormatInt(v.ID, 10), nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete %d", rec.Code)
	}

	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/volunteers", nil))
	var xs []Volunteer
	_ = json.NewDecoder(rec.Body).Decode(&xs)
	if len(xs) != 0 {
		t.Fatalf("after archive default list len = %d", len(xs))
	}
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/volunteers?archived=true", nil))
	xs = nil
	_ = json.NewDecoder(rec.Body).Decode(&xs)
	if len(xs) != 1 {
		t.Fatalf("after archive archived=true list len = %d", len(xs))
	}
}

func TestHandlers_HardDelete409WithDependents(t *testing.T) {
	s, r := newTestHandler(t)
	rec := postJSON(t, r, "/api/volunteers", `{"first_name":"A","last_name":"B","phone":"+33611111111","can_drive":true}`)
	var v Volunteer
	_ = json.NewDecoder(rec.Body).Decode(&v)
	if _, err := s.DB.Exec(`INSERT INTO cars (name, seats, default_driver_id) VALUES (?, ?, ?)`, "Berlingo", 5, v.ID); err != nil {
		t.Fatalf("insert car: %v", err)
	}

	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, "/api/volunteers/"+strconv.FormatInt(v.ID, 10)+"?hard=true", nil))
	if rec.Code != http.StatusConflict {
		t.Fatalf("delete hard status = %d, want 409", rec.Code)
	}

	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, "/api/volunteers/"+strconv.FormatInt(v.ID, 10)+"?hard=true&force=true", nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete hard force status = %d", rec.Code)
	}
}

func TestHandlers_MissingFields422(t *testing.T) {
	_, r := newTestHandler(t)
	rec := postJSON(t, r, "/api/volunteers", `{"first_name":"A"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
}

func TestHandlers_CreateNormalizesPhoneToE164(t *testing.T) {
	_, r := newTestHandlerWithCountry(t, "FR")
	rec := postJSON(t, r, "/api/volunteers", `{"first_name":"Sophie","last_name":"Bernard","phone":"06 12 34 56 78"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d; body=%s", rec.Code, rec.Body.String())
	}
	var v Volunteer
	if err := json.NewDecoder(rec.Body).Decode(&v); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if v.Phone != "+33612345678" {
		t.Fatalf("phone = %q, want +33612345678", v.Phone)
	}
}

func TestHandlers_CreateRejectsUnparseablePhone(t *testing.T) {
	_, r := newTestHandlerWithCountry(t, "FR")
	rec := postJSON(t, r, "/api/volunteers", `{"first_name":"X","last_name":"Y","phone":"not-a-phone"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422; body=%s", rec.Code, rec.Body.String())
	}
	var ep errorPayload
	if err := json.NewDecoder(rec.Body).Decode(&ep); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if ep.Code != "phone_invalid" {
		t.Fatalf("code = %q, want phone_invalid", ep.Code)
	}
}

func TestHandlers_PatchNormalizesPhoneAndRejectsBad(t *testing.T) {
	_, r := newTestHandlerWithCountry(t, "FR")
	rec := postJSON(t, r, "/api/volunteers", `{"first_name":"A","last_name":"B","phone":"+33611111111"}`)
	var v Volunteer
	_ = json.NewDecoder(rec.Body).Decode(&v)

	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPatch, "/api/volunteers/"+strconv.FormatInt(v.ID, 10), strings.NewReader(`{"phone":"06 22 22 22 22"}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d; body=%s", rec.Code, rec.Body.String())
	}
	var got Volunteer
	_ = json.NewDecoder(rec.Body).Decode(&got)
	if got.Phone != "+33622222222" {
		t.Fatalf("phone = %q, want +33622222222", got.Phone)
	}

	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPatch, "/api/volunteers/"+strconv.FormatInt(v.ID, 10), strings.NewReader(`{"phone":"garbage"}`)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("bad phone status = %d, want 422", rec.Code)
	}
}

func TestHandlers_PatchArchived(t *testing.T) {
	_, r := newTestHandler(t)
	rec := postJSON(t, r, "/api/volunteers", `{"first_name":"A","last_name":"B","phone":"+33611111111"}`)
	var v Volunteer
	_ = json.NewDecoder(rec.Body).Decode(&v)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPatch, "/api/volunteers/"+strconv.FormatInt(v.ID, 10), strings.NewReader(`{"archived":true}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var got Volunteer
	_ = json.NewDecoder(rec.Body).Decode(&got)
	if !got.Archived {
		t.Fatalf("archived not set")
	}
}
