package racevs

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

// Recomputer is the upstream hook fired after every list-changing mutation.
type Recomputer interface {
	RecomputeRace(raceID int64) error
}

type Handler struct {
	Store    *Store
	Recompue Recomputer
}

func NewHandler(s *Store, rc Recomputer) *Handler {
	return &Handler{Store: s, Recompue: rc}
}

func (h *Handler) Mount(r chi.Router) {
	r.Get("/api/races/{id}/vs", h.list)
	r.Put("/api/races/{id}/vs", h.replace)
	r.Patch("/api/races/{id}/vs/{vsId}", h.patch)
	r.Delete("/api/races/{id}/vs/{vsId}/manual", h.clearManual)
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
		xs = []Entry{}
	}
	writeJSON(w, http.StatusOK, xs)
}

func (h *Handler) replace(w http.ResponseWriter, r *http.Request) {
	raceID, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	var body []PutOrderItem
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_request", Message: err.Error()})
		return
	}
	if err := h.Store.Replace(raceID, body); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if err := h.Recompue.RecomputeRace(raceID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	xs, err := h.Store.List(raceID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if xs == nil {
		xs = []Entry{}
	}
	writeJSON(w, http.StatusOK, xs)
}

func (h *Handler) patch(w http.ResponseWriter, r *http.Request) {
	raceID, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	vsID, ok := parseID(w, r, "vsId")
	if !ok {
		return
	}
	var p PatchTimes
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_request", Message: err.Error()})
		return
	}
	e, err := h.Store.PatchTimes(raceID, vsID, p)
	if errors.Is(err, ErrNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, e)
}

func (h *Handler) clearManual(w http.ResponseWriter, r *http.Request) {
	raceID, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	vsID, ok := parseID(w, r, "vsId")
	if !ok {
		return
	}
	q := r.URL.Query()
	first := q.Get("first") == "1"
	last := q.Get("last") == "1"
	e, err := h.Store.ClearManual(raceID, vsID, first, last)
	if errors.Is(err, ErrNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, e)
}

func parseID(w http.ResponseWriter, r *http.Request, param string) (int64, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, param), 10, 64)
	if err != nil || id <= 0 {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_id"})
		return 0, false
	}
	return id, true
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
