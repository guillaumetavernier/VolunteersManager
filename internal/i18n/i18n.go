// Package i18n is a minimal translation lookup. v1 ships FR-only; the API
// exists so EN can be a later mechanical pass.
package i18n

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"
)

//go:embed fr.json
var frBytes []byte

type Catalog struct {
	entries map[string]string
}

func Load() (*Catalog, error) {
	m := map[string]string{}
	if len(frBytes) > 0 {
		if err := json.Unmarshal(frBytes, &m); err != nil {
			return nil, fmt.Errorf("i18n: parse fr.json: %w", err)
		}
	}
	return &Catalog{entries: m}, nil
}

// T looks up key; missing keys fall back to the key itself. Args replace
// placeholders of the form {name} by their string value.
func (c *Catalog) T(key string, args ...any) string {
	val, ok := c.entries[key]
	if !ok {
		val = key
	}
	if len(args) == 0 {
		return val
	}
	return interpolate(val, args)
}

func interpolate(s string, args []any) string {
	if len(args)%2 != 0 {
		return s
	}
	for i := 0; i < len(args); i += 2 {
		name, ok := args[i].(string)
		if !ok {
			continue
		}
		s = strings.ReplaceAll(s, "{"+name+"}", fmt.Sprint(args[i+1]))
	}
	return s
}
