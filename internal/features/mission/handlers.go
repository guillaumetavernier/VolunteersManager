package mission

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
	r.Get("/api/vs/{vsId}/missions", h.listForVS)
	r.Post("/api/vs/{vsId}/missions", h.createForVS)
	r.Get("/api/missions", h.list)
	r.Get("/api/missions/{id}", h.get)
	r.Patch("/api/missions/{id}", h.patch)
	r.Delete("/api/missions/{id}", h.delete)
}

type errorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message,omitempty"`
}

func (h *Handler) listForVS(w http.ResponseWriter, r *http.Request) {
	vsID, ok := parseID(w, r, "vsId")
	if !ok {
		return
	}
	f := Filter{VSID: &vsID}
	if d := r.URL.Query().Get("day"); d != "" {
		dv, err := strconv.Atoi(d)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_day"})
			return
		}
		f.Day = &dv
	}
	xs, err := h.Store.List(f)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if xs == nil {
		xs = []Mission{}
	}
	writeJSON(w, http.StatusOK, xs)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f := Filter{}
	if d := q.Get("day"); d != "" {
		dv, err := strconv.Atoi(d)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_day"})
			return
		}
		f.Day = &dv
	}
	if role := q.Get("role"); role != "" {
		f.Role = &role
	}
	if race := q.Get("race"); race != "" {
		rv, err := strconv.ParseInt(race, 10, 64)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_race"})
			return
		}
		f.Race = &rv
	}
	xs, err := h.Store.List(f)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if xs == nil {
		xs = []Mission{}
	}
	writeJSON(w, http.StatusOK, xs)
}

func (h *Handler) createForVS(w http.ResponseWriter, r *http.Request) {
	vsID, ok := parseID(w, r, "vsId")
	if !ok {
		return
	}
	var in Input
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_request", Message: err.Error()})
		return
	}
	in.VSID = vsID
	if in.StartTime == "" || in.EndTime == "" || in.RoleType == "" || in.Day < 1 {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "missing_fields"})
		return
	}
	if in.Headcount < 1 {
		in.Headcount = 1
	}
	m, err := h.Store.Create(in)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, m)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "id")
	if !ok {
		return
	}
	m, err := h.Store.Get(id)
	if errors.Is(err, ErrNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, m)
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
	m, err := h.Store.Patch(id, p)
	if errors.Is(err, ErrNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, m)
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
