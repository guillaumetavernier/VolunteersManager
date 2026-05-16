package race

import (
	"bytes"
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

	"github.com/go-chi/chi/v5"

	"github.com/guillaumetavernier/volunteersmanager/internal/gpx"
)

const maxGPXBytes = 20 * 1024 * 1024

// OnDelete is fired after a race row is removed. The server wires it to the
// mission store's race-tag scrubber. nil is a no-op so the package stays
// independently testable. The scrub is a tidiness pass — orphan IDs in
// missions.tagged_race_ids are non-load-bearing.
type OnDelete func(raceID int64) error

type Handler struct {
	Store    *Store
	Service  *Service
	AssetDir string
	OnDelete OnDelete
}

func NewHandler(s *Store, svc *Service, assetDir string) *Handler {
	return &Handler{Store: s, Service: svc, AssetDir: assetDir}
}

func (h *Handler) Mount(r chi.Router) {
	r.Get("/api/races", h.list)
	r.Post("/api/races", h.create)
	r.Get("/api/races/{id}", h.get)
	r.Patch("/api/races/{id}", h.patch)
	r.Delete("/api/races/{id}", h.delete)

	r.Get("/api/races/{id}/gpx", h.listGPX)
	r.Post("/api/races/{id}/gpx", h.uploadGPX)
	r.Delete("/api/races/{id}/gpx/{gpxId}", h.deleteGPX)
	r.Post("/api/races/{id}/recompute", h.recompute)
	r.Get("/api/races/{id}/track", h.track)
}

type errorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message,omitempty"`
}

func (h *Handler) list(w http.ResponseWriter, _ *http.Request) {
	xs, err := h.Store.List()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if xs == nil {
		xs = []Race{}
	}
	writeJSON(w, http.StatusOK, xs)
}

type createRequest struct {
	Name      string   `json:"name"`
	Color     string   `json:"color"`
	FrontPace *float64 `json:"front_pace,omitempty"`
	TailPace  *float64 `json:"tail_pace,omitempty"`
	StartTime *string  `json:"start_time,omitempty"`
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
	color := req.Color
	if color == "" {
		color = "#3b82f6"
	}
	front := 12.0
	tail := 5.0
	if req.FrontPace != nil {
		front = *req.FrontPace
	}
	if req.TailPace != nil {
		tail = *req.TailPace
	}
	ra, err := h.Store.Create(req.Name, color, front, tail, req.StartTime)
	if errors.Is(err, ErrDuplicateName) {
		writeJSON(w, http.StatusConflict, errorPayload{Code: "duplicate_name"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, ra)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	ra, err := h.Store.Get(id)
	if errors.Is(err, ErrNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, ra)
}

func (h *Handler) patch(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	var p Patch
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_request", Message: err.Error()})
		return
	}
	ra, err := h.Store.Patch(id, p)
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
	// Pace or start_time changes require recompute.
	if p.FrontPace != nil || p.TailPace != nil || p.StartTime != nil {
		if err := h.Service.RecomputeRace(id); err != nil {
			writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
			return
		}
	}
	writeJSON(w, http.StatusOK, ra)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	if err := h.Store.Delete(id); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if h.OnDelete != nil {
		_ = h.OnDelete(id)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) listGPX(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	xs, err := h.Store.ListGPX(id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if xs == nil {
		xs = []GPXFile{}
	}
	writeJSON(w, http.StatusOK, xs)
}

func (h *Handler) uploadGPX(w http.ResponseWriter, r *http.Request) {
	raceID, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	if _, err := h.Store.Get(raceID); errors.Is(err, ErrNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
		return
	} else if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}

	var day *int
	if raw := r.URL.Query().Get("day"); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil {
			writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "bad_day"})
			return
		}
		day = &v
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxGPXBytes+1024)
	if err := r.ParseMultipartForm(maxGPXBytes + 1024); err != nil {
		writeJSON(w, http.StatusRequestEntityTooLarge, errorPayload{Code: "file_too_large", Message: err.Error()})
		return
	}
	file, _, err := r.FormFile("gpx")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "missing_file", Message: err.Error()})
		return
	}
	defer func() { _ = file.Close() }()

	buf, err := io.ReadAll(io.LimitReader(file, maxGPXBytes+1))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if len(buf) > maxGPXBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, errorPayload{Code: "file_too_large"})
		return
	}

	track, err := gpx.Parse(bytes.NewReader(buf))
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "bad_gpx", Message: err.Error()})
		return
	}
	track = gpx.Simplify(track)

	sum := sha256.Sum256(buf)
	hash := hex.EncodeToString(sum[:])
	relDir := filepath.Join("gpx", strconv.FormatInt(raceID, 10))
	absDir := filepath.Join(h.AssetDir, relDir)
	if err := os.MkdirAll(absDir, 0o755); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	relPath := filepath.Join(relDir, hash+".gpx")
	absPath := filepath.Join(h.AssetDir, relPath)
	if err := os.WriteFile(absPath, buf, 0o644); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	pointsJSON, err := json.Marshal(track.Points)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}

	g, err := h.Store.CreateGPX(raceID, day, "/assets/"+filepath.ToSlash(relPath), string(pointsJSON), track.TotalDistance)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if err := h.Service.RecomputeRace(raceID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, g)
}

func (h *Handler) deleteGPX(w http.ResponseWriter, r *http.Request) {
	raceID, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	gpxID, ok := parseID(w, r, "gpxId")
	if !ok {
		return
	}
	if err := h.Store.DeleteGPX(raceID, gpxID); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if err := h.Service.RecomputeRace(raceID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// track returns the merged race polyline as GeoJSON. Empty FeatureCollection
// when no GPX is uploaded yet.
func (h *Handler) track(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	if _, err := h.Store.Get(id); errors.Is(err, ErrNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
		return
	}
	files, err := h.Store.ListGPX(id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	type rawPoint struct {
		Lat float64 `json:"lat"`
		Lon float64 `json:"lon"`
	}
	var coords [][]float64
	for _, f := range files {
		var pts []rawPoint
		if err := json.Unmarshal([]byte(f.Points), &pts); err != nil {
			writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
			return
		}
		for _, p := range pts {
			coords = append(coords, []float64{p.Lon, p.Lat})
		}
	}
	if coords == nil {
		writeJSON(w, http.StatusOK, map[string]any{"type": "FeatureCollection", "features": []any{}})
		return
	}
	feature := map[string]any{
		"type":       "Feature",
		"properties": map[string]any{},
		"geometry":   map[string]any{"type": "LineString", "coordinates": coords},
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"type":     "FeatureCollection",
		"features": []any{feature},
	})
}

func (h *Handler) recompute(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	if err := h.Service.RecomputeRace(id); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func parseID(w http.ResponseWriter, r *http.Request, param string) (int64, bool) {
	raw := chi.URLParam(r, param)
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id <= 0 {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_id"})
		return 0, false
	}
	return id, true
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		_, _ = fmt.Fprintf(w, `{"code":"internal"}`)
	}
}
