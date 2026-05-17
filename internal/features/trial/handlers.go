package trial

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

// Recomputer is a hook called after mutations that require recomputing timings.
type Recomputer interface {
	RecomputeRace(raceID int64) error
}

type Handler struct {
	Store     *Store
	Recompute Recomputer
	AssetDir  string
}

func NewHandler(s *Store, rc Recomputer, assetDir string) *Handler {
	return &Handler{Store: s, Recompute: rc, AssetDir: assetDir}
}

func (h *Handler) Mount(r chi.Router) {
	r.Get("/api/races/{id}/trials", h.list)
	r.Post("/api/races/{id}/trials", h.create)
	r.Put("/api/races/{id}/trials/reorder", h.reorder)
	r.Patch("/api/trials/{id}", h.patch)
	r.Delete("/api/trials/{id}", h.deleteTrial)

	r.Get("/api/trials/{id}/gpx", h.listGPX)
	r.Post("/api/trials/{id}/gpx", h.uploadGPX)
	r.Delete("/api/trials/{trialId}/gpx/{gpxId}", h.deleteGPX)

	r.Put("/api/race_trial_vs/{id}", h.putTrialVS)
}

type errorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message,omitempty"`
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	raceID, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	xs, err := h.Store.List(raceID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if xs == nil {
		xs = []Trial{}
	}
	writeJSON(w, http.StatusOK, xs)
}

type createRequest struct {
	Name      string   `json:"name"`
	Sequence  int      `json:"sequence"`
	StartTime *string  `json:"start_time,omitempty"`
	FrontPace *float64 `json:"front_pace,omitempty"`
	TailPace  *float64 `json:"tail_pace,omitempty"`
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	raceID, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	var req createRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_request", Message: err.Error()})
		return
	}
	if req.Name == "" {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "missing_fields", Message: "name is required"})
		return
	}
	front := 12.0
	tail := 5.0
	if req.FrontPace != nil {
		front = *req.FrontPace
	}
	if req.TailPace != nil {
		tail = *req.TailPace
	}
	tr, err := h.Store.Create(CreateInput{
		RaceID:    raceID,
		Sequence:  req.Sequence,
		Name:      req.Name,
		StartTime: req.StartTime,
		FrontPace: front,
		TailPace:  tail,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if err := h.Recompute.RecomputeRace(raceID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, tr)
}

type patchRequest struct {
	Name      *string  `json:"name,omitempty"`
	StartTime *string  `json:"start_time,omitempty"`
	FrontPace *float64 `json:"front_pace,omitempty"`
	TailPace  *float64 `json:"tail_pace,omitempty"`
}

func (h *Handler) patch(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	var req patchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_request", Message: err.Error()})
		return
	}
	existing, err := h.Store.Get(id)
	if errors.Is(err, ErrNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	tr, err := h.Store.Patch(id, PatchInput{
		Name:      req.Name,
		StartTime: req.StartTime,
		FrontPace: req.FrontPace,
		TailPace:  req.TailPace,
	})
	if errors.Is(err, ErrNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if req.StartTime != nil || req.FrontPace != nil || req.TailPace != nil {
		if err := h.Recompute.RecomputeRace(existing.RaceID); err != nil {
			writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
			return
		}
	}
	writeJSON(w, http.StatusOK, tr)
}

func (h *Handler) deleteTrial(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	raceID, err := h.Store.Delete(id)
	if errors.Is(err, ErrNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if err := h.Recompute.RecomputeRace(raceID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) reorder(w http.ResponseWriter, r *http.Request) {
	raceID, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	var items []ReorderItem
	if err := json.NewDecoder(r.Body).Decode(&items); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_request", Message: err.Error()})
		return
	}
	if err := h.Store.Reorder(items); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if err := h.Recompute.RecomputeRace(raceID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	xs, err := h.Store.List(raceID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if xs == nil {
		xs = []Trial{}
	}
	writeJSON(w, http.StatusOK, xs)
}

func (h *Handler) listGPX(w http.ResponseWriter, r *http.Request) {
	trialID, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	xs, err := h.Store.ListGPXByTrial(trialID)
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
	trialID, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	tr, err := h.Store.Get(trialID)
	if errors.Is(err, ErrNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
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
	relDir := filepath.Join("gpx", strconv.FormatInt(tr.RaceID, 10))
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

	g, err := h.Store.CreateGPX(tr.RaceID, trialID, "/assets/"+filepath.ToSlash(relPath), string(pointsJSON), track.TotalDistance)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if err := h.Recompute.RecomputeRace(tr.RaceID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, g)
}

func (h *Handler) deleteGPX(w http.ResponseWriter, r *http.Request) {
	trialID, ok := parseID(w, r, "trialId")
	if !ok {
		return
	}
	gpxID, ok := parseID(w, r, "gpxId")
	if !ok {
		return
	}
	tr, err := h.Store.Get(trialID)
	if errors.Is(err, ErrNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if err := h.Store.DeleteGPX(trialID, gpxID); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if err := h.Recompute.RecomputeRace(tr.RaceID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) putTrialVS(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	var p PatchTrialVS
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_request", Message: err.Error()})
		return
	}
	if p.Source != nil {
		switch *p.Source {
		case "auto", "manual_include", "manual_exclude":
		default:
			writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "bad_source", Message: "source must be auto, manual_include, or manual_exclude"})
			return
		}
	}
	tv, err := h.Store.PatchTrialVSRow(id, p)
	if errors.Is(err, ErrNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, tv)
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
