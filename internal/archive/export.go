package archive

import (
	"archive/zip"
	"database/sql"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// zeroTime returns a fixed timestamp used for every zip entry so archives
// hash identically across exports. Zip's local time format has 2-second
// granularity and a 1980 epoch; pick something safely inside that range.
func zeroTime() time.Time {
	return time.Date(1980, 1, 1, 0, 0, 0, 0, time.UTC)
}

// Export writes a zip archive of the event to out. The archive contains:
//
//   - manifest.json (no timestamps; deterministic)
//   - event.sql    (canonical SQL dump of every user table)
//   - assets/...   (every file referenced by a *_path column)
//   - gpx/...      (every GPX source file)
//
// Tiles are deliberately excluded. The export is byte-deterministic for a
// given input: zip entries are sorted, modification times are zeroed, and
// the row dump is canonical.
func Export(db *sql.DB, eventName, assetsDir, gpxDir string, out io.Writer) error {
	schemaVersion, err := CurrentSchemaVersion(db)
	if err != nil {
		return err
	}
	manifest := Manifest{
		SchemaVersion: schemaVersion,
		EventName:     eventName,
		ArchiveFormat: ArchiveFormat,
	}
	manifestBytes, err := encodeManifest(manifest)
	if err != nil {
		return err
	}
	sqlBytes, err := CanonicalDump(db)
	if err != nil {
		return err
	}

	assetRefs, err := collectAssetPaths(db)
	if err != nil {
		return err
	}
	gpxRefs, err := collectGPXPaths(db)
	if err != nil {
		return err
	}

	zw := zip.NewWriter(out)

	entries := []struct {
		name string
		data func() ([]byte, error)
	}{
		{"manifest.json", func() ([]byte, error) { return manifestBytes, nil }},
		{"event.sql", func() ([]byte, error) { return sqlBytes, nil }},
	}
	for _, e := range entries {
		if err := writeZipEntry(zw, e.name, e.data); err != nil {
			return err
		}
	}

	if err := writeFileEntries(zw, assetsDir, assetRefs, "assets/"); err != nil {
		return err
	}
	if err := writeFileEntries(zw, gpxDir, gpxRefs, "gpx/"); err != nil {
		return err
	}
	return zw.Close()
}

func writeZipEntry(zw *zip.Writer, name string, supply func() ([]byte, error)) error {
	hdr := &zip.FileHeader{Name: name, Method: zip.Deflate}
	hdr.Modified = zeroTime()
	w, err := zw.CreateHeader(hdr)
	if err != nil {
		return err
	}
	body, err := supply()
	if err != nil {
		return err
	}
	_, err = w.Write(body)
	return err
}

func writeFileEntries(zw *zip.Writer, baseDir string, rels []string, zipPrefix string) error {
	sort.Strings(rels)
	for _, rel := range rels {
		if rel == "" {
			continue
		}
		abs := filepath.Join(baseDir, filepath.FromSlash(rel))
		b, err := os.ReadFile(abs)
		if err != nil {
			if os.IsNotExist(err) {
				// Missing assets are non-fatal — the row stays in the dump,
				// the asset just isn't included. Document the warning in the
				// HTTP layer; here we silently skip.
				continue
			}
			return fmt.Errorf("archive: read %s: %w", abs, err)
		}
		entryName := zipPrefix + rel
		if err := writeZipEntry(zw, entryName, func() ([]byte, error) { return b, nil }); err != nil {
			return err
		}
	}
	return nil
}

// collectAssetPaths gathers every relative asset path the export should
// include. Inputs come from rows in tables that own a *_path column.
// Paths in the DB look like `/assets/vs/<hash>.png` or `assets/logo/<hash>.png`;
// the returned strings are normalized to `vs/<hash>.png`, `logo/<hash>.png`
// (i.e. relative to <AssetDir>, without the `assets/` prefix).
func collectAssetPaths(db *sql.DB) ([]string, error) {
	queries := []string{
		`SELECT photo_path FROM vs WHERE photo_path IS NOT NULL AND photo_path <> ''`,
		`SELECT logo_path FROM events WHERE logo_path IS NOT NULL AND logo_path <> ''`,
		`SELECT sponsor_path FROM events WHERE sponsor_path IS NOT NULL AND sponsor_path <> ''`,
	}
	seen := map[string]struct{}{}
	var out []string
	for _, q := range queries {
		rows, err := db.Query(q)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var p sql.NullString
			if err := rows.Scan(&p); err != nil {
				_ = rows.Close()
				return nil, err
			}
			rel := normalizeAssetPath(p.String)
			if rel == "" {
				continue
			}
			if strings.HasPrefix(rel, "gpx/") {
				continue
			}
			if _, dup := seen[rel]; dup {
				continue
			}
			seen[rel] = struct{}{}
			out = append(out, rel)
		}
		if err := rows.Close(); err != nil {
			return nil, err
		}
	}
	return out, nil
}

func collectGPXPaths(db *sql.DB) ([]string, error) {
	rows, err := db.Query(`SELECT file_path FROM gpx_files WHERE file_path IS NOT NULL AND file_path <> ''`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	seen := map[string]struct{}{}
	var out []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		rel := normalizeAssetPath(p)
		rel = strings.TrimPrefix(rel, "gpx/")
		if rel == "" {
			continue
		}
		if _, dup := seen[rel]; dup {
			continue
		}
		seen[rel] = struct{}{}
		out = append(out, rel)
	}
	return out, rows.Err()
}

func normalizeAssetPath(p string) string {
	p = strings.TrimSpace(p)
	p = strings.TrimPrefix(p, "/")
	p = strings.TrimPrefix(p, "assets/")
	return p
}
