package warnings

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/guillaumetavernier/volunteersmanager/internal/domain/constraints"
)

type Handler struct{ Store *Store }

func NewHandler(s *Store) *Handler { return &Handler{Store: s} }

func (h *Handler) Mount(r chi.Router) {
	r.Get("/api/warnings", h.list)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	ws, err := h.Store.List(r.Context())
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"code": "internal", "message": err.Error()})
		return
	}
	if ws == nil {
		ws = []constraints.Warning{}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(ws)
}
