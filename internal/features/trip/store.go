package trip

import (
	"database/sql"
	"errors"
	"sort"
	"strings"
)

var ErrNotFound = errors.New("trip: not found")

type Store struct{ DB *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{DB: db} }

// List returns every trip with stops + passengers preloaded.
func (s *Store) List(day *int) ([]Trip, error) {
	q := `SELECT id, day, driver_id, car_id, mode, COALESCE(notes,''), created_at, updated_at FROM trips`
	args := []any{}
	if day != nil {
		q += ` WHERE day = ?`
		args = append(args, *day)
	}
	q += ` ORDER BY day, id`
	rows, err := s.DB.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var trips []Trip
	for rows.Next() {
		var t Trip
		if err := rows.Scan(&t.ID, &t.Day, &t.DriverID, &t.CarID, &t.Mode, &t.Notes, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		trips = append(trips, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(trips) == 0 {
		return trips, nil
	}
	// Bulk-load stops + passengers for all trip ids.
	ids := make([]int64, len(trips))
	idx := make(map[int64]int, len(trips))
	for i, t := range trips {
		ids[i] = t.ID
		idx[t.ID] = i
		trips[i].Stops = []Stop{}
	}
	if err := s.loadStopsInto(trips, idx, ids); err != nil {
		return nil, err
	}
	return trips, nil
}

func (s *Store) Get(id int64) (Trip, error) {
	const q = `SELECT id, day, driver_id, car_id, mode, COALESCE(notes,''), created_at, updated_at FROM trips WHERE id = ?`
	var t Trip
	err := s.DB.QueryRow(q, id).Scan(&t.ID, &t.Day, &t.DriverID, &t.CarID, &t.Mode, &t.Notes, &t.CreatedAt, &t.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Trip{}, ErrNotFound
	}
	if err != nil {
		return Trip{}, err
	}
	t.Stops = []Stop{}
	trips := []Trip{t}
	if err := s.loadStopsInto(trips, map[int64]int{t.ID: 0}, []int64{t.ID}); err != nil {
		return Trip{}, err
	}
	return trips[0], nil
}

func (s *Store) loadStopsInto(trips []Trip, idx map[int64]int, ids []int64) error {
	if len(ids) == 0 {
		return nil
	}
	placeholders := strings.Repeat("?,", len(ids))
	placeholders = strings.TrimRight(placeholders, ",")
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	stopRows, err := s.DB.Query(`SELECT id, trip_id, sequence, vs_id, time, leg_time_source FROM trip_stops WHERE trip_id IN (`+placeholders+`) ORDER BY trip_id, sequence`, args...)
	if err != nil {
		return err
	}
	stopByID := map[int64]*Stop{}
	tripStops := map[int64][]Stop{}
	for stopRows.Next() {
		var s2 Stop
		var tid int64
		if err := stopRows.Scan(&s2.ID, &tid, &s2.Sequence, &s2.VSID, &s2.Time, &s2.LegTimeSource); err != nil {
			_ = stopRows.Close()
			return err
		}
		s2.Board = []int64{}
		s2.Alight = []int64{}
		tripStops[tid] = append(tripStops[tid], s2)
	}
	if err := stopRows.Err(); err != nil {
		_ = stopRows.Close()
		return err
	}
	_ = stopRows.Close()

	// Build pointer map: trip → stop_id → *Stop in the slice we'll attach.
	for tid, ss := range tripStops {
		ssCopy := make([]Stop, len(ss))
		copy(ssCopy, ss)
		for i := range ssCopy {
			stopByID[ssCopy[i].ID] = &ssCopy[i]
		}
		trips[idx[tid]].Stops = ssCopy
	}

	if len(stopByID) == 0 {
		return nil
	}
	stopIDs := make([]any, 0, len(stopByID))
	for sid := range stopByID {
		stopIDs = append(stopIDs, sid)
	}
	placeholdersS := strings.Repeat("?,", len(stopIDs))
	placeholdersS = strings.TrimRight(placeholdersS, ",")
	pRows, err := s.DB.Query(`SELECT trip_stop_id, volunteer_id, action FROM trip_stop_passengers WHERE trip_stop_id IN (`+placeholdersS+`)`, stopIDs...)
	if err != nil {
		return err
	}
	for pRows.Next() {
		var stopID, volID int64
		var action string
		if err := pRows.Scan(&stopID, &volID, &action); err != nil {
			_ = pRows.Close()
			return err
		}
		if sp, ok := stopByID[stopID]; ok {
			if action == "board" {
				sp.Board = append(sp.Board, volID)
			} else if action == "alight" {
				sp.Alight = append(sp.Alight, volID)
			}
		}
	}
	if err := pRows.Err(); err != nil {
		_ = pRows.Close()
		return err
	}
	_ = pRows.Close()

	// Sort passenger ids for determinism.
	for i := range trips {
		for j := range trips[i].Stops {
			sort.Slice(trips[i].Stops[j].Board, func(a, b int) bool { return trips[i].Stops[j].Board[a] < trips[i].Stops[j].Board[b] })
			sort.Slice(trips[i].Stops[j].Alight, func(a, b int) bool { return trips[i].Stops[j].Alight[a] < trips[i].Stops[j].Alight[b] })
		}
	}
	return nil
}

// Create inserts a new trip + stops + passengers transactionally.
func (s *Store) Create(in Input) (Trip, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return Trip{}, err
	}
	defer func() { _ = tx.Rollback() }()
	mode := in.Mode
	if mode == "" {
		mode = "drive"
	}
	res, err := tx.Exec(`INSERT INTO trips (day, driver_id, car_id, mode, notes) VALUES (?, ?, ?, ?, ?)`,
		in.Day, in.DriverID, in.CarID, mode, nullableString(in.Notes))
	if err != nil {
		return Trip{}, err
	}
	tripID, _ := res.LastInsertId()
	if err := writeStops(tx, tripID, in.Stops); err != nil {
		return Trip{}, err
	}
	if err := tx.Commit(); err != nil {
		return Trip{}, err
	}
	return s.Get(tripID)
}

// Replace updates a trip's metadata and replaces its stops + passengers.
func (s *Store) Replace(id int64, in Input) (Trip, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return Trip{}, err
	}
	defer func() { _ = tx.Rollback() }()
	mode := in.Mode
	if mode == "" {
		mode = "drive"
	}
	res, err := tx.Exec(`UPDATE trips SET day=?, driver_id=?, car_id=?, mode=?, notes=?, updated_at=datetime('now') WHERE id=?`,
		in.Day, in.DriverID, in.CarID, mode, nullableString(in.Notes), id)
	if err != nil {
		return Trip{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Trip{}, ErrNotFound
	}
	if _, err := tx.Exec(`DELETE FROM trip_stops WHERE trip_id = ?`, id); err != nil {
		return Trip{}, err
	}
	if err := writeStops(tx, id, in.Stops); err != nil {
		return Trip{}, err
	}
	if err := tx.Commit(); err != nil {
		return Trip{}, err
	}
	return s.Get(id)
}

func writeStops(tx *sql.Tx, tripID int64, stops []StopInput) error {
	for i, st := range stops {
		src := st.LegTimeSource
		if src == "" {
			src = "auto"
		}
		res, err := tx.Exec(`INSERT INTO trip_stops (trip_id, sequence, vs_id, time, leg_time_source) VALUES (?, ?, ?, ?, ?)`,
			tripID, i, st.VSID, st.Time, src)
		if err != nil {
			return err
		}
		stopID, _ := res.LastInsertId()
		seen := map[int64]bool{}
		for _, v := range st.Board {
			if v == 0 || seen[v] {
				continue
			}
			seen[v] = true
			if _, err := tx.Exec(`INSERT INTO trip_stop_passengers (trip_stop_id, volunteer_id, action) VALUES (?, ?, 'board')`, stopID, v); err != nil {
				return err
			}
		}
		seenA := map[int64]bool{}
		for _, v := range st.Alight {
			if v == 0 || seenA[v] {
				continue
			}
			seenA[v] = true
			if _, err := tx.Exec(`INSERT INTO trip_stop_passengers (trip_stop_id, volunteer_id, action) VALUES (?, ?, 'alight')`, stopID, v); err != nil {
				return err
			}
		}
	}
	return nil
}

// Delete removes a trip; stops + passengers cascade.
func (s *Store) Delete(id int64) error {
	res, err := s.DB.Exec(`DELETE FROM trips WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// TripsByDriver returns IDs of trips whose driver is the given volunteer.
func (s *Store) TripsByDriver(volunteerID int64) ([]int64, error) {
	rows, err := s.DB.Query(`SELECT id FROM trips WHERE driver_id = ? ORDER BY id`, volunteerID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// CountTripsByVS returns the number of distinct trips that contain at least
// one stop at the given VS.
func (s *Store) CountTripsByVS(vsID int64) (int, error) {
	var n int
	err := s.DB.QueryRow(`SELECT COUNT(DISTINCT trip_id) FROM trip_stops WHERE vs_id = ?`, vsID).Scan(&n)
	return n, err
}

// DeleteTripsByVS deletes every trip that has at least one stop at the given
// VS. Stops and passengers cascade via FK ON DELETE CASCADE from trips.
func (s *Store) DeleteTripsByVS(vsID int64) error {
	_, err := s.DB.Exec(`DELETE FROM trips WHERE id IN (SELECT DISTINCT trip_id FROM trip_stops WHERE vs_id = ?)`, vsID)
	return err
}

// TripsByCar returns IDs of trips using the given car.
func (s *Store) TripsByCar(carID int64) ([]int64, error) {
	rows, err := s.DB.Query(`SELECT id FROM trips WHERE car_id = ? ORDER BY id`, carID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func nullableString(s string) any {
	if s == "" {
		return nil
	}
	return s
}
