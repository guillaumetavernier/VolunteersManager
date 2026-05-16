package constraints

import (
	"crypto/sha256"
	"encoding/hex"
	"sort"
	"strconv"
	"strings"
)

// stableID returns a 16-hex deterministic ID for a warning of `kind` covering
// the given entity refs. Entities are sorted by (type, id) so reorderings do
// not change the ID.
func stableID(kind WarningKind, ents []EntityRef) string {
	sorted := make([]EntityRef, len(ents))
	copy(sorted, ents)
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].Type != sorted[j].Type {
			return sorted[i].Type < sorted[j].Type
		}
		return sorted[i].ID < sorted[j].ID
	})
	parts := make([]string, 0, len(sorted))
	for _, e := range sorted {
		parts = append(parts, string(e.Type)+"#"+strconv.FormatInt(e.ID, 10))
	}
	sum := sha256.Sum256([]byte(string(kind) + ":" + strings.Join(parts, ",")))
	return hex.EncodeToString(sum[:])[:16]
}
