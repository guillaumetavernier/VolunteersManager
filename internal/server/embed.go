package server

import (
	"io/fs"
	"net/http"
	"strings"

	webassets "github.com/guillaumetavernier/volunteersmanager/web"
)

// spaHandler serves the embedded SPA at root. Paths that don't match a file
// fall back to index.html so client-side routing works on direct navigation.
// In dev (--frontend-proxy set), this handler is replaced by a reverse proxy.
func spaHandler() (http.Handler, error) {
	sub, err := fs.Sub(webassets.Dist, "dist")
	if err != nil {
		return nil, err
	}
	fileServer := http.FileServer(http.FS(sub))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/")
		if p == "" {
			fileServer.ServeHTTP(w, r)
			return
		}
		if _, err := fs.Stat(sub, p); err == nil {
			fileServer.ServeHTTP(w, r)
			return
		}
		// SPA fallback — rewrite to index.html and let the file server serve it.
		r2 := r.Clone(r.Context())
		r2.URL.Path = "/"
		fileServer.ServeHTTP(w, r2)
	}), nil
}
