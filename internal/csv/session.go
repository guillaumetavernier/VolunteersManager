package csv

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
)

var ErrSessionNotFound = errors.New("csv: session not found or expired")

// SessionState is persisted as JSON in csv_imports.state.
type SessionState struct {
	Filename    string         `json:"filename"`
	Parsed      *Parsed        `json:"parsed"`
	Mapping     map[int]string `json:"mapping,omitempty"`
	UpsertKey   UpsertKey      `json:"upsert_key,omitempty"`
	Validated   []ValidatedRow `json:"validated,omitempty"`
	Decisions   []RowDecision  `json:"decisions,omitempty"`
	CountryCode string         `json:"country_code,omitempty"`
}

// SessionStore persists CSV import sessions in the csv_imports table.
type SessionStore struct{ DB *sql.DB }

func NewSessionStore(db *sql.DB) *SessionStore { return &SessionStore{DB: db} }

// Create writes a new session with a fresh random ID and a 1h TTL.
func (s *SessionStore) Create(state SessionState) (string, error) {
	id, err := randomID()
	if err != nil {
		return "", err
	}
	body, err := json.Marshal(state)
	if err != nil {
		return "", err
	}
	const q = `INSERT INTO csv_imports (id, state, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))`
	if _, err := s.DB.Exec(q, id, string(body)); err != nil {
		return "", err
	}
	return id, nil
}

// Get loads a session by ID. Expired rows are deleted and treated as not found.
func (s *SessionStore) Get(id string) (SessionState, error) {
	// First sweep expired rows so concurrent calls don't see stale state.
	_ = s.GC()
	var raw string
	err := s.DB.QueryRow(`SELECT state FROM csv_imports WHERE id = ? AND expires_at > datetime('now')`, id).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return SessionState{}, ErrSessionNotFound
	}
	if err != nil {
		return SessionState{}, err
	}
	var st SessionState
	if err := json.Unmarshal([]byte(raw), &st); err != nil {
		return SessionState{}, fmt.Errorf("csv: decode session: %w", err)
	}
	return st, nil
}

// Update replaces the state for an existing session, preserving its expiry.
func (s *SessionStore) Update(id string, state SessionState) error {
	body, err := json.Marshal(state)
	if err != nil {
		return err
	}
	res, err := s.DB.Exec(`UPDATE csv_imports SET state = ? WHERE id = ? AND expires_at > datetime('now')`, string(body), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrSessionNotFound
	}
	return nil
}

// Delete removes a session immediately (used after commit).
func (s *SessionStore) Delete(id string) error {
	_, err := s.DB.Exec(`DELETE FROM csv_imports WHERE id = ?`, id)
	return err
}

// GC deletes all expired sessions.
func (s *SessionStore) GC() error {
	_, err := s.DB.Exec(`DELETE FROM csv_imports WHERE expires_at <= datetime('now')`)
	return err
}

func randomID() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
