package event

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/go-chi/chi/v5"
)

const maxAssetBytes = 5 * 1024 * 1024 // 5 MB

type Handler struct {
	Store    *Store
	AssetDir string // root for logo / sponsor uploads (parent of assets/logo, assets/sponsor)
}

func NewHandler(s *Store) *Handler { return &Handler{Store: s} }

func (h *Handler) Mount(r chi.Router) {
	r.Get("/api/event", h.get)
	r.Put("/api/event", h.put)
	r.Post("/api/event/logo", h.uploadLogo)
	r.Post("/api/event/sponsor", h.uploadSponsor)
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
	Name             string  `json:"name"`
	StartDate        string  `json:"start_date"`
	EndDate          string  `json:"end_date"`
	Timezone         string  `json:"timezone"`
	CountryCode      string  `json:"country_code"`
	Settings         string  `json:"settings"`
	CoordinatorName  *string `json:"coordinator_name"`
	CoordinatorPhone *string `json:"coordinator_phone"`
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
	// Validate that the roadbook subkey (if present) is well-formed.
	if req.Settings != "" {
		var m map[string]json.RawMessage
		if err := json.Unmarshal([]byte(req.Settings), &m); err != nil {
			writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "bad_settings", Message: err.Error()})
			return
		}
		if raw, ok := m["roadbook"]; ok {
			var probe map[string]any
			if err := json.Unmarshal(raw, &probe); err != nil {
				writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "bad_roadbook_settings", Message: err.Error()})
				return
			}
		}
	}
	// Preserve logo/sponsor paths if already set (handler doesn't touch them).
	prev, _ := h.Store.Get()
	e, err := h.Store.Upsert(Event{
		Name:             req.Name,
		StartDate:        req.StartDate,
		EndDate:          req.EndDate,
		Timezone:         req.Timezone,
		CountryCode:      req.CountryCode,
		Settings:         req.Settings,
		LogoPath:         prev.LogoPath,
		SponsorPath:      prev.SponsorPath,
		CoordinatorName:  req.CoordinatorName,
		CoordinatorPhone: req.CoordinatorPhone,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, e)
}

func (h *Handler) uploadLogo(w http.ResponseWriter, r *http.Request) {
	h.uploadAsset(w, r, "logo", func(p string) error { return h.Store.SetLogoPath(p) })
}

func (h *Handler) uploadSponsor(w http.ResponseWriter, r *http.Request) {
	h.uploadAsset(w, r, "sponsor", func(p string) error { return h.Store.SetSponsorPath(p) })
}

type uploadResp struct {
	Path string `json:"path"`
}

func (h *Handler) uploadAsset(w http.ResponseWriter, r *http.Request, kind string, set func(string) error) {
	if h.AssetDir == "" {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "no_asset_dir"})
		return
	}
	if err := r.ParseMultipartForm(maxAssetBytes + 1024); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_multipart", Message: err.Error()})
		return
	}
	file, hdr, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "missing_file"})
		return
	}
	defer func() { _ = file.Close() }()
	if hdr.Size > maxAssetBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, errorPayload{Code: "too_large"})
		return
	}
	buf, err := io.ReadAll(io.LimitReader(file, maxAssetBytes+1))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "read", Message: err.Error()})
		return
	}
	if len(buf) > maxAssetBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, errorPayload{Code: "too_large"})
		return
	}
	ext, ok := detectImageExt(buf)
	if !ok {
		writeJSON(w, http.StatusUnsupportedMediaType, errorPayload{Code: "bad_mime", Message: "only PNG or JPEG allowed"})
		return
	}
	sum := sha256.Sum256(buf)
	sha := hex.EncodeToString(sum[:])
	rel := fmt.Sprintf("assets/%s/%s.%s", kind, sha, ext)
	abs := filepath.Join(h.AssetDir, kind, sha+"."+ext)
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "mkdir", Message: err.Error()})
		return
	}
	if err := os.WriteFile(abs, buf, 0o644); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "write", Message: err.Error()})
		return
	}
	if err := set(rel); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "persist", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, uploadResp{Path: rel})
}

func detectImageExt(buf []byte) (string, bool) {
	if len(buf) >= 8 && buf[0] == 0x89 && buf[1] == 0x50 && buf[2] == 0x4E && buf[3] == 0x47 {
		return "png", true
	}
	if len(buf) >= 3 && buf[0] == 0xFF && buf[1] == 0xD8 && buf[2] == 0xFF {
		return "jpg", true
	}
	return "", false
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
