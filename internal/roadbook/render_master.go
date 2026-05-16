package roadbook

import (
	"fmt"
	"io"

	"github.com/johnfercher/maroto/v2"
	"github.com/johnfercher/maroto/v2/pkg/components/text"
	"github.com/johnfercher/maroto/v2/pkg/consts/fontstyle"
	"github.com/johnfercher/maroto/v2/pkg/props"

	"github.com/guillaumetavernier/volunteersmanager/internal/features/event"
)

// RenderMaster loops every active volunteer through the per-volunteer
// renderer pattern and appends a coordinator grid sheet at the end.
// Output is deterministic for fixed input.
func RenderMaster(state EventState, settings event.RoadbookSettings, assetDir string, out io.Writer) error {
	m := maroto.New(buildConfig())
	primary := colorFromHex(settings.PrimaryColor)
	m.AddRow(10, text.NewCol(12, fmt.Sprintf("Roadbook — %s", state.EventName),
		props.Text{Size: 16, Style: fontstyle.Bold, Color: primary, Top: 2}))
	m.AddRow(5, text.NewCol(12, fmt.Sprintf("%s – %s", state.StartDate, state.EndDate),
		props.Text{Size: 9}))
	for _, id := range state.VolunteerIDs {
		data, err := BuildVolunteerData(state, id)
		if err != nil {
			continue
		}
		m.AddRow(8, text.NewCol(12,
			fmt.Sprintf("%s %s", data.FirstName, data.LastName),
			props.Text{Size: 13, Style: fontstyle.Bold, Color: primary, Top: 2}))
		addVolunteerSections(m, data, settings, assetDir)
	}
	addGridSheet(m, state, primary)
	doc, err := m.Generate()
	if err != nil {
		return err
	}
	_, err = out.Write(doc.GetBytes())
	return err
}
