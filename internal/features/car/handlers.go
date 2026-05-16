package car

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

// TripsForCar returns the IDs of trips referencing the given car. Wired by
// the server to trip.Store; nil treats the car as unreferenced.
type TripsForCar func(carID int64) ([]int64, error)

type Handler struct {
	Store       *Store
	TripsForCar TripsForCar
}

// Dependents lists rows that block a cascade-less delete.
type Dependents struct {
	Trips []int64 `json:"trips,omitempty"`
}

func NewHandler(s *Store) *Handler { return &Handler{Store: s} }

func (h *Handler) Mount(r chi.Router) {
	r.Get("/api/cars", h.list)
	r.Post("/api/cars", h.create)
	r.Get("/api/cars/{id}", h.get)
	r.Patch("/api/cars/{id}", h.patch)
	r.Delete("/api/cars/{id}", h.delete)
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
		xs = []Car{}
	}
	writeJSON(w, http.StatusOK, xs)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var in Input
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_request", Message: err.Error()})
		return
	}
	if in.Name == "" || in.Seats <= 0 {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "missing_fields", Message: "name and positive seats are required"})
		return
	}
	c, err := h.Store.Create(in)
	switch {
	case errors.Is(err, ErrDuplicateName):
		writeJSON(w, http.StatusConflict, errorPayload{Code: "duplicate_name"})
	case errors.Is(err, ErrDriverInvalid):
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "driver_not_can_drive"})
	case err != nil:
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
	default:
		writeJSON(w, http.StatusCreated, c)
	}
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	c, err := h.Store.Get(id)
	if errors.Is(err, ErrNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, c)
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
	c, err := h.Store.Patch(id, p)
	switch {
	case errors.Is(err, ErrNotFound):
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
	case errors.Is(err, ErrDuplicateName):
		writeJSON(w, http.StatusConflict, errorPayload{Code: "duplicate_name"})
	case errors.Is(err, ErrDriverInvalid):
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "driver_not_can_drive"})
	case err != nil:
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
	default:
		writeJSON(w, http.StatusOK, c)
	}
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	force := r.URL.Query().Get("force") == "true"
	if h.TripsForCar != nil {
		tripIDs, err := h.TripsForCar(id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
			return
		}
		if len(tripIDs) > 0 {
			if !force {
				writeJSON(w, http.StatusConflict, errorPayload{Code: "has_dependents", Dependents: &Dependents{Trips: tripIDs}})
				return
			}
			for _, tid := range tripIDs {
				if _, err := h.Store.DB.Exec(`DELETE FROM trips WHERE id = ?`, tid); err != nil {
					writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
					return
				}
			}
		}
	}
	if err := h.Store.Delete(id); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func parseID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
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
