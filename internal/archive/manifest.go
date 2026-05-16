// Package archive exports and imports the single-event SQLite database, its
// uploaded assets and its GPX source files as a portable zip. The format is
// intentionally minimal: a JSON manifest, a deterministic SQL dump and the
// asset/gpx blobs referenced by *_path columns. Map tiles are excluded.
package archive

import (
	"database/sql"
	"encoding/json"
	"fmt"
)

// ArchiveFormat is the on-disk archive format version. Bump if the wire
// format changes (manifest fields, file layout). Independent of the DB
// schema version, which travels in Manifest.SchemaVersion.
const ArchiveFormat = 1

// Manifest is the JSON shape of manifest.json inside the zip. No timestamps —
// determinism is required for round-trip tests.
type Manifest struct {
	SchemaVersion int    `json:"schema_version"`
	EventName     string `json:"event_name"`
	ArchiveFormat int    `json:"archive_format"`
}

// CurrentSchemaVersion returns the highest applied migration version in the
// database. Returns 0 if no migrations are recorded (fresh DB).
func CurrentSchemaVersion(db *sql.DB) (int, error) {
	row := db.QueryRow(`SELECT COALESCE(MAX(version), 0) FROM schema_migrations`)
	var v int
	if err := row.Scan(&v); err != nil {
		return 0, fmt.Errorf("archive: read schema version: %w", err)
	}
	return v, nil
}

func encodeManifest(m Manifest) ([]byte, error) {
	return json.MarshalIndent(m, "", "  ")
}

func decodeManifest(b []byte) (Manifest, error) {
	var m Manifest
	if err := json.Unmarshal(b, &m); err != nil {
		return Manifest{}, fmt.Errorf("archive: parse manifest: %w", err)
	}
	return m, nil
}
