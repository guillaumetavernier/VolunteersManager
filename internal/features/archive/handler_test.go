package archive

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/guillaumetavernier/volunteersmanager/internal/archive"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/event"
	"github.com/guillaumetavernier/volunteersmanager/internal/store"
)

func newTestDB(t *testing.T) (*sql.DB, string) {
	t.Helper()
	dir := t.TempDir()
	st, err := store.Open(filepath.Join(dir, "event.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := st.Migrate(); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	_, err = st.DB.Exec(`INSERT INTO events (id, name, start_date, end_date, timezone, country_code, settings)
		VALUES (1, 'Trail Demo', '2026-06-01', '2026-06-02', 'Europe/Paris', 'FR', '{}')`)
	if err != nil {
		t.Fatalf("seed event: %v", err)
	}
	return st.DB, dir
}

func TestExportEndpoint_ReturnsZip(t *testing.T) {
	db, dir := newTestDB(t)
	h := NewHandler(db, event.NewStore(db), dir, dir)
	r := chi.NewRouter()
	h.Mount(r)

	req := httptest.NewRequest(http.MethodGet, "/api/archive/export", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Header().Get("Content-Disposition"), "trail_demo") {
		t.Fatalf("disposition: %q", rec.Header().Get("Content-Disposition"))
	}
	if !bytes.HasPrefix(rec.Body.Bytes(), []byte{'P', 'K'}) {
		t.Fatalf("body does not look like a zip: prefix=%v", rec.Body.Bytes()[:4])
	}
}

func TestImportEndpoint_WritesNewDB(t *testing.T) {
	db, dir := newTestDB(t)

	// Build a real export zip we can re-upload.
	var zipBuf bytes.Buffer
	if err := archive.Export(db, "Trail Demo", dir, filepath.Join(dir, "gpx"), &zipBuf); err != nil {
		t.Fatalf("export: %v", err)
	}

	uploadDir := t.TempDir()
	h := NewHandler(db, event.NewStore(db), dir, uploadDir)
	r := chi.NewRouter()
	h.Mount(r)

	body := &bytes.Buffer{}
	mw := multipart.NewWriter(body)
	fw, _ := mw.CreateFormFile("file", "archive.zip")
	if _, err := io.Copy(fw, bytes.NewReader(zipBuf.Bytes())); err != nil {
		t.Fatalf("copy: %v", err)
	}
	_ = mw.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/archive/import", body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp importResp
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if _, err := os.Stat(resp.Path); err != nil {
		t.Fatalf("imported db missing: %v", err)
	}
}

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Trail des Cimes": "trail_des_cimes",
		"  ":              "event",
		"Hello!! World":   "hello_world",
		"":                "event",
	}
	for in, want := range cases {
		if got := slugify(in); got != want {
			t.Errorf("slugify(%q) = %q, want %q", in, got, want)
		}
	}
}
