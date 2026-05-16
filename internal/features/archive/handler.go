// Package archive (feature) exposes HTTP endpoints to download and upload
// event archives produced by internal/archive.
package archive

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"unicode"

	"github.com/go-chi/chi/v5"

	"github.com/guillaumetavernier/volunteersmanager/internal/archive"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/event"
)

const maxImportBytes = 200 * 1024 * 1024

type Handler struct {
	DB        *sql.DB
	Event     *event.Store
	AssetDir  string
	GPXDir    string
	UploadDir string
}

func NewHandler(db *sql.DB, ev *event.Store, assetDir, uploadDir string) *Handler {
	return &Handler{
		DB:        db,
		Event:     ev,
		AssetDir:  assetDir,
		GPXDir:    filepath.Join(assetDir, "gpx"),
		UploadDir: uploadDir,
	}
}

func (h *Handler) Mount(r chi.Router) {
	r.Get("/api/archive/export", h.export)
	r.Post("/api/archive/import", h.importZip)
}

type errPayload struct {
	Code    string `json:"code"`
	Message string `json:"message,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func (h *Handler) export(w http.ResponseWriter, _ *http.Request) {
	ev, err := h.Event.Get()
	name := "event"
	if err == nil {
		name = ev.Name
	}
	filename := fmt.Sprintf("event_%s_archive.zip", slugify(name))
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename=%q`, filename))
	if err := archive.Export(h.DB, name, h.AssetDir, h.GPXDir, w); err != nil {
		// Headers may be partially flushed; logging is enough.
		_, _ = w.Write([]byte("\n"))
		_ = err
	}
}

type importResp struct {
	Path string `json:"path"`
}

func (h *Handler) importZip(w http.ResponseWriter, r *http.Request) {
	if h.UploadDir == "" {
		writeJSON(w, http.StatusInternalServerError, errPayload{Code: "no_upload_dir"})
		return
	}
	if err := r.ParseMultipartForm(maxImportBytes + 1024); err != nil {
		writeJSON(w, http.StatusBadRequest, errPayload{Code: "bad_multipart", Message: err.Error()})
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errPayload{Code: "missing_file"})
		return
	}
	defer func() { _ = file.Close() }()
	buf, err := io.ReadAll(io.LimitReader(file, maxImportBytes+1))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errPayload{Code: "read", Message: err.Error()})
		return
	}
	if len(buf) > maxImportBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, errPayload{Code: "too_large"})
		return
	}
	sum := sha256.Sum256(buf)
	short := hex.EncodeToString(sum[:])[:8]
	dbPath := filepath.Join(h.UploadDir, fmt.Sprintf("event_imported_%s.db", short))
	assetsDir := filepath.Join(h.UploadDir, fmt.Sprintf("event_imported_%s_assets", short))
	gpxDir := filepath.Join(assetsDir, "gpx")

	if err := os.MkdirAll(h.UploadDir, 0o755); err != nil {
		writeJSON(w, http.StatusInternalServerError, errPayload{Code: "mkdir", Message: err.Error()})
		return
	}
	if _, err := os.Stat(dbPath); err == nil {
		writeJSON(w, http.StatusOK, importResp{Path: dbPath})
		return
	}
	if err := archive.Import(strings.NewReader(string(buf)), dbPath, assetsDir, gpxDir); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, errPayload{Code: "import_failed", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, importResp{Path: dbPath})
}

// slugify turns "Trail des Cimes" into "trail_des_cimes".
func slugify(s string) string {
	var b strings.Builder
	prevSep := true
	for _, r := range s {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			b.WriteRune(unicode.ToLower(r))
			prevSep = false
		default:
			if !prevSep {
				b.WriteByte('_')
				prevSep = true
			}
		}
	}
	out := strings.Trim(b.String(), "_")
	if out == "" {
		return "event"
	}
	return out
}
