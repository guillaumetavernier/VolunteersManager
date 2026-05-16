package volunteer

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/guillaumetavernier/volunteersmanager/internal/features/event"
	"github.com/guillaumetavernier/volunteersmanager/internal/phone"
)

// TripsForDriver returns the IDs of trips that name the volunteer as driver.
// Wired by the server to trip.Store; nil treats the volunteer as unreferenced.
type TripsForDriver func(volunteerID int64) ([]int64, error)

type Handler struct {
	Store          *Store
	Events         *event.Store
	TripsForDriver TripsForDriver
}

func NewHandler(s *Store, events *event.Store) *Handler {
	return &Handler{Store: s, Events: events}
}

func (h *Handler) Mount(r chi.Router) {
	r.Get("/api/volunteers", h.list)
	r.Get("/api/volunteers/role-types", h.roleTypes)
	r.Post("/api/volunteers", h.create)
	r.Get("/api/volunteers/{id}", h.get)
	r.Patch("/api/volunteers/{id}", h.patch)
	r.Delete("/api/volunteers/{id}", h.delete)
}

type errorPayload struct {
	Code       string      `json:"code"`
	Message    string      `json:"message,omitempty"`
	Dependents *Dependents `json:"dependents,omitempty"`
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	xs, err := h.Store.List(Filter{Archived: r.URL.Query().Get("archived")})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if xs == nil {
		xs = []Volunteer{}
	}
	writeJSON(w, http.StatusOK, xs)
}

func (h *Handler) roleTypes(w http.ResponseWriter, _ *http.Request) {
	xs, err := h.Store.AllRoleTypes()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if xs == nil {
		xs = []string{}
	}
	writeJSON(w, http.StatusOK, xs)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var in Input
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_request", Message: err.Error()})
		return
	}
	if in.FirstName == "" || in.LastName == "" || in.Phone == "" {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "missing_fields", Message: "first_name, last_name and phone are required"})
		return
	}
	country := h.country()
	norm, ok := phone.Normalize(in.Phone, country)
	if !ok {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "phone_invalid", Message: "phone could not be normalized to E.164"})
		return
	}
	in.Phone = norm
	if in.EmergencyContactPhone != nil && *in.EmergencyContactPhone != "" {
		if epn, eok := phone.Normalize(*in.EmergencyContactPhone, country); eok {
			in.EmergencyContactPhone = &epn
		}
	}
	v, err := h.Store.Create(in)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
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
	country := h.country()
	if p.Phone != nil && *p.Phone != "" {
		norm, nok := phone.Normalize(*p.Phone, country)
		if !nok {
			writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "phone_invalid", Message: "phone could not be normalized to E.164"})
			return
		}
		p.Phone = &norm
	}
	if p.EmergencyContactPhone != nil && *p.EmergencyContactPhone != "" {
		if norm, nok := phone.Normalize(*p.EmergencyContactPhone, country); nok {
			p.EmergencyContactPhone = &norm
		}
	}
	v, err := h.Store.Patch(id, p)
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

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	hard := q.Get("hard") == "true"
	force := q.Get("force") == "true"

	if !hard {
		if _, err := h.Store.Archive(id); err != nil {
			if errors.Is(err, ErrNotFound) {
				writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
				return
			}
			writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// Trip dependents are checked at the handler level (the store doesn't import
	// trip). If !force and the volunteer drives some trips, return 409 with
	// the trip ids. With force=true, the trips are deleted first.
	if h.TripsForDriver != nil {
		tripIDs, err := h.TripsForDriver(id)
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
	if err := h.Store.HardDelete(id, force); err != nil {
		var dep *ErrHasDependents
		if errors.As(err, &dep) {
			writeJSON(w, http.StatusConflict, errorPayload{Code: "has_dependents", Dependents: &dep.Dependents})
			return
		}
		if errors.Is(err, ErrNotFound) {
			writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// country returns the event's ISO alpha-2 country code, defaulting to FR when
// the event row isn't reachable. Used as the fallback when the user types a
// phone number without a "+" prefix.
func (h *Handler) country() string {
	if h.Events == nil {
		return "FR"
	}
	e, err := h.Events.Get()
	if err != nil || e.CountryCode == "" {
		return "FR"
	}
	return e.CountryCode
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

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		_, _ = fmt.Fprintf(w, `{"code":"internal"}`)
	}
}
