package server

import (
	"bufio"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"runtime/debug"
	"time"
)

type statusRecorder struct {
	http.ResponseWriter
	code int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.code = code
	r.ResponseWriter.WriteHeader(code)
}

// Hijack forwards to the underlying ResponseWriter so reverse-proxied
// websocket upgrades (e.g. Vite HMR) work through our middleware chain.
func (r *statusRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	h, ok := r.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("statusRecorder: underlying ResponseWriter is not a Hijacker")
	}
	return h.Hijack()
}

// Flush forwards to the underlying ResponseWriter when it supports flushing
// (server-sent events, streaming responses).
func (r *statusRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func requestLogger(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w, code: 200}
			next.ServeHTTP(rec, r)
			logger.Info("http",
				"method", r.Method,
				"path", r.URL.Path,
				"status", rec.code,
				"dur_ms", time.Since(start).Milliseconds(),
			)
		})
	}
}

func recoverer(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					logger.Error("panic", "err", rec, "stack", string(debug.Stack()))
					http.Error(w, "internal server error", http.StatusInternalServerError)
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}
