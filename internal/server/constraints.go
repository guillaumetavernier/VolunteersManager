package server

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"sort"
	"strings"

	"github.com/guillaumetavernier/volunteersmanager/internal/domain/constraints"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/warnings"
)

// apiOnly wraps a middleware so it only runs for requests whose path is /api
// or under /api/. Other paths (SPA fallback, /tiles/*.pmtiles, /assets/vs/*)
// pass through to the next handler untouched.
func apiOnly(mw func(http.Handler) http.Handler) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		wrapped := mw(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p := r.URL.Path
			if p == "/api" || strings.HasPrefix(p, "/api/") {
				wrapped.ServeHTTP(w, r)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// captureWriter buffers the response so the middleware can rewrite the body
// after a successful mutation. Status defaults to 200 (mirrors http.ResponseWriter).
type captureWriter struct {
	http.ResponseWriter
	status int
	buf    bytes.Buffer
	wrote  bool
}

func (c *captureWriter) WriteHeader(code int) {
	c.status = code
	c.wrote = true
}

func (c *captureWriter) Write(p []byte) (int, error) {
	if !c.wrote {
		c.status = http.StatusOK
		c.wrote = true
	}
	return c.buf.Write(p)
}

// constraintMiddleware factory: returns a middleware that wraps mutation
// responses with `{data, warnings}`. Read endpoints aren't wrapped — wire only
// mutation routes through this.
func constraintMiddleware(db *sql.DB, store *warnings.Store, logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip read-only methods entirely.
			if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			cap := &captureWriter{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(cap, r)

			// Non-2xx: pass through unchanged.
			if cap.status < 200 || cap.status >= 300 {
				if cap.status != 0 {
					w.WriteHeader(cap.status)
				}
				_, _ = w.Write(cap.buf.Bytes())
				return
			}

			ctx := r.Context()
			prevIDs, err := store.LoadIDs(ctx)
			if err != nil {
				logger.Warn("warnings: load prev ids failed", "err", err)
				prevIDs = map[string]bool{}
			}
			state, err := constraints.LoadState(ctx, db)
			if err != nil {
				logger.Warn("warnings: load state failed", "err", err)
				// best-effort: ship original response unchanged
				w.WriteHeader(cap.status)
				_, _ = w.Write(cap.buf.Bytes())
				return
			}
			newWs := constraints.Compute(state)
			if err := store.Persist(ctx, newWs); err != nil {
				logger.Warn("warnings: persist failed", "err", err)
				w.WriteHeader(cap.status)
				_, _ = w.Write(cap.buf.Bytes())
				return
			}

			newIDs := make(map[string]bool, len(newWs))
			added := []constraints.Warning{}
			for _, ww := range newWs {
				newIDs[ww.ID] = true
				if !prevIDs[ww.ID] {
					added = append(added, ww)
				}
			}
			removed := []string{}
			for id := range prevIDs {
				if !newIDs[id] {
					removed = append(removed, id)
				}
			}
			sort.Strings(removed)
			unchanged := len(newWs) - len(added)

			// Wrap body. If body is empty (204), still attach a warnings block
			// with null data so the frontend can update its cache.
			var data any
			if cap.buf.Len() > 0 {
				if err := json.Unmarshal(cap.buf.Bytes(), &data); err != nil {
					data = json.RawMessage(cap.buf.Bytes())
				}
			}

			payload := map[string]any{
				"data": data,
				"warnings": map[string]any{
					"added":     added,
					"removed":   removed,
					"unchanged": unchanged,
				},
			}
			w.Header().Set("Content-Type", "application/json")
			// 204 No Content must not carry a body. Upgrade to 200 when we wrap.
			status := cap.status
			if status == http.StatusNoContent {
				status = http.StatusOK
			}
			w.WriteHeader(status)
			_ = json.NewEncoder(w).Encode(payload)
		})
	}
}
