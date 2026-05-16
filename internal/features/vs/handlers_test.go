package vs

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func newTestHandler(t *testing.T) (*Handler, chi.Router, string) {
	t.Helper()
	dir := t.TempDir()
	h := NewHandler(newTestStore(t), dir)
	r := chi.NewRouter()
	h.Mount(r)
	return h, r, dir
}

func decodeJSON[T any](t *testing.T, body io.Reader) T {
	t.Helper()
	var out T
	if err := json.NewDecoder(body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return out
}

func createVS(t *testing.T, r chi.Router, body string) VS {
	t.Helper()
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/vs", strings.NewReader(body)))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", rec.Code, rec.Body.String())
	}
	return decodeJSON[VS](t, rec.Body)
}

func TestHandlers_CreateAndList(t *testing.T) {
	_, r, _ := newTestHandler(t)
	v := createVS(t, r, `{"name":"A","lat":45.0,"lon":6.0}`)
	if v.ID == 0 {
		t.Fatalf("returned id = 0")
	}

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/vs", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("list status = %d", rec.Code)
	}
	xs := decodeJSON[[]VS](t, rec.Body)
	if len(xs) != 1 || xs[0].Name != "A" {
		t.Fatalf("xs = %+v", xs)
	}
}

func TestHandlers_DuplicateName_409(t *testing.T) {
	_, r, _ := newTestHandler(t)
	createVS(t, r, `{"name":"A","lat":45,"lon":6}`)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/vs",
		strings.NewReader(`{"name":"A","lat":46,"lon":6}`)))
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", rec.Code)
	}
}

func TestHandlers_InvalidCoords(t *testing.T) {
	_, r, _ := newTestHandler(t)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/vs",
		strings.NewReader(`{"name":"A","lat":999,"lon":6}`)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
}

func TestHandlers_PatchMovesPoint(t *testing.T) {
	_, r, _ := newTestHandler(t)
	v := createVS(t, r, `{"name":"A","lat":45.0,"lon":6.0}`)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPatch, "/api/vs/"+itoa(v.ID),
		strings.NewReader(`{"lat":45.5}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	got := decodeJSON[VS](t, rec.Body)
	if got.Lat != 45.5 || got.Lon != 6.0 {
		t.Fatalf("got = %+v, want lat=45.5 lon=6.0", got)
	}
}

func TestHandlers_DeleteThen404(t *testing.T) {
	_, r, _ := newTestHandler(t)
	v := createVS(t, r, `{"name":"A","lat":45,"lon":6}`)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, "/api/vs/"+itoa(v.ID), nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/vs/"+itoa(v.ID), nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

// minimal 1x1 PNG (transparent).
var pngBytes = []byte{
	0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A,
	0x00, 0x00, 0x00, 0x0D, 'I', 'H', 'D', 'R',
	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
	0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
	0x89, 0x00, 0x00, 0x00, 0x0D, 'I', 'D', 'A', 'T',
	0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05,
	0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00,
	0x00, 0x00, 'I', 'E', 'N', 'D', 0xAE, 0x42, 0x60, 0x82,
}

func TestHandlers_PhotoUpload(t *testing.T) {
	_, r, dir := newTestHandler(t)
	v := createVS(t, r, `{"name":"A","lat":45,"lon":6}`)

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	part, err := mw.CreateFormFile("photo", "a.png")
	if err != nil {
		t.Fatalf("CreateFormFile: %v", err)
	}
	if _, err := part.Write(pngBytes); err != nil {
		t.Fatalf("write part: %v", err)
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("mw.Close: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/vs/"+itoa(v.ID)+"/photo", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	got := decodeJSON[VS](t, rec.Body)
	if got.PhotoPath == nil || !strings.HasPrefix(*got.PhotoPath, "/assets/vs/") || !strings.HasSuffix(*got.PhotoPath, ".png") {
		t.Fatalf("photo_path = %v, want /assets/vs/<hash>.png", got.PhotoPath)
	}
	// File should exist on disk.
	expectedFile := filepath.Join(dir, strings.TrimPrefix(*got.PhotoPath, "/assets/"))
	if _, err := os.Stat(expectedFile); err != nil {
		t.Fatalf("expected file on disk at %s: %v", expectedFile, err)
	}
}

func TestHandlers_PhotoUpload_RejectsBadMime(t *testing.T) {
	_, r, _ := newTestHandler(t)
	v := createVS(t, r, `{"name":"A","lat":45,"lon":6}`)

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	part, _ := mw.CreateFormFile("photo", "a.txt")
	_, _ = part.Write([]byte("not an image"))
	if err := mw.Close(); err != nil {
		t.Fatalf("mw.Close: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/vs/"+itoa(v.ID)+"/photo", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("status = %d, want 415", rec.Code)
	}
}

func itoa(i int64) string { return strconv.FormatInt(i, 10) }
