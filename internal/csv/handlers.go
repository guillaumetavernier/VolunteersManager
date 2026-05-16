package csv

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/guillaumetavernier/volunteersmanager/internal/features/event"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/volunteer"
)

const maxUploadBytes = 10 * 1024 * 1024

type Handler struct {
	Sessions   *SessionStore
	Volunteers *volunteer.Store
	Events     *event.Store
}

func NewHandler(sessions *SessionStore, vols *volunteer.Store, events *event.Store) *Handler {
	return &Handler{Sessions: sessions, Volunteers: vols, Events: events}
}

func (h *Handler) Mount(r chi.Router) {
	r.Post("/api/csv/upload", h.upload)
	r.Post("/api/csv/{session}/mapping", h.mapping)
	r.Post("/api/csv/{session}/resolve", h.resolve)
	r.Post("/api/csv/{session}/commit", h.commit)
	r.Get("/api/volunteers/export.csv", h.export)
	r.Get("/api/volunteers/template.csv", h.template)
}

type errorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message,omitempty"`
}

type uploadResponse struct {
	SessionID  string         `json:"session_id"`
	Filename   string         `json:"filename"`
	Delimiter  string         `json:"delimiter"`
	Headers    []string       `json:"headers"`
	Preview    [][]string     `json:"preview"`
	AutoMap    map[int]string `json:"auto_mapping"`
	RowCount   int            `json:"row_count"`
	FieldKeys  []string       `json:"field_keys"`
	HeaderHints map[string]string `json:"header_hints"`
}

func (h *Handler) upload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes+1024)
	if err := r.ParseMultipartForm(maxUploadBytes + 1024); err != nil {
		writeJSON(w, http.StatusRequestEntityTooLarge, errorPayload{Code: "file_too_large", Message: err.Error()})
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "missing_file", Message: err.Error()})
		return
	}
	defer func() { _ = file.Close() }()
	buf, err := io.ReadAll(io.LimitReader(file, maxUploadBytes+1))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if len(buf) > maxUploadBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, errorPayload{Code: "file_too_large"})
		return
	}

	parsed, err := Parse(bytes.NewReader(buf))
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "bad_csv", Message: err.Error()})
		return
	}

	country := "FR"
	if h.Events != nil {
		if e, err := h.Events.Get(); err == nil && e.CountryCode != "" {
			country = e.CountryCode
		}
	}

	state := SessionState{
		Filename:    header.Filename,
		Parsed:      parsed,
		Mapping:     AutoMap(parsed.Headers),
		CountryCode: country,
	}
	id, err := h.Sessions.Create(state)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}

	preview := parsed.Rows
	if len(preview) > 5 {
		preview = preview[:5]
	}
	delim := ","
	if parsed.Delimiter == ';' {
		delim = ";"
	}
	hints := map[string]string{}
	for _, f := range CanonicalFields {
		hints[f.Key] = f.Header
	}
	writeJSON(w, http.StatusOK, uploadResponse{
		SessionID:   id,
		Filename:    header.Filename,
		Delimiter:   delim,
		Headers:     parsed.Headers,
		Preview:     preview,
		AutoMap:     state.Mapping,
		RowCount:    len(parsed.Rows),
		FieldKeys:   CanonicalKeys(),
		HeaderHints: hints,
	})
}

type mappingRequest struct {
	ColumnToField map[string]string `json:"column_to_field"`
	UpsertKey     UpsertKey         `json:"upsert_key"`
}

type mappingResponse struct {
	Counts    Counts        `json:"counts"`
	Decisions []RowDecision `json:"decisions"`
}

func (h *Handler) mapping(w http.ResponseWriter, r *http.Request) {
	sessID := chi.URLParam(r, "session")
	state, err := h.Sessions.Get(sessID)
	if errors.Is(err, ErrSessionNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "session_not_found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	var req mappingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_request", Message: err.Error()})
		return
	}
	if req.UpsertKey != UpsertByName && req.UpsertKey != UpsertByEmail {
		req.UpsertKey = UpsertByName
	}
	intMapping := map[int]string{}
	for col, field := range req.ColumnToField {
		idx, err := strconv.Atoi(col)
		if err != nil {
			continue
		}
		intMapping[idx] = field
	}

	state.Mapping = intMapping
	state.UpsertKey = req.UpsertKey
	state.Validated = Validate(state.Parsed, intMapping, state.CountryCode)
	existing, err := h.Volunteers.List(volunteer.Filter{Archived: "all"})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	state.Decisions = Classify(state.Validated, existing, req.UpsertKey)

	if err := h.Sessions.Update(sessID, state); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, mappingResponse{Counts: Tally(state.Decisions), Decisions: state.Decisions})
}

type resolveRequest struct {
	Row    int    `json:"row"`
	Choice string `json:"choice"` // "new" | "skip" | "update:<id>"
}

func (h *Handler) resolve(w http.ResponseWriter, r *http.Request) {
	sessID := chi.URLParam(r, "session")
	state, err := h.Sessions.Get(sessID)
	if errors.Is(err, ErrSessionNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "session_not_found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	var req resolveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_request", Message: err.Error()})
		return
	}
	idx := -1
	for i, d := range state.Decisions {
		if d.Row.Index == req.Row {
			idx = i
			break
		}
	}
	if idx < 0 {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "row_not_found"})
		return
	}
	switch {
	case req.Choice == "new":
		state.Decisions[idx].Class = ClassNew
		state.Decisions[idx].TargetID = nil
		state.Decisions[idx].Candidates = nil
	case req.Choice == "skip":
		state.Decisions[idx].Class = ClassSkip
		state.Decisions[idx].TargetID = nil
		state.Decisions[idx].Candidates = nil
	case len(req.Choice) > 7 && req.Choice[:7] == "update:":
		id, err := strconv.ParseInt(req.Choice[7:], 10, 64)
		if err != nil || id <= 0 {
			writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_choice"})
			return
		}
		state.Decisions[idx].Class = ClassUpdate
		state.Decisions[idx].TargetID = &id
		state.Decisions[idx].Candidates = nil
	default:
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_choice"})
		return
	}
	if err := h.Sessions.Update(sessID, state); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, mappingResponse{Counts: Tally(state.Decisions), Decisions: state.Decisions})
}

type commitResponse struct {
	Result CommitResult `json:"result"`
}

func (h *Handler) commit(w http.ResponseWriter, r *http.Request) {
	sessID := chi.URLParam(r, "session")
	state, err := h.Sessions.Get(sessID)
	if errors.Is(err, ErrSessionNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "session_not_found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if len(state.Decisions) == 0 {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "no_decisions"})
		return
	}
	for _, d := range state.Decisions {
		if d.Class == ClassAmbiguous {
			writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "ambiguous_unresolved", Message: "resolve all ambiguous rows before commit"})
			return
		}
	}
	res, err := Commit(h.Volunteers.DB, state.Decisions)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	_ = h.Sessions.Delete(sessID)
	writeJSON(w, http.StatusOK, commitResponse{Result: res})
}

func (h *Handler) export(w http.ResponseWriter, _ *http.Request) {
	vols, err := h.Volunteers.List(volunteer.Filter{Archived: "false"})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="volunteers.csv"`)
	if err := WriteExport(w, vols); err != nil {
		_, _ = io.WriteString(w, "\nerror: "+err.Error())
	}
}

func (h *Handler) template(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="volunteers-template.csv"`)
	_ = WriteTemplate(w)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
