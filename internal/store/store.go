// Package store owns the SQLite connection and migration runner.
package store

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

type Store struct {
	DB   *sql.DB
	Path string
}

// Open opens (or creates) the SQLite file at path and applies the pragmas the
// rest of the app relies on. The caller owns the lifetime; call Close on shutdown.
//
// PRAGMAs in SQLite are per-connection, so we encode them in the DSN — that
// way every connection in database/sql's pool inherits them on first use.
// Without this, a stray pool connection with foreign_keys=OFF can let DELETE
// orphan child rows (the M06 trip_stops flake reproduced this exactly).
func Open(path string) (*Store, error) {
	dsn := fmt.Sprintf("file:%s?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)", path)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("store: open %q: %w", path, err)
	}
	// Sanity-check the file by issuing the same pragmas. With the DSN form
	// above they're already applied per-connection; this also surfaces an
	// unreachable path early.
	if _, err := db.Exec("PRAGMA foreign_keys=ON"); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("store: PRAGMA foreign_keys: %w", err)
	}
	return &Store{DB: db, Path: path}, nil
}

func (s *Store) Close() error {
	if s == nil || s.DB == nil {
		return nil
	}
	return s.DB.Close()
}
