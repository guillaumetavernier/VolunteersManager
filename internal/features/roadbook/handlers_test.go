package roadbook

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/guillaumetavernier/volunteersmanager/internal/features/event"
	"github.com/guillaumetavernier/volunteersmanager/internal/store"
)

func newTestHandler(t *testing.T) (*Handler, chi.Router, string) {
	t.Helper()
	dir := t.TempDir()
	s, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	if err := s.Migrate(); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	es := event.NewStore(s.DB)
	if _, err := es.Upsert(event.Event{Name: "T", StartDate: "2026-06-01", EndDate: "2026-06-02"}); err != nil {
		t.Fatalf("upsert event: %v", err)
	}
	exportDir := filepath.Join(dir, "exports")
	assetDir := filepath.Join(dir, "assets")
	h := NewHandler(s.DB, es, assetDir, exportDir)
	r := chi.NewRouter()
	h.Mount(r)
	return h, r, dir
}

func TestGenerate_EmptyEventStillRunsAndReturnsMaster(t *testing.T) {
	_, r, _ := newTestHandler(t)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/roadbooks/generate", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d; body=%s", rec.Code, rec.Body.String())
	}
	var resp generateResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.MasterPDF == "" || !strings.HasSuffix(resp.MasterPDF, ".pdf") {
		t.Fatalf("master = %q", resp.MasterPDF)
	}
}

func TestDownload_PathTraversalRejected(t *testing.T) {
	_, r, _ := newTestHandler(t)
	for _, name := range []string{"../escape.pdf", "..%2Fboot.pdf", "evil/file.pdf", "no_ext"} {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/roadbooks/files/"+name, nil))
		if rec.Code == http.StatusOK {
			t.Fatalf("name %q returned 200", name)
		}
	}
}

func TestDownload_KnownFileServed(t *testing.T) {
	h, r, _ := newTestHandler(t)
	ev, _ := h.Events.Get()
	dir, _ := h.eventExportDir(ev)
	want := []byte("%PDF-1.4\n%abc\n")
	if err := os.WriteFile(filepath.Join(dir, "roadbook_aigle_alice.pdf"), want, 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/roadbooks/files/roadbook_aigle_alice.pdf", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if !strings.HasPrefix(rec.Body.String(), "%PDF-1.4") {
		t.Fatalf("body=%q", rec.Body.String())
	}
}

func TestPreview_RoundTrip(t *testing.T) {
	h, r, _ := newTestHandler(t)
	// Seed one volunteer.
	if _, err := h.DB.Exec(`INSERT INTO volunteers (first_name,last_name,phone) VALUES ('Alice','Aigle','+33611111111')`); err != nil {
		t.Fatalf("seed: %v", err)
	}
	rec := httptest.NewRecorder()
	body := `{"volunteer_id":1}`
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/roadbooks/preview", strings.NewReader(body)))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d; body=%s", rec.Code, rec.Body.String())
	}
	var pr previewResponse
	if err := json.NewDecoder(rec.Body).Decode(&pr); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if pr.Filename == "" {
		t.Fatal("empty filename")
	}
	// Verify the file is downloadable.
	rec2 := httptest.NewRecorder()
	r.ServeHTTP(rec2, httptest.NewRequest(http.MethodGet, "/api/roadbooks/files/"+pr.Filename, nil))
	if rec2.Code != http.StatusOK {
		t.Fatalf("download status = %d", rec2.Code)
	}
}

func TestSweepPreviews_DeletesStale(t *testing.T) {
	dir := t.TempDir()
	slug := filepath.Join(dir, "myevent", "preview")
	_ = os.MkdirAll(slug, 0o755)
	stale := filepath.Join(slug, "old.pdf")
	fresh := filepath.Join(slug, "new.pdf")
	_ = os.WriteFile(stale, []byte("x"), 0o644)
	_ = os.WriteFile(fresh, []byte("x"), 0o644)
	// Make stale modification time 2h ago.
	old := time.Now().Add(-2 * time.Hour)
	_ = os.Chtimes(stale, old, old)
	if err := SweepPreviews(context.Background(), dir, time.Hour, time.Now()); err != nil {
		t.Fatalf("sweep: %v", err)
	}
	if _, err := os.Stat(stale); !os.IsNotExist(err) {
		t.Fatal("stale survived sweep")
	}
	if _, err := os.Stat(fresh); err != nil {
		t.Fatalf("fresh removed: %v", err)
	}
}
