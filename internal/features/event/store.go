package event

import (
	"database/sql"
	"errors"
)

// ErrNotInitialized is returned when the singleton row hasn't been written yet.
var ErrNotInitialized = errors.New("event: not initialized")

type Store struct{ DB *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{DB: db} }

func (s *Store) Get() (Event, error) {
	const q = `SELECT id, name, start_date, end_date, timezone, country_code, settings,
	                  logo_path, sponsor_path, coordinator_name, coordinator_phone,
	                  created_at, updated_at
	           FROM events WHERE id = 1`
	var e Event
	err := s.DB.QueryRow(q).Scan(&e.ID, &e.Name, &e.StartDate, &e.EndDate, &e.Timezone, &e.CountryCode, &e.Settings,
		&e.LogoPath, &e.SponsorPath, &e.CoordinatorName, &e.CoordinatorPhone,
		&e.CreatedAt, &e.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Event{}, ErrNotInitialized
	}
	return e, err
}

// Upsert writes (or replaces) the singleton row. The CHECK constraint on the
// events table guarantees id=1 is the only legal value.
func (s *Store) Upsert(e Event) (Event, error) {
	const q = `INSERT INTO events (id, name, start_date, end_date, timezone, country_code, settings,
	                                logo_path, sponsor_path, coordinator_name, coordinator_phone, updated_at)
	           VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
	           ON CONFLICT(id) DO UPDATE SET
	             name=excluded.name,
	             start_date=excluded.start_date,
	             end_date=excluded.end_date,
	             timezone=excluded.timezone,
	             country_code=excluded.country_code,
	             settings=excluded.settings,
	             logo_path=excluded.logo_path,
	             sponsor_path=excluded.sponsor_path,
	             coordinator_name=excluded.coordinator_name,
	             coordinator_phone=excluded.coordinator_phone,
	             updated_at=datetime('now')`
	if _, err := s.DB.Exec(q, e.Name, e.StartDate, e.EndDate, e.Timezone, e.CountryCode, settingsOrDefault(e.Settings),
		e.LogoPath, e.SponsorPath, e.CoordinatorName, e.CoordinatorPhone); err != nil {
		return Event{}, err
	}
	return s.Get()
}

// SetLogoPath updates only the logo_path column.
func (s *Store) SetLogoPath(p string) error {
	_, err := s.DB.Exec(`UPDATE events SET logo_path = ?, updated_at = datetime('now') WHERE id = 1`, p)
	return err
}

// SetSponsorPath updates only the sponsor_path column.
func (s *Store) SetSponsorPath(p string) error {
	_, err := s.DB.Exec(`UPDATE events SET sponsor_path = ?, updated_at = datetime('now') WHERE id = 1`, p)
	return err
}

func settingsOrDefault(s string) string {
	if s == "" {
		return "{}"
	}
	return s
}
