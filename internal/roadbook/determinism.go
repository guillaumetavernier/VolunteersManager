package roadbook

import (
	"fmt"
	"strings"
	"time"

	"github.com/johnfercher/maroto/v2/pkg/config"
	"github.com/johnfercher/maroto/v2/pkg/consts/fontfamily"
	"github.com/johnfercher/maroto/v2/pkg/consts/fontstyle"
	"github.com/johnfercher/maroto/v2/pkg/core/entity"
	"github.com/johnfercher/maroto/v2/pkg/props"
	"github.com/phpdave11/gofpdf"
)

func init() {
	// Determinism: sort gofpdf catalog dicts (font map iteration order is
	// otherwise random), and pin both CreationDate and ModDate to a fixed
	// epoch so re-generated PDFs are byte-identical for the same input.
	gofpdf.SetDefaultCatalogSort(true)
	gofpdf.SetDefaultCreationDate(deterministicEpoch)
	gofpdf.SetDefaultModificationDate(deterministicEpoch)
}

// deterministicEpoch is the fixed PDF CreationDate. Using a constant avoids
// time.Now() and keeps re-generated PDFs byte-identical.
var deterministicEpoch = time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)

// buildConfig returns a maroto config with metadata that does not depend on
// time, environment, or random IDs.
func buildConfig() *entity.Config {
	return config.NewBuilder().
		WithCreationDate(deterministicEpoch).
		WithAuthor("VolunteersManager", false).
		WithCreator("VolunteersManager", false).
		WithDefaultFont(&props.Font{Family: fontfamily.Helvetica, Size: 9, Style: fontstyle.Normal, Color: &props.BlackColor}).
		Build()
}

// colorFromHex parses "#rrggbb" (case insensitive) to a maroto props.Color.
// Falls back to a tasteful blue on parse error.
func colorFromHex(hex string) *props.Color {
	h := strings.TrimPrefix(strings.TrimSpace(hex), "#")
	if len(h) != 6 {
		return &props.Color{Red: 37, Green: 99, Blue: 235}
	}
	var r, g, b int
	if _, err := fmt.Sscanf(h, "%02x%02x%02x", &r, &g, &b); err != nil {
		return &props.Color{Red: 37, Green: 99, Blue: 235}
	}
	return &props.Color{Red: r, Green: g, Blue: b}
}

