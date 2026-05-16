package archive

import (
	"archive/zip"
	"bytes"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/guillaumetavernier/volunteersmanager/internal/store"
)

// Import reads a zip archive produced by Export and materializes it into a
// fresh SQLite file at targetDBPath. It also writes asset and gpx files into
// assetsDir and gpxDir respectively. The archive's manifest schema_version
// must be <= the importer's current migration count; the new DB is migrated
// to the latest version before SQL replay so older archives still load.
//
// Original primary keys are preserved: the dump uses INSERTs verbatim and the
// target DB is empty before replay. After replay, sqlite_sequence is bumped
// per AUTOINCREMENT table so future inserts pick up where the archive left off.
func Import(zipReader io.Reader, targetDBPath, assetsDir, gpxDir string) error {
	b, err := io.ReadAll(zipReader)
	if err != nil {
		return fmt.Errorf("archive: read zip: %w", err)
	}
	zr, err := zip.NewReader(bytes.NewReader(b), int64(len(b)))
	if err != nil {
		return fmt.Errorf("archive: open zip: %w", err)
	}

	manifestBytes, err := readZipEntry(zr, "manifest.json")
	if err != nil {
		return err
	}
	manifest, err := decodeManifest(manifestBytes)
	if err != nil {
		return err
	}
	if manifest.ArchiveFormat != ArchiveFormat {
		return fmt.Errorf("archive: unsupported archive_format %d (expected %d)", manifest.ArchiveFormat, ArchiveFormat)
	}

	sqlBytes, err := readZipEntry(zr, "event.sql")
	if err != nil {
		return err
	}

	if _, err := os.Stat(targetDBPath); err == nil {
		return fmt.Errorf("archive: target DB %q already exists", targetDBPath)
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(targetDBPath), 0o755); err != nil {
		return err
	}

	st, err := store.Open(targetDBPath)
	if err != nil {
		return err
	}
	defer func() { _ = st.Close() }()
	if err := st.Migrate(); err != nil {
		return fmt.Errorf("archive: migrate fresh DB: %w", err)
	}

	current, err := CurrentSchemaVersion(st.DB)
	if err != nil {
		return err
	}
	if manifest.SchemaVersion > current {
		return fmt.Errorf("archive: schema_version %d > current %d", manifest.SchemaVersion, current)
	}

	if err := replaySQL(st.DB, sqlBytes); err != nil {
		return err
	}
	if err := bumpSequences(st.DB); err != nil {
		return err
	}

	if err := extractFiles(zr, "assets/", assetsDir); err != nil {
		return err
	}
	if err := extractFiles(zr, "gpx/", gpxDir); err != nil {
		return err
	}
	return nil
}

func readZipEntry(zr *zip.Reader, name string) ([]byte, error) {
	for _, f := range zr.File {
		if f.Name == name {
			rc, err := f.Open()
			if err != nil {
				return nil, err
			}
			defer func() { _ = rc.Close() }()
			return io.ReadAll(rc)
		}
	}
	return nil, fmt.Errorf("archive: missing %s in zip", name)
}

// replaySQL executes every INSERT statement in the dump inside a single
// transaction. Foreign keys are disabled for the duration so rows can be
// inserted in any order; the dump is otherwise canonical-ordered which
// usually matches insertion order, but we don't rely on it.
func replaySQL(db *sql.DB, body []byte) error {
	if _, err := db.Exec(`PRAGMA foreign_keys = OFF`); err != nil {
		return err
	}
	defer func() { _, _ = db.Exec(`PRAGMA foreign_keys = ON`) }()

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	stmts := splitStatements(string(body))
	for _, stmt := range stmts {
		s := strings.TrimSpace(stmt)
		if s == "" {
			continue
		}
		if _, err := tx.Exec(s); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("archive: replay %q: %w", truncate(s, 80), err)
		}
	}
	return tx.Commit()
}

// splitStatements splits the dump on top-level `;` followed by newline. The
// dump format guarantees this; quoted single-quote literals are escaped as
// `''` so the simple split is safe.
func splitStatements(s string) []string {
	var out []string
	var cur strings.Builder
	inStr := false
	for i := 0; i < len(s); i++ {
		c := s[i]
		cur.WriteByte(c)
		if c == '\'' {
			if inStr && i+1 < len(s) && s[i+1] == '\'' {
				cur.WriteByte('\'')
				i++
				continue
			}
			inStr = !inStr
			continue
		}
		if c == ';' && !inStr {
			out = append(out, cur.String())
			cur.Reset()
		}
	}
	if cur.Len() > 0 {
		out = append(out, cur.String())
	}
	return out
}

// bumpSequences ensures sqlite_sequence is in sync with the imported rows
// so newly-inserted rows don't collide with archived IDs.
func bumpSequences(db *sql.DB) error {
	row := db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'`)
	var present int
	if err := row.Scan(&present); err != nil {
		return err
	}
	if present == 0 {
		return nil
	}
	rows, err := db.Query(`SELECT name FROM sqlite_sequence`)
	if err != nil {
		return err
	}
	var tables []string
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			_ = rows.Close()
			return err
		}
		tables = append(tables, t)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	// Also find autoincrement tables that have inserted rows but no sequence row yet.
	mrows, err := db.Query(`SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%AUTOINCREMENT%'`)
	if err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, t := range tables {
		seen[t] = true
	}
	for mrows.Next() {
		var t string
		if err := mrows.Scan(&t); err != nil {
			_ = mrows.Close()
			return err
		}
		if !seen[t] {
			tables = append(tables, t)
			seen[t] = true
		}
	}
	if err := mrows.Close(); err != nil {
		return err
	}

	for _, t := range tables {
		var max sql.NullInt64
		if err := db.QueryRow(fmt.Sprintf(`SELECT MAX(id) FROM %s`, quoteIdent(t))).Scan(&max); err != nil {
			// Table without an `id` column — skip.
			continue
		}
		if !max.Valid {
			continue
		}
		_, _ = db.Exec(`DELETE FROM sqlite_sequence WHERE name = ?`, t)
		if _, err := db.Exec(`INSERT INTO sqlite_sequence(name, seq) VALUES (?, ?)`, t, max.Int64); err != nil {
			return err
		}
	}
	return nil
}

func extractFiles(zr *zip.Reader, prefix, destDir string) error {
	if destDir == "" {
		return nil
	}
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return err
	}
	for _, f := range zr.File {
		if !strings.HasPrefix(f.Name, prefix) {
			continue
		}
		rel := strings.TrimPrefix(f.Name, prefix)
		if rel == "" || strings.HasSuffix(rel, "/") {
			continue
		}
		if strings.Contains(rel, "..") {
			return fmt.Errorf("archive: refusing path traversal %q", f.Name)
		}
		abs := filepath.Join(destDir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		body, err := io.ReadAll(rc)
		_ = rc.Close()
		if err != nil {
			return err
		}
		if err := os.WriteFile(abs, body, 0o644); err != nil {
			return err
		}
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
