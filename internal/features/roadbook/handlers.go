// Package roadbook (feature) exposes the HTTP endpoints that drive PDF
// generation, preview, and download. The pure rendering lives in
// internal/roadbook; this package is the chi-mounted glue.
package roadbook

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/guillaumetavernier/volunteersmanager/internal/features/event"
	rb "github.com/guillaumetavernier/volunteersmanager/internal/roadbook"
)

type Handler struct {
	DB         *sql.DB
	Events     *event.Store
	AssetDir   string
	ExportRoot string // typically <dataDir>/exports
}

func NewHandler(db *sql.DB, events *event.Store, assetDir, exportRoot string) *Handler {
	return &Handler{DB: db, Events: events, AssetDir: assetDir, ExportRoot: exportRoot}
}

func (h *Handler) Mount(r chi.Router) {
	r.Post("/api/roadbooks/generate", h.generate)
	r.Post("/api/roadbooks/preview", h.preview)
	r.Get("/api/roadbooks/files/{filename}", h.download)
}

type errorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

type generateResponse struct {
	VolunteerPDFs []generatedFile `json:"volunteer_pdfs"`
	MasterPDF     string          `json:"master_pdf"`
}

type generatedFile struct {
	VolunteerID int64  `json:"volunteer_id"`
	Filename    string `json:"filename"`
}

func (h *Handler) generate(w http.ResponseWriter, r *http.Request) {
	ev, err := h.Events.Get()
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "no_event", Message: err.Error()})
		return
	}
	settings := event.ReadRoadbookSettings(ev.Settings)
	state, err := rb.LoadEventState(r.Context(), h.DB, ev)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "load", Message: err.Error()})
		return
	}
	dir, err := h.eventExportDir(ev)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "mkdir", Message: err.Error()})
		return
	}

	resp := generateResponse{VolunteerPDFs: []generatedFile{}}
	for _, id := range state.VolunteerIDs {
		data, err := rb.BuildVolunteerData(state, id)
		if err != nil {
			continue
		}
		name := fmt.Sprintf("roadbook_%s_%s.pdf", sanitize(data.LastName), sanitize(data.FirstName))
		abs := filepath.Join(dir, name)
		f, err := os.Create(abs)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "write", Message: err.Error()})
			return
		}
		if err := rb.RenderVolunteer(data, settings, h.AssetDir, f); err != nil {
			_ = f.Close()
			writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "render", Message: err.Error()})
			return
		}
		_ = f.Close()
		resp.VolunteerPDFs = append(resp.VolunteerPDFs, generatedFile{VolunteerID: id, Filename: name})
	}
	masterName := fmt.Sprintf("master_%s.pdf", sanitize(ev.Name))
	mf, err := os.Create(filepath.Join(dir, masterName))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "write_master", Message: err.Error()})
		return
	}
	if err := rb.RenderMaster(state, settings, h.AssetDir, mf); err != nil {
		_ = mf.Close()
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "render_master", Message: err.Error()})
		return
	}
	_ = mf.Close()
	resp.MasterPDF = masterName
	writeJSON(w, http.StatusOK, resp)
}

type previewRequest struct {
	VolunteerID      int64                  `json:"volunteer_id"`
	SettingsOverride *event.RoadbookSettings `json:"settings_override,omitempty"`
}

type previewResponse struct {
	Filename string `json:"filename"`
}

func (h *Handler) preview(w http.ResponseWriter, r *http.Request) {
	var req previewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_request", Message: err.Error()})
		return
	}
	if req.VolunteerID == 0 {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "missing_volunteer_id"})
		return
	}
	ev, err := h.Events.Get()
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "no_event", Message: err.Error()})
		return
	}
	settings := event.ReadRoadbookSettings(ev.Settings)
	if req.SettingsOverride != nil {
		settings = *req.SettingsOverride
		if len(settings.SectionOrder) == 0 {
			settings.SectionOrder = event.AllSectionKinds
		}
		if settings.SectionVisible == nil {
			settings.SectionVisible = map[event.SectionKind]bool{}
			for _, k := range event.AllSectionKinds {
				settings.SectionVisible[k] = true
			}
		}
	}
	state, err := rb.LoadEventState(r.Context(), h.DB, ev)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "load", Message: err.Error()})
		return
	}
	data, err := rb.BuildVolunteerData(state, req.VolunteerID)
	if errors.Is(err, rb.ErrVolunteerNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "volunteer_not_found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "gather", Message: err.Error()})
		return
	}
	previewDir, err := h.eventPreviewDir(ev)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "mkdir", Message: err.Error()})
		return
	}
	// Hash settings + volunteer id for a deterministic but unique filename.
	enc, _ := json.Marshal(settings)
	sum := sha256.Sum256(append(enc, []byte(fmt.Sprintf("|%d", req.VolunteerID))...))
	name := "preview_" + hex.EncodeToString(sum[:8]) + ".pdf"
	abs := filepath.Join(previewDir, name)
	f, err := os.Create(abs)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "write", Message: err.Error()})
		return
	}
	if err := rb.RenderVolunteer(data, settings, h.AssetDir, f); err != nil {
		_ = f.Close()
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "render", Message: err.Error()})
		return
	}
	_ = f.Close()
	writeJSON(w, http.StatusOK, previewResponse{Filename: name})
}

func (h *Handler) download(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "filename")
	if !validFilename(name) {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_filename"})
		return
	}
	ev, err := h.Events.Get()
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "no_event", Message: err.Error()})
		return
	}
	dir, err := h.eventExportDir(ev)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "no_export_dir", Message: err.Error()})
		return
	}
	previewDir := filepath.Join(dir, "preview")
	candidates := []string{
		filepath.Join(dir, name),
		filepath.Join(previewDir, name),
	}
	for _, p := range candidates {
		clean := filepath.Clean(p)
		// Ensure the cleaned path stays within dir (no path traversal).
		if !strings.HasPrefix(clean, filepath.Clean(dir)+string(os.PathSeparator)) {
			continue
		}
		f, err := os.Open(clean)
		if err != nil {
			continue
		}
		defer func() { _ = f.Close() }()
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Disposition", "inline; filename=\""+name+"\"")
		buf := make([]byte, 4096)
		for {
			n, err := f.Read(buf)
			if n > 0 {
				_, _ = w.Write(buf[:n])
			}
			if err != nil {
				break
			}
		}
		return
	}
	writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
}

// validFilename rejects path-traversal characters and enforces a .pdf extension.
func validFilename(name string) bool {
	if name == "" || strings.ContainsAny(name, "/\\") || strings.Contains(name, "..") {
		return false
	}
	return strings.HasSuffix(strings.ToLower(name), ".pdf")
}

func (h *Handler) eventExportDir(ev event.Event) (string, error) {
	slug := sanitize(ev.Name)
	dir := filepath.Join(h.ExportRoot, slug)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

func (h *Handler) eventPreviewDir(ev event.Event) (string, error) {
	base, err := h.eventExportDir(ev)
	if err != nil {
		return "", err
	}
	p := filepath.Join(base, "preview")
	if err := os.MkdirAll(p, 0o755); err != nil {
		return "", err
	}
	return p, nil
}

// SweepPreviews deletes preview PDFs older than maxAge. Called at server boot.
func SweepPreviews(ctx context.Context, exportRoot string, maxAge time.Duration, now time.Time) error {
	if exportRoot == "" {
		return nil
	}
	entries, err := os.ReadDir(exportRoot)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	cutoff := now.Add(-maxAge)
	for _, e := range entries {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if !e.IsDir() {
			continue
		}
		preview := filepath.Join(exportRoot, e.Name(), "preview")
		files, err := os.ReadDir(preview)
		if err != nil {
			continue
		}
		for _, f := range files {
			if f.IsDir() {
				continue
			}
			info, err := f.Info()
			if err != nil {
				continue
			}
			if info.ModTime().Before(cutoff) {
				_ = os.Remove(filepath.Join(preview, f.Name()))
			}
		}
	}
	return nil
}

// sanitize is the slug helper used by filenames + folder names.
func sanitize(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(s)) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == ' ' || r == '_' || r == '-' || r == '\'':
			b.WriteByte('_')
		}
	}
	if b.Len() == 0 {
		return "x"
	}
	return b.String()
}
