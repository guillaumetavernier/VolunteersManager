package assignment

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

type Handler struct {
	Store *Store
}

func NewHandler(s *Store) *Handler { return &Handler{Store: s} }

func (h *Handler) Mount(r chi.Router) {
	r.Get("/api/assignments", h.list)
	r.Post("/api/assignments", h.create)
	r.Delete("/api/assignments", h.deleteByPair)
	r.Delete("/api/assignments/{id}", h.delete)
}

type errorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message,omitempty"`
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if v := q.Get("volunteer"); v != "" {
		id, err := strconv.ParseInt(v, 10, 64)
		if err != nil || id <= 0 {
			writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_volunteer"})
			return
		}
		xs, err := h.Store.ListForVolunteer(id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
			return
		}
		if xs == nil {
			xs = []Assignment{}
		}
		writeJSON(w, http.StatusOK, xs)
		return
	}
	if m := q.Get("mission"); m != "" {
		id, err := strconv.ParseInt(m, 10, 64)
		if err != nil || id <= 0 {
			writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_mission"})
			return
		}
		xs, err := h.Store.ListForMission(id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
			return
		}
		if xs == nil {
			xs = []Assignment{}
		}
		writeJSON(w, http.StatusOK, xs)
		return
	}
	writeJSON(w, http.StatusBadRequest, errorPayload{Code: "missing_filter", Message: "volunteer or mission query param required"})
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var in Input
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_request", Message: err.Error()})
		return
	}
	if in.MissionID <= 0 || in.VolunteerID <= 0 {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "missing_fields"})
		return
	}
	a, err := h.Store.Create(in)
	if errors.Is(err, ErrDuplicate) {
		writeJSON(w, http.StatusConflict, errorPayload{Code: "duplicate"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, a)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_id"})
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
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) deleteByPair(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	v, err := strconv.ParseInt(q.Get("volunteer"), 10, 64)
	if err != nil || v <= 0 {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_volunteer"})
		return
	}
	m, err := strconv.ParseInt(q.Get("mission"), 10, 64)
	if err != nil || m <= 0 {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_mission"})
		return
	}
	if err := h.Store.DeletePair(v, m); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		_, _ = fmt.Fprintf(w, `{"code":"internal"}`)
	}
}
