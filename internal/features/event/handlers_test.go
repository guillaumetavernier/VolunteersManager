package event

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func newTestHandler(t *testing.T) (*Handler, chi.Router) {
	t.Helper()
	h := NewHandler(newTestStore(t))
	h.AssetDir = t.TempDir()
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

func TestHandler_UploadLogo_PNG(t *testing.T) {
	h, r := newTestHandler(t)
	_, _ = h.Store.Upsert(Event{Name: "T", StartDate: "2026-01-01", EndDate: "2026-01-02"})

	body := &bytes.Buffer{}
	mw := multipart.NewWriter(body)
	part, err := mw.CreateFormFile("file", "logo.png")
	if err != nil {
		t.Fatal(err)
	}
	// Minimal PNG magic header + IEND chunk so the magic detection passes.
	_, _ = part.Write([]byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00})
	_ = mw.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/event/logo", body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp uploadResp
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(resp.Path, "assets/logo/") || !strings.HasSuffix(resp.Path, ".png") {
		t.Fatalf("path=%q", resp.Path)
	}
	ev, _ := h.Store.Get()
	if ev.LogoPath == nil || *ev.LogoPath != resp.Path {
		t.Fatalf("logo_path not persisted: %+v", ev.LogoPath)
	}
}

func TestHandler_UploadLogo_BadMimeRejected(t *testing.T) {
	h, r := newTestHandler(t)
	_, _ = h.Store.Upsert(Event{Name: "T", StartDate: "2026-01-01", EndDate: "2026-01-02"})
	body := &bytes.Buffer{}
	mw := multipart.NewWriter(body)
	part, _ := mw.CreateFormFile("file", "x.gif")
	_, _ = part.Write([]byte{'G', 'I', 'F', '8', '9', 'a'})
	_ = mw.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/event/logo", body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
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
