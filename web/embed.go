// Package webassets exposes the compiled Vite output as an embed.FS. The dist
// directory is populated by `pnpm --filter web build` before `go build`.
package webassets

import "embed"

//go:embed all:dist
var Dist embed.FS
