package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// regionCatalog lists region slugs whitelisted for download. The base URL is
// configurable so tests can point at a local httptest server.
var regionCatalog = map[string]string{
	// Slugs match the wizard's options. URLs target a presumed mirror that the
	// deployer is expected to provide; production users may simply prefetch the
	// file and pass --offline-tiles instead.
	"europe-france":    "/protomaps/europe-france.pmtiles",
	"europe-france-iv": "/protomaps/europe-france-iv.pmtiles",
	"europe-germany":   "/protomaps/europe-germany.pmtiles",
	"europe-italy":     "/protomaps/europe-italy.pmtiles",
	"europe-spain":     "/protomaps/europe-spain.pmtiles",
	"europe-belgium":   "/protomaps/europe-belgium.pmtiles",
	"europe-uk":        "/protomaps/europe-uk.pmtiles",
}

// TileService bundles tile-serving and tile-downloading state.
type TileService struct {
	Dir     string // absolute path to the tiles directory
	BaseURL string // URL prefix prepended to regionCatalog entries when downloading

	mu     sync.Mutex
	status DownloadStatus
}

type DownloadState string

const (
	StateIdle        DownloadState = "idle"
	StateDownloading DownloadState = "downloading"
	StateDone        DownloadState = "done"
	StateError       DownloadState = "error"
)

type DownloadStatus struct {
	State           DownloadState `json:"state"`
	Region          string        `json:"region,omitempty"`
	BytesDownloaded int64         `json:"bytes_downloaded"`
	BytesTotal      int64         `json:"bytes_total"`
	Error           string        `json:"error,omitempty"`
	StartedAt       string        `json:"started_at,omitempty"`
	FinishedAt      string        `json:"finished_at,omitempty"`
}

func NewTileService(dir, baseURL string) *TileService {
	return &TileService{Dir: dir, BaseURL: baseURL, status: DownloadStatus{State: StateIdle}}
}

func (s *TileService) Mount(r chi.Router) {
	r.Get("/tiles/{region}.pmtiles", s.serve)
	r.Get("/api/tiles", s.listRegions)
	r.Post("/api/tiles/download", s.download)
	r.Get("/api/tiles/download/status", s.statusJSON)
}

type tileError struct {
	Code    string `json:"code"`
	Message string `json:"message,omitempty"`
}

func (s *TileService) serve(w http.ResponseWriter, r *http.Request) {
	region := chi.URLParam(r, "region")
	if !validRegion(region) {
		writeTileError(w, http.StatusNotFound, "unknown_region")
		return
	}
	path := filepath.Join(s.Dir, region+".pmtiles")
	f, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		writeTileError(w, http.StatusNotFound, "tiles_not_downloaded")
		return
	}
	if err != nil {
		writeTileError(w, http.StatusInternalServerError, "internal")
		return
	}
	defer func() { _ = f.Close() }()
	stat, err := f.Stat()
	if err != nil {
		writeTileError(w, http.StatusInternalServerError, "internal")
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeContent(w, r, region+".pmtiles", stat.ModTime(), f)
}

type regionsResponse struct {
	Regions   []regionInfo `json:"regions"`
	Available []string     `json:"available_locally"`
}

type regionInfo struct {
	Slug      string `json:"slug"`
	Available bool   `json:"available"`
}

func (s *TileService) listRegions(w http.ResponseWriter, _ *http.Request) {
	out := regionsResponse{}
	for slug := range regionCatalog {
		info := regionInfo{Slug: slug}
		if _, err := os.Stat(filepath.Join(s.Dir, slug+".pmtiles")); err == nil {
			info.Available = true
			out.Available = append(out.Available, slug)
		}
		out.Regions = append(out.Regions, info)
	}
	writeJSON(w, http.StatusOK, out)
}

type downloadRequest struct {
	Region string `json:"region"`
}

func (s *TileService) download(w http.ResponseWriter, r *http.Request) {
	var req downloadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeTileError(w, http.StatusBadRequest, "bad_request")
		return
	}
	suffix, ok := regionCatalog[req.Region]
	if !ok {
		writeTileError(w, http.StatusUnprocessableEntity, "unknown_region")
		return
	}

	s.mu.Lock()
	if s.status.State == StateDownloading {
		curr := s.status
		s.mu.Unlock()
		writeJSON(w, http.StatusConflict, curr)
		return
	}
	s.status = DownloadStatus{State: StateDownloading, Region: req.Region, StartedAt: time.Now().UTC().Format(time.RFC3339)}
	s.mu.Unlock()

	url := s.BaseURL + suffix
	go s.run(req.Region, url)

	s.mu.Lock()
	out := s.status
	s.mu.Unlock()
	writeJSON(w, http.StatusAccepted, out)
}

func (s *TileService) statusJSON(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	out := s.status
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, out)
}

func (s *TileService) run(region, url string) {
	finalize := func(state DownloadState, errStr string) {
		s.mu.Lock()
		s.status.State = state
		s.status.Error = errStr
		s.status.FinishedAt = time.Now().UTC().Format(time.RFC3339)
		s.mu.Unlock()
	}

	if err := os.MkdirAll(s.Dir, 0o755); err != nil {
		finalize(StateError, err.Error())
		return
	}
	tmp := filepath.Join(s.Dir, region+".pmtiles.part")
	final := filepath.Join(s.Dir, region+".pmtiles")

	resp, err := http.Get(url)
	if err != nil {
		finalize(StateError, err.Error())
		return
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		finalize(StateError, fmt.Sprintf("upstream %d", resp.StatusCode))
		return
	}

	s.mu.Lock()
	s.status.BytesTotal = resp.ContentLength
	s.mu.Unlock()

	f, err := os.Create(tmp)
	if err != nil {
		finalize(StateError, err.Error())
		return
	}
	pr := &progressWriter{onChunk: func(n int64) {
		s.mu.Lock()
		s.status.BytesDownloaded += n
		s.mu.Unlock()
	}}
	if _, err := io.Copy(io.MultiWriter(f, pr), resp.Body); err != nil {
		_ = f.Close()
		_ = os.Remove(tmp)
		finalize(StateError, err.Error())
		return
	}
	if err := f.Close(); err != nil {
		finalize(StateError, err.Error())
		return
	}
	if err := os.Rename(tmp, final); err != nil {
		finalize(StateError, err.Error())
		return
	}
	finalize(StateDone, "")
}

type progressWriter struct {
	onChunk func(int64)
}

func (p *progressWriter) Write(b []byte) (int, error) {
	if p.onChunk != nil {
		p.onChunk(int64(len(b)))
	}
	return len(b), nil
}

func validRegion(slug string) bool {
	_, ok := regionCatalog[slug]
	return ok
}

func writeTileError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, tileError{Code: code})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// AreTilesEmpty reports true when the tiles directory has no .pmtiles files.
func AreTilesEmpty(dir string) bool {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return true
	}
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".pmtiles") {
			return false
		}
	}
	return true
}
