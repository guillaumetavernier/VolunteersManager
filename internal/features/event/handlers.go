package event

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
)

type Handler struct{ Store *Store }

func NewHandler(s *Store) *Handler { return &Handler{Store: s} }

func (h *Handler) Mount(r chi.Router) {
	r.Get("/api/event", h.get)
	r.Put("/api/event", h.put)
}

type errorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message,omitempty"`
}

func (h *Handler) get(w http.ResponseWriter, _ *http.Request) {
	e, err := h.Store.Get()
	if errors.Is(err, ErrNotInitialized) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_initialized"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, e)
}

type putRequest struct {
	Name        string `json:"name"`
	StartDate   string `json:"start_date"`
	EndDate     string `json:"end_date"`
	Timezone    string `json:"timezone"`
	CountryCode string `json:"country_code"`
	Settings    string `json:"settings"`
}

func (h *Handler) put(w http.ResponseWriter, r *http.Request) {
	var req putRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_request", Message: err.Error()})
		return
	}
	if req.Name == "" || req.StartDate == "" || req.EndDate == "" {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "missing_fields", Message: "name, start_date, end_date are required"})
		return
	}
	if req.Timezone == "" {
		req.Timezone = "Europe/Paris"
	}
	if req.CountryCode == "" {
		req.CountryCode = "FR"
	}
	e, err := h.Store.Upsert(Event{
		Name:        req.Name,
		StartDate:   req.StartDate,
		EndDate:     req.EndDate,
		Timezone:    req.Timezone,
		CountryCode: req.CountryCode,
		Settings:    req.Settings,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, e)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
