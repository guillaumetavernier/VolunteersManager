// Package warnings persists the constraint engine's output to the warnings
// cache table and exposes it via the API.
package warnings

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/guillaumetavernier/volunteersmanager/internal/domain/constraints"
)

type Store struct{ DB *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{DB: db} }

// Persist replaces the cache with the given warnings inside a single
// transaction. The caller passes the engine's full output.
func (s *Store) Persist(ctx context.Context, ws []constraints.Warning) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM warnings`); err != nil {
		_ = tx.Rollback()
		return err
	}
	if len(ws) == 0 {
		return tx.Commit()
	}
	stmt, err := tx.PrepareContext(ctx, `INSERT INTO warnings (id, kind, severity, message, entities, suggested_fix) VALUES (?, ?, ?, ?, ?, ?)`)
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	defer func() { _ = stmt.Close() }()
	for _, w := range ws {
		ents, err := json.Marshal(w.Entities)
		if err != nil {
			_ = tx.Rollback()
			return err
		}
		var fixJSON any
		if w.SuggestedFix != nil {
			b, err := json.Marshal(w.SuggestedFix)
			if err != nil {
				_ = tx.Rollback()
				return err
			}
			fixJSON = string(b)
		}
		if _, err := stmt.ExecContext(ctx, w.ID, string(w.Kind), string(w.Severity), w.Message, string(ents), fixJSON); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// LoadIDs returns the set of currently-cached warning IDs.
func (s *Store) LoadIDs(ctx context.Context) (map[string]bool, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id FROM warnings`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	out := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

// List returns the full current cached warning set, sorted by ID.
func (s *Store) List(ctx context.Context) ([]constraints.Warning, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, kind, severity, message, entities, suggested_fix FROM warnings ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []constraints.Warning
	for rows.Next() {
		var w constraints.Warning
		var kind, sev, ents string
		var fix sql.NullString
		if err := rows.Scan(&w.ID, &kind, &sev, &w.Message, &ents, &fix); err != nil {
			return nil, err
		}
		w.Kind = constraints.WarningKind(kind)
		w.Severity = constraints.Severity(sev)
		if ents != "" {
			_ = json.Unmarshal([]byte(ents), &w.Entities)
		}
		if fix.Valid && fix.String != "" {
			var f constraints.Fix
			if err := json.Unmarshal([]byte(fix.String), &f); err == nil {
				w.SuggestedFix = &f
			}
		}
		out = append(out, w)
	}
	return out, rows.Err()
}
