package csv

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/guillaumetavernier/volunteersmanager/internal/features/event"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/volunteer"
	"github.com/guillaumetavernier/volunteersmanager/internal/store"
)

func newTestServer(t *testing.T) (*store.Store, *volunteer.Store, *event.Store, chi.Router) {
	t.Helper()
	dir := t.TempDir()
	s, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	if err := s.Migrate(); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	vs := volunteer.NewStore(s.DB)
	es := event.NewStore(s.DB)
	if _, err := es.Upsert(event.Event{Name: "Test", StartDate: "2026-06-01", EndDate: "2026-06-02", Timezone: "Europe/Paris", CountryCode: "FR"}); err != nil {
		t.Fatalf("Upsert event: %v", err)
	}
	r := chi.NewRouter()
	NewHandler(NewSessionStore(s.DB), vs, es).Mount(r)
	volunteer.NewHandler(vs, es).Mount(r) // not strictly used; mounted to mimic prod surface
	return s, vs, es, r
}

func uploadCSV(t *testing.T, r chi.Router, name, body string) uploadResponse {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	part, err := mw.CreateFormFile("file", name)
	if err != nil {
		t.Fatalf("CreateFormFile: %v", err)
	}
	if _, err := part.Write([]byte(body)); err != nil {
		t.Fatalf("write part: %v", err)
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("mw.Close: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/csv/upload", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("upload status = %d; body=%s", rec.Code, rec.Body.String())
	}
	var resp uploadResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return resp
}

func TestCSV_FullFlow_50RowsWith5Duplicates(t *testing.T) {
	_, vs, _, r := newTestServer(t)

	// Seed 5 volunteers; the CSV will mention 5 names matching them (so 5
	// updates) and 45 distinct (so 45 new). Total preview: new=45, update=5,
	// ambiguous=0.
	type seed struct{ fn, ln string }
	seeds := []seed{
		{"Marie", "Dupont"},
		{"Jean", "Martin"},
		{"Paul", "Petit"},
		{"Anne", "Lefevre"},
		{"Luc", "Bernard"},
	}
	for i, s := range seeds {
		if _, err := vs.Create(volunteer.Input{FirstName: s.fn, LastName: s.ln, Phone: fmt.Sprintf("+3361111110%d", i)}); err != nil {
			t.Fatalf("seed %d: %v", i, err)
		}
	}

	// Build CSV: BOM + semicolon delimiter + FR headers; 50 rows.
	var b strings.Builder
	b.WriteString(string([]byte{0xEF, 0xBB, 0xBF}))
	b.WriteString("Prénom;Nom;Téléphone;Email\n")
	for i := 0; i < 5; i++ {
		fmt.Fprintf(&b, "%s;%s;06 11 22 33 %02d;\n", seeds[i].fn, seeds[i].ln, i)
	}
	for i := 0; i < 45; i++ {
		fmt.Fprintf(&b, "First%02d;Last%02d;06 22 33 44 %02d;f%02d@example.org\n", i, i, i%100, i)
	}

	resp := uploadCSV(t, r, "roster.csv", b.String())
	if resp.RowCount != 50 {
		t.Fatalf("row count = %d", resp.RowCount)
	}
	if resp.Delimiter != ";" {
		t.Fatalf("delim = %q", resp.Delimiter)
	}
	if len(resp.Preview) != 5 {
		t.Fatalf("preview rows = %d", len(resp.Preview))
	}

	// POST mapping using the auto-detected mapping.
	colToField := map[string]string{}
	for k, v := range resp.AutoMap {
		colToField[strconv.Itoa(k)] = v
	}
	body, _ := json.Marshal(mappingRequest{ColumnToField: colToField, UpsertKey: UpsertByName})
	req := httptest.NewRequest(http.MethodPost, "/api/csv/"+resp.SessionID+"/mapping", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("mapping status = %d; body=%s", rec.Code, rec.Body.String())
	}
	var mr mappingResponse
	_ = json.NewDecoder(rec.Body).Decode(&mr)
	if mr.Counts.New != 45 || mr.Counts.Update != 5 || mr.Counts.Ambiguous != 0 {
		t.Fatalf("counts = %+v", mr.Counts)
	}

	// Commit.
	req = httptest.NewRequest(http.MethodPost, "/api/csv/"+resp.SessionID+"/commit", nil)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("commit status = %d; body=%s", rec.Code, rec.Body.String())
	}
	var cr commitResponse
	_ = json.NewDecoder(rec.Body).Decode(&cr)
	if cr.Result.Inserted != 45 || cr.Result.Updated != 5 {
		t.Fatalf("commit result = %+v", cr.Result)
	}

	// Session should be gone post-commit.
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/csv/"+resp.SessionID+"/commit", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("post-commit session expected 404, got %d", rec.Code)
	}
}

func TestCSV_ExportThenReImport_ZeroNew(t *testing.T) {
	_, vs, _, r := newTestServer(t)
	for i := 0; i < 5; i++ {
		fn := []string{"A", "B", "C", "D", "E"}[i]
		if _, err := vs.Create(volunteer.Input{FirstName: fn, LastName: "X", Phone: fmt.Sprintf("+3361111111%d", i)}); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	// Hit export.
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/volunteers/export.csv", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("export status = %d", rec.Code)
	}
	csvBody, _ := io.ReadAll(rec.Body)

	// Round-trip through the upload endpoint.
	resp := uploadCSV(t, r, "export.csv", string(csvBody))
	colToField := map[string]string{}
	for k, v := range resp.AutoMap {
		colToField[strconv.Itoa(k)] = v
	}
	body, _ := json.Marshal(mappingRequest{ColumnToField: colToField, UpsertKey: UpsertByName})
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/csv/"+resp.SessionID+"/mapping", bytes.NewReader(body)))
	if rec.Code != http.StatusOK {
		t.Fatalf("mapping status = %d; body=%s", rec.Code, rec.Body.String())
	}
	var mr mappingResponse
	_ = json.NewDecoder(rec.Body).Decode(&mr)
	if mr.Counts.New != 0 || mr.Counts.Update != 5 || mr.Counts.Ambiguous != 0 {
		t.Fatalf("counts = %+v", mr.Counts)
	}
}

func TestCSV_ResolveAmbiguous(t *testing.T) {
	_, vs, _, r := newTestServer(t)
	// Seed two "Jean Martin" so the row is ambiguous.
	a, _ := vs.Create(volunteer.Input{FirstName: "Jean", LastName: "Martin", Phone: "+33611111111"})
	_, _ = vs.Create(volunteer.Input{FirstName: "Jean", LastName: "Martin", Phone: "+33611111112"})

	body := "Prénom;Nom;Téléphone\nJean;Martin;+33611111199\n"
	resp := uploadCSV(t, r, "x.csv", body)
	colToField := map[string]string{}
	for k, v := range resp.AutoMap {
		colToField[strconv.Itoa(k)] = v
	}
	req := httptest.NewRequest(http.MethodPost, "/api/csv/"+resp.SessionID+"/mapping",
		bytes.NewReader(mustJSON(mappingRequest{ColumnToField: colToField, UpsertKey: UpsertByName})))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	var mr mappingResponse
	_ = json.NewDecoder(rec.Body).Decode(&mr)
	if mr.Counts.Ambiguous != 1 {
		t.Fatalf("counts = %+v", mr.Counts)
	}

	// Commit refuses while ambiguous.
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/csv/"+resp.SessionID+"/commit", nil))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("commit pre-resolve status = %d", rec.Code)
	}

	// Resolve to update first candidate.
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/csv/"+resp.SessionID+"/resolve",
		bytes.NewReader(mustJSON(resolveRequest{Row: 0, Choice: "update:" + strconv.FormatInt(a.ID, 10)}))))
	if rec.Code != http.StatusOK {
		t.Fatalf("resolve status = %d; body=%s", rec.Code, rec.Body.String())
	}

	// Commit succeeds.
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/csv/"+resp.SessionID+"/commit", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("commit status = %d", rec.Code)
	}
}

func TestCSV_TemplateAndExportHeaders(t *testing.T) {
	_, _, _, r := newTestServer(t)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/volunteers/template.csv", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("template status = %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "Prénom") {
		t.Fatalf("template body missing canonical header")
	}
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
