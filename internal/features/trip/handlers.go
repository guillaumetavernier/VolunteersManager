package trip

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

type Handler struct {
	Store *Store
	DB    *sql.DB
}

func NewHandler(s *Store, db *sql.DB) *Handler { return &Handler{Store: s, DB: db} }

func (h *Handler) Mount(r chi.Router) {
	r.Get("/api/trips", h.list)
	r.Post("/api/trips", h.create)
	r.Get("/api/trips/{id}", h.get)
	r.Put("/api/trips/{id}", h.replace)
	r.Delete("/api/trips/{id}", h.delete)
	r.Get("/api/transport-needs", h.transportNeeds)
}

type errorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message,omitempty"`
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	var day *int
	if d := r.URL.Query().Get("day"); d != "" {
		dv, err := strconv.Atoi(d)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_day"})
			return
		}
		day = &dv
	}
	xs, err := h.Store.List(day)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if xs == nil {
		xs = []Trip{}
	}
	writeJSON(w, http.StatusOK, xs)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	t, err := h.Store.Get(id)
	if errors.Is(err, ErrNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var in Input
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_request", Message: err.Error()})
		return
	}
	if in.Day < 1 || in.DriverID <= 0 || in.CarID <= 0 || len(in.Stops) < 2 {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "missing_fields", Message: "day, driver_id, car_id and at least 2 stops are required"})
		return
	}
	t, err := h.Store.Create(in)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, t)
}

func (h *Handler) replace(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	var in Input
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_request", Message: err.Error()})
		return
	}
	if in.Day < 1 || in.DriverID <= 0 || in.CarID <= 0 || len(in.Stops) < 2 {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload{Code: "missing_fields"})
		return
	}
	t, err := h.Store.Replace(id, in)
	if errors.Is(err, ErrNotFound) {
		writeJSON(w, http.StatusNotFound, errorPayload{Code: "not_found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
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

// TransportNeed describes one volunteer-pair-of-missions whose endpoints differ
// and that has no covering trip leg.
type TransportNeed struct {
	VolunteerID int64  `json:"volunteer_id"`
	FromVSID    int64  `json:"from_vs"`
	FromTime    string `json:"from_time"`
	ToVSID      int64  `json:"to_vs"`
	ToTime      string `json:"to_time"`
	Day         int    `json:"day"`
}

func (h *Handler) transportNeeds(w http.ResponseWriter, r *http.Request) {
	var day *int
	if d := r.URL.Query().Get("day"); d != "" {
		dv, err := strconv.Atoi(d)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, errorPayload{Code: "bad_day"})
			return
		}
		day = &dv
	}
	needs, err := h.computeTransportNeeds(day)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorPayload{Code: "internal", Message: err.Error()})
		return
	}
	if needs == nil {
		needs = []TransportNeed{}
	}
	writeJSON(w, http.StatusOK, needs)
}

type missionLite struct {
	id        int64
	vsID      int64
	day       int
	startMin  int
	endMin    int
	startTime string
	endTime   string
}

// computeTransportNeeds joins assignments → missions and finds pairs of
// consecutive (by start time, same day) missions for the same volunteer where
// the VS differs. Filters out pairs covered by an existing trip leg.
func (h *Handler) computeTransportNeeds(day *int) ([]TransportNeed, error) {
	q := `SELECT a.volunteer_id, m.id, m.vs_id, m.day, m.start_time, m.end_time
	      FROM assignments a JOIN missions m ON m.id = a.mission_id`
	args := []any{}
	if day != nil {
		q += ` WHERE m.day = ?`
		args = append(args, *day)
	}
	rows, err := h.DB.Query(q, args...)
	if err != nil {
		return nil, err
	}
	byVol := map[int64][]missionLite{}
	for rows.Next() {
		var volID int64
		var m missionLite
		if err := rows.Scan(&volID, &m.id, &m.vsID, &m.day, &m.startTime, &m.endTime); err != nil {
			_ = rows.Close()
			return nil, err
		}
		m.startMin = parseHM(m.startTime)
		m.endMin = parseHM(m.endTime)
		byVol[volID] = append(byVol[volID], m)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return nil, err
	}
	_ = rows.Close()

	covered, err := h.coveredLegs()
	if err != nil {
		return nil, err
	}

	var out []TransportNeed
	for volID, ms := range byVol {
		sort.Slice(ms, func(i, j int) bool {
			if ms[i].day != ms[j].day {
				return ms[i].day < ms[j].day
			}
			return ms[i].startMin < ms[j].startMin
		})
		for i := 1; i < len(ms); i++ {
			prev := ms[i-1]
			cur := ms[i]
			if prev.vsID == cur.vsID {
				continue
			}
			// Overlapping missions (prev ends after cur starts) are a
			// double-booking, which the constraint engine surfaces under
			// KindDoubleBooking. Skipping them here keeps the Besoins list
			// to actionable transport gaps — physically impossible legs are
			// not transport problems. Compare the raw ISO strings: they share
			// a fixed YYYY-MM-DDTHH:MM format so lexicographic order matches
			// chronological order, and unlike parseHM it also handles legs
			// that cross calendar days.
			if prev.endTime >= cur.startTime {
				continue
			}
			if covered[legKey{vol: volID, from: prev.vsID, to: cur.vsID}] {
				continue
			}
			out = append(out, TransportNeed{
				VolunteerID: volID,
				FromVSID:    prev.vsID,
				FromTime:    prev.endTime,
				ToVSID:      cur.vsID,
				ToTime:      cur.startTime,
				Day:         cur.day,
			})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].VolunteerID != out[j].VolunteerID {
			return out[i].VolunteerID < out[j].VolunteerID
		}
		if out[i].Day != out[j].Day {
			return out[i].Day < out[j].Day
		}
		return out[i].FromTime < out[j].FromTime
	})
	return out, nil
}

type legKey struct {
	vol  int64
	from int64
	to   int64
}

// coveredLegs returns the set of (volunteer, from_vs, to_vs) covered by some
// trip: the volunteer boards at stop i and alights at some stop j > i, with the
// from = stop[i].vs and to = stop[j].vs.
func (h *Handler) coveredLegs() (map[legKey]bool, error) {
	trips, err := (&Store{DB: h.DB}).List(nil)
	if err != nil {
		return nil, err
	}
	out := map[legKey]bool{}
	for _, t := range trips {
		boarded := map[int64]int{} // volunteerID → stop index where boarded
		for i, st := range t.Stops {
			for _, v := range st.Board {
				if _, ok := boarded[v]; !ok {
					boarded[v] = i
				}
			}
			for _, v := range st.Alight {
				bi, ok := boarded[v]
				if !ok {
					continue
				}
				out[legKey{vol: v, from: t.Stops[bi].VSID, to: st.VSID}] = true
				delete(boarded, v)
			}
		}
	}
	return out, nil
}

func parseHM(s string) int {
	s = strings.TrimSpace(s)
	if len(s) < 4 {
		return 0
	}
	colon := strings.IndexByte(s, ':')
	if colon < 1 {
		return 0
	}
	h, err := strconv.Atoi(s[:colon])
	if err != nil {
		return 0
	}
	m, err := strconv.Atoi(s[colon+1:])
	if err != nil {
		return 0
	}
	return h*60 + m
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
