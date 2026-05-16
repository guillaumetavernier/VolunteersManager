package routing

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
)

// Handler exposes the travel_times matrix CRUD endpoints. Recompute is wired
// to use the configured Provider (HaversineOnly in v1).
type Handler struct {
	DB       *sql.DB
	Provider Provider
}

func NewHandler(db *sql.DB, p Provider) *Handler { return &Handler{DB: db, Provider: p} }

func (h *Handler) Mount(r chi.Router) {
	r.Get("/api/travel-times", h.list)
	r.Patch("/api/travel-times", h.patch)
	r.Post("/api/travel-times/recompute", h.recompute)
}

type errorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message,omitempty"`
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	cells, err := ListCells(r.Context(), h.DB)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if cells == nil {
		cells = []Cell{}
	}
	writeJSON(w, http.StatusOK, cells)
}

type patchRequest struct {
	FromVS  int64  `json:"from_vs"`
	ToVS    int64  `json:"to_vs"`
	Mode    string `json:"mode"`
	Seconds int    `json:"seconds"`
}

func (h *Handler) patch(w http.ResponseWriter, r *http.Request) {
	var in patchRequest
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_request", Message: err.Error()})
		return
	}
	if in.FromVS <= 0 || in.ToVS <= 0 || in.Seconds < 0 {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "missing_fields"})
		return
	}
	if in.Mode != ModeDrive && in.Mode != ModeWalk {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "bad_mode"})
		return
	}
	if err := SetManual(r.Context(), h.DB, in.FromVS, in.ToVS, in.Mode, in.Seconds); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, Cell{FromVS: in.FromVS, ToVS: in.ToVS, Mode: in.Mode, Seconds: in.Seconds, Source: SourceManual})
}

func (h *Handler) recompute(w http.ResponseWriter, r *http.Request) {
	vs, err := LoadVS(r.Context(), h.DB)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if err := RecomputeMatrix(r.Context(), h.DB, vs, h.Provider); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	cells, err := ListCells(r.Context(), h.DB)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if cells == nil {
		cells = []Cell{}
	}
	writeJSON(w, http.StatusOK, cells)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		_, _ = fmt.Fprintf(w, `{"code":"internal"}`)
	}
}
