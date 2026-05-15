package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

func mountSvc(t *testing.T, svc *TileService) chi.Router {
	t.Helper()
	r := chi.NewRouter()
	svc.Mount(r)
	return r
}

func TestTiles_ServeMissingFile_404(t *testing.T) {
	dir := t.TempDir()
	r := mountSvc(t, NewTileService(dir, ""))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/tiles/europe-france.pmtiles", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestTiles_ServeUnknownRegion_404(t *testing.T) {
	dir := t.TempDir()
	r := mountSvc(t, NewTileService(dir, ""))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/tiles/atlantis.pmtiles", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestTiles_ServeRangeRequest(t *testing.T) {
	dir := t.TempDir()
	payload := make([]byte, 1024)
	for i := range payload {
		payload[i] = byte(i % 256)
	}
	if err := os.WriteFile(filepath.Join(dir, "europe-france.pmtiles"), payload, 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	r := mountSvc(t, NewTileService(dir, ""))

	req := httptest.NewRequest(http.MethodGet, "/tiles/europe-france.pmtiles", nil)
	req.Header.Set("Range", "bytes=10-19")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusPartialContent {
		t.Fatalf("status = %d, want 206", rec.Code)
	}
	if rec.Body.Len() != 10 {
		t.Fatalf("body len = %d, want 10", rec.Body.Len())
	}
	if rec.Header().Get("Accept-Ranges") != "bytes" {
		t.Fatalf("missing Accept-Ranges header")
	}
}

func TestTiles_DownloadFlow(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "16")
		_, _ = w.Write([]byte("PMTILES_FAKE_BODY"[:16]))
	}))
	defer upstream.Close()

	dir := t.TempDir()
	svc := NewTileService(dir, upstream.URL)
	r := mountSvc(t, svc)

	body := strings.NewReader(`{"region":"europe-france"}`)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/tiles/download", body))
	if rec.Code != http.StatusAccepted {
		t.Fatalf("download status = %d, want 202; body=%s", rec.Code, rec.Body.String())
	}

	// Poll status until done.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/tiles/download/status", nil))
		var st DownloadStatus
		if err := json.NewDecoder(rec.Body).Decode(&st); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if st.State == StateDone {
			break
		}
		if st.State == StateError {
			t.Fatalf("download errored: %s", st.Error)
		}
		time.Sleep(20 * time.Millisecond)
	}
	final := filepath.Join(dir, "europe-france.pmtiles")
	if _, err := os.Stat(final); err != nil {
		t.Fatalf("expected final file at %s: %v", final, err)
	}
}

func TestTiles_DownloadRejectsUnknownRegion(t *testing.T) {
	dir := t.TempDir()
	r := mountSvc(t, NewTileService(dir, "http://example/"))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/tiles/download",
		strings.NewReader(`{"region":"narnia"}`)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
}

func TestTiles_AreTilesEmpty(t *testing.T) {
	dir := t.TempDir()
	if !AreTilesEmpty(dir) {
		t.Fatalf("fresh dir should be empty")
	}
	if err := os.WriteFile(filepath.Join(dir, "europe-france.pmtiles"), []byte("x"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if AreTilesEmpty(dir) {
		t.Fatalf("dir with a pmtiles should not report empty")
	}
}
