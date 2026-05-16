package vs

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

const (
	maxPhotoBytes = 10 * 1024 * 1024
)

// OnMove is fired after a VS row's lat/lon changes via PATCH or after a fresh
// row is created. Wired by the server to the race recompute service; nil is a
// no-op so the package stays independently testable.
type OnMove func(vsID int64)

// DependentCounter reports how many child rows would be orphaned by a hard
// delete of the given VS. Wired by the server to mission/assignment stores;
// nil is treated as zero so the package stays independently testable.
type DependentCounter func(vsID int64) (Dependents, error)

// Dependents is the per-VS dependent summary returned in 409 bodies.
type Dependents struct {
	Missions    int `json:"missions"`
	Assignments int `json:"assignments"`
	Trips       int `json:"trips"`
}

// ForceCascader is called when a delete request includes ?force=true. It must
// remove every row that would otherwise block the VS delete via FK RESTRICT
// (trips with stops at this VS, today). Missions/assignments cascade via
// ON DELETE CASCADE so they don't need explicit cleanup. nil is a no-op.
type ForceCascader func(vsID int64) error

type Handler struct {
	Store        *Store
	AssetDir     string // absolute path to ./assets directory; photos go under <AssetDir>/vs/
	OnMove       OnMove
	Dependents   DependentCounter
	ForceCascade ForceCascader
}

func NewHandler(s *Store, assetDir string) *Handler {
	return &Handler{Store: s, AssetDir: assetDir}
}

func (h *Handler) fireMove(id int64) {
	if h.OnMove != nil {
		h.OnMove(id)
	}
}

func (h *Handler) Mount(r chi.Router) {
	r.Get("/api/vs", h.list)
	r.Post("/api/vs", h.create)
	r.Get("/api/vs/{id}", h.get)
	r.Patch("/api/vs/{id}", h.patch)
	r.Delete("/api/vs/{id}", h.delete)
	r.Post("/api/vs/{id}/photo", h.uploadPhoto)
	r.Get("/assets/vs/*", h.servePhoto)
}

type errorPayload struct {
	Code       string      `json:"code"`
	Message    string      `json:"message,omitempty"`
	Dependents *Dependents `json:"dependents,omitempty"`
}

func (h *Handler) list(w http.ResponseWriter, _ *http.Request) {
	xs, err := h.Store.List()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if xs == nil {
		xs = []VS{}
	}
	writeJSON(w, http.StatusOK, xs)
}

type createRequest struct {
	Name       string  `json:"name"`
	Lat        float64 `json:"lat"`
	Lon        float64 `json:"lon"`
	Notes      *string `json:"notes,omitempty"`
	What3Words *string `json:"what3words,omitempty"`
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var req createRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_request", Message: err.Error()})
		return
	}
	if req.Name == "" {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "missing_fields", Message: "name is required"})
		return
	}
	if !validLatLon(req.Lat, req.Lon) {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "invalid_coords"})
		return
	}
	v, err := h.Store.Create(req.Name, req.Lat, req.Lon, req.Notes, req.What3Words)
	if errors.Is(err, ErrDuplicateName) {
		writeJSON(w, http.StatusConflict, errorPayload{Code: "duplicate_name"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	h.fireMove(v.ID)
	writeJSON(w, http.StatusCreated, v)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	v, err := h.Store.Get(id)
	if errors.Is(err, ErrNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (h *Handler) patch(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	var p Patch
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_request", Message: err.Error()})
		return
	}
	if p.Lat != nil || p.Lon != nil {
		// If either is provided, both must lead to a valid coord. Look up the current row
		// and apply the patch values on top of it before validating.
		cur, err := h.Store.Get(id)
		if errors.Is(err, ErrNotFound) {
			writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
			return
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
			return
		}
		lat, lon := cur.Lat, cur.Lon
		if p.Lat != nil {
			lat = *p.Lat
		}
		if p.Lon != nil {
			lon = *p.Lon
		}
		if !validLatLon(lat, lon) {
			writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "invalid_coords"})
			return
		}
	}
	v, err := h.Store.Patch(id, p)
	if errors.Is(err, ErrNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
		return
	}
	if errors.Is(err, ErrDuplicateName) {
		writeJSON(w, http.StatusConflict, errorPayload{Code: "duplicate_name"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if p.Lat != nil || p.Lon != nil {
		h.fireMove(id)
	}
	writeJSON(w, http.StatusOK, v)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	force := r.URL.Query().Get("force") == "true"
	if h.Dependents != nil && !force {
		dep, err := h.Dependents(id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
			return
		}
		if dep.Missions > 0 || dep.Assignments > 0 || dep.Trips > 0 {
			writeJSON(w, http.StatusConflict, errorPayload{Code: "has_dependents", Dependents: &dep})
			return
		}
	}
	if force && h.ForceCascade != nil {
		if err := h.ForceCascade(id); err != nil {
			writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
			return
		}
	}
	if err := h.Store.Delete(id); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
			return
		}
		// FK RESTRICT (e.g., a stray trip_stops row referencing this VS) surfaces
		// here as a constraint error. Report it as a 409 with the dependents
		// payload so callers can decide whether to retry with ?force=true.
		if isFKConstraint(err) {
			dep := Dependents{}
			if h.Dependents != nil {
				if d, derr := h.Dependents(id); derr == nil {
					dep = d
				}
			}
			writeJSON(w, http.StatusConflict, errorPayload{Code: "has_dependents", Dependents: &dep, Message: err.Error()})
			return
		}
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	h.fireMove(id)
	w.WriteHeader(http.StatusNoContent)
}

func isFKConstraint(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "FOREIGN KEY") || strings.Contains(s, "constraint failed")
}

func (h *Handler) uploadPhoto(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	if _, err := h.Store.Get(id); errors.Is(err, ErrNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
		return
	} else if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxPhotoBytes+1024)
	if err := r.ParseMultipartForm(maxPhotoBytes + 1024); err != nil {
		writeJSON(w, http.StatusRequestEntityTooLarge, errorPayload{Code: "file_too_large", Message: err.Error()})
		return
	}
	file, header, err := r.FormFile("photo")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "missing_file", Message: err.Error()})
		return
	}
	defer func() { _ = file.Close() }()
	if header.Size > maxPhotoBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, errorPayload{Code: "file_too_large"})
		return
	}

	buf, err := io.ReadAll(io.LimitReader(file, maxPhotoBytes+1))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if len(buf) > maxPhotoBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, errorPayload{Code: "file_too_large"})
		return
	}
	ext, ok := detectImageExt(buf)
	if !ok {
		writeJSON(w, http.StatusUnsupportedMediaType, errorPayload{Code: "unsupported_media", Message: "only JPEG and PNG are accepted"})
		return
	}

	sum := sha256.Sum256(buf)
	hash := hex.EncodeToString(sum[:])
	relPath := filepath.Join("vs", hash+ext)
	absDir := filepath.Join(h.AssetDir, "vs")
	if err := os.MkdirAll(absDir, 0o755); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	absPath := filepath.Join(h.AssetDir, relPath)
	if err := os.WriteFile(absPath, buf, 0o644); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}

	// Path served by the HTTP layer.
	servedPath := "/assets/" + filepath.ToSlash(relPath)
	v, err := h.Store.SetPhotoPath(id, servedPath)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (h *Handler) servePhoto(w http.ResponseWriter, r *http.Request) {
	rel := chi.URLParam(r, "*")
	if rel == "" || h.AssetDir == "" {
		http.NotFound(w, r)
		return
	}
	// Defense in depth: reject path traversal. filepath.Clean + prefix check.
	clean := filepath.Clean(rel)
	if clean != rel || filepath.IsAbs(clean) {
		http.NotFound(w, r)
		return
	}
	abs := filepath.Join(h.AssetDir, "vs", clean)
	relCheck, err := filepath.Rel(h.AssetDir, abs)
	if err != nil || relCheck == "." || filepath.IsAbs(relCheck) {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, abs)
}

func parseID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	raw := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id <= 0 {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_id"})
		return 0, false
	}
	return id, true
}

func validLatLon(lat, lon float64) bool {
	return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
}

// detectImageExt returns the canonical extension for JPEG/PNG based on magic
// bytes. The reported extension drives the on-disk filename.
func detectImageExt(buf []byte) (string, bool) {
	switch {
	case len(buf) >= 3 && buf[0] == 0xFF && buf[1] == 0xD8 && buf[2] == 0xFF:
		return ".jpg", true
	case len(buf) >= 8 && string(buf[:8]) == "\x89PNG\r\n\x1a\n":
		return ".png", true
	}
	return "", false
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		// last resort
		_, _ = fmt.Fprintf(w, `{"code":"internal"}`)
	}
}
