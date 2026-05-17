package race

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

// OnDelete is fired after a race row is removed. The server wires it to the
// mission store's race-tag scrubber. nil is a no-op so the package stays
// independently testable.
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
	Name  string  `json:"name"`
	Color *string `json:"color,omitempty"`
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
	color := "#3b82f6"
	if req.Color != nil && *req.Color != "" {
		color = *req.Color
	}
	ra, err := h.Store.Create(req.Name, color)
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

// track returns the merged race polyline as GeoJSON. Concatenates GPX from all
// trials in sequence order. Empty FeatureCollection when no GPX is uploaded yet.
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
