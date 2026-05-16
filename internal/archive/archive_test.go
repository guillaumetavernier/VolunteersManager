package archive

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"

	"github.com/guillaumetavernier/volunteersmanager/internal/store"
)

func newDB(t *testing.T) (*store.Store, string) {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "event.db")
	st, err := store.Open(path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := st.Migrate(); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	return st, dir
}

func seedFixture(t *testing.T, db *sql.DB, assetsDir string) {
	t.Helper()
	_, err := db.Exec(`INSERT INTO events (id, name, start_date, end_date, timezone, country_code, settings, logo_path, sponsor_path, coordinator_name, coordinator_phone)
		VALUES (1, 'Trail des Cimes', '2026-06-01', '2026-06-03', 'Europe/Paris', 'FR', '{"backup":{"daily":true}}', 'logo/abc.png', 'sponsor/def.jpg', 'Alice', '+33600000000')`)
	if err != nil {
		t.Fatalf("seed events: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO vs (id, name, lat, lon, photo_path) VALUES
		(1, 'VS Alpha', 45.1, 6.1, '/assets/vs/aaa.png'),
		(2, 'VS Beta',  45.2, 6.2, NULL)`); err != nil {
		t.Fatalf("seed vs: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO races (id, name, color, front_pace, tail_pace, start_time) VALUES
		(1, '80K', '#ff0000', 12, 5, '2026-06-01T06:00:00Z')`); err != nil {
		t.Fatalf("seed races: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO gpx_files (id, race_id, day, file_path, points, total_distance_m) VALUES
		(1, 1, 1, '/assets/gpx/1/deadbeef.gpx', '[[45.1,6.1,1000],[45.2,6.2,1200]]', 12345.6)`); err != nil {
		t.Fatalf("seed gpx_files: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO volunteers (id, first_name, last_name, phone) VALUES
		(1, 'Bob', 'Martin', '+33611111111'),
		(2, 'Claire', 'Durand', '+33622222222')`); err != nil {
		t.Fatalf("seed volunteers: %v", err)
	}

	mustWrite := func(rel string, body []byte) {
		abs := filepath.Join(assetsDir, rel)
		if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(abs, body, 0o644); err != nil {
			t.Fatalf("write: %v", err)
		}
	}
	mustWrite("vs/aaa.png", []byte("FAKE-PNG-VS"))
	mustWrite("logo/abc.png", []byte("FAKE-PNG-LOGO"))
	mustWrite("sponsor/def.jpg", []byte("FAKE-JPG-SPONSOR"))
	mustWrite("gpx/1/deadbeef.gpx", []byte("<gpx>fake</gpx>"))
}

func hashBytes(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func TestExport_Determinism(t *testing.T) {
	st, dir := newDB(t)
	seedFixture(t, st.DB, dir)

	var first, second bytes.Buffer
	if err := Export(st.DB, "Trail des Cimes", dir, filepath.Join(dir, "gpx"), &first); err != nil {
		t.Fatalf("export first: %v", err)
	}
	if err := Export(st.DB, "Trail des Cimes", dir, filepath.Join(dir, "gpx"), &second); err != nil {
		t.Fatalf("export second: %v", err)
	}
	if !bytes.Equal(first.Bytes(), second.Bytes()) {
		t.Fatalf("repeated exports differ: %s vs %s", hashBytes(first.Bytes()), hashBytes(second.Bytes()))
	}
}

func TestRoundTrip_Determinism(t *testing.T) {
	srcStore, srcDir := newDB(t)
	seedFixture(t, srcStore.DB, srcDir)

	srcDump, err := CanonicalDump(srcStore.DB)
	if err != nil {
		t.Fatalf("dump src: %v", err)
	}

	var zipBuf bytes.Buffer
	if err := Export(srcStore.DB, "Trail des Cimes", srcDir, filepath.Join(srcDir, "gpx"), &zipBuf); err != nil {
		t.Fatalf("export: %v", err)
	}

	dstRoot := t.TempDir()
	dstAssets := filepath.Join(dstRoot, "assets")
	dstGPX := filepath.Join(dstAssets, "gpx")
	dstDB := filepath.Join(dstRoot, "event.db")
	if err := Import(bytes.NewReader(zipBuf.Bytes()), dstDB, dstAssets, dstGPX); err != nil {
		t.Fatalf("import: %v", err)
	}

	dstStore, err := store.Open(dstDB)
	if err != nil {
		t.Fatalf("open dst: %v", err)
	}
	defer func() { _ = dstStore.Close() }()

	dstDump, err := CanonicalDump(dstStore.DB)
	if err != nil {
		t.Fatalf("dump dst: %v", err)
	}
	if !bytes.Equal(srcDump, dstDump) {
		t.Fatalf("dumps differ after round-trip\nSRC hash=%s\nDST hash=%s",
			hashBytes(srcDump), hashBytes(dstDump))
	}

	// Re-export from the new DB and verify it's byte-identical.
	var zipBuf2 bytes.Buffer
	if err := Export(dstStore.DB, "Trail des Cimes", dstAssets, dstGPX, &zipBuf2); err != nil {
		t.Fatalf("re-export: %v", err)
	}
	if !bytes.Equal(zipBuf.Bytes(), zipBuf2.Bytes()) {
		t.Fatalf("zip differs after round-trip: %s vs %s", hashBytes(zipBuf.Bytes()), hashBytes(zipBuf2.Bytes()))
	}

	// Asset bytes survived.
	for _, p := range []string{"vs/aaa.png", "logo/abc.png", "sponsor/def.jpg"} {
		got, err := os.ReadFile(filepath.Join(dstAssets, p))
		if err != nil {
			t.Fatalf("read %s: %v", p, err)
		}
		if len(got) == 0 {
			t.Fatalf("asset %s empty after import", p)
		}
	}
	gpxBody, err := os.ReadFile(filepath.Join(dstGPX, "1", "deadbeef.gpx"))
	if err != nil {
		t.Fatalf("read gpx: %v", err)
	}
	if string(gpxBody) != "<gpx>fake</gpx>" {
		t.Fatalf("gpx round-trip mismatch: %q", gpxBody)
	}
}

func TestImport_RefusesNewerSchema(t *testing.T) {
	st, dir := newDB(t)
	seedFixture(t, st.DB, dir)

	current, err := CurrentSchemaVersion(st.DB)
	if err != nil {
		t.Fatalf("schema version: %v", err)
	}
	manifest := Manifest{
		SchemaVersion: current + 5,
		EventName:     "Future",
		ArchiveFormat: ArchiveFormat,
	}
	mBytes, err := encodeManifest(manifest)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	add := func(name string, body []byte) {
		w, werr := zw.Create(name)
		if werr != nil {
			t.Fatalf("zip create %s: %v", name, werr)
		}
		if _, werr := w.Write(body); werr != nil {
			t.Fatalf("zip write %s: %v", name, werr)
		}
	}
	add("manifest.json", mBytes)
	add("event.sql", []byte(""))
	if err := zw.Close(); err != nil {
		t.Fatalf("zip close: %v", err)
	}

	dstRoot := t.TempDir()
	err = Import(bytes.NewReader(buf.Bytes()), filepath.Join(dstRoot, "event.db"),
		filepath.Join(dstRoot, "assets"), filepath.Join(dstRoot, "assets", "gpx"))
	if err == nil {
		t.Fatalf("expected error for newer schema_version, got nil")
	}
}

func TestSplitStatements_HandlesQuotedSemicolons(t *testing.T) {
	in := `INSERT INTO t VALUES ('a; b', 'c''d');
INSERT INTO t VALUES (1);
`
	stmts := splitStatements(in)
	nonEmpty := 0
	for _, s := range stmts {
		if bytes.TrimSpace([]byte(s)) != nil && len(bytes.TrimSpace([]byte(s))) > 0 {
			nonEmpty++
		}
	}
	if nonEmpty != 2 {
		t.Fatalf("got %d non-empty statements, want 2: %#v", nonEmpty, stmts)
	}
}
