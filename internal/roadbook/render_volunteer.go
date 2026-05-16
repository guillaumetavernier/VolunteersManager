package roadbook

import (
	"fmt"
	"io"
	"os"

	"github.com/johnfercher/maroto/v2"
	"github.com/johnfercher/maroto/v2/pkg/components/col"
	"github.com/johnfercher/maroto/v2/pkg/components/image"
	"github.com/johnfercher/maroto/v2/pkg/components/line"
	"github.com/johnfercher/maroto/v2/pkg/components/row"
	"github.com/johnfercher/maroto/v2/pkg/components/text"
	"github.com/johnfercher/maroto/v2/pkg/consts/align"
	"github.com/johnfercher/maroto/v2/pkg/consts/extension"
	"github.com/johnfercher/maroto/v2/pkg/consts/fontstyle"
	"github.com/johnfercher/maroto/v2/pkg/core"
	"github.com/johnfercher/maroto/v2/pkg/props"

	"github.com/guillaumetavernier/volunteersmanager/internal/features/event"
)

// RenderVolunteer assembles a single volunteer's PDF and writes it to out.
// Pure function on (data, settings, assetDir); no time.Now / no globals.
func RenderVolunteer(data VolunteerRoadbook, settings event.RoadbookSettings, assetDir string, out io.Writer) error {
	m := maroto.New(buildConfig())
	addVolunteerSections(m, data, settings, assetDir)
	doc, err := m.Generate()
	if err != nil {
		return err
	}
	if _, err := out.Write(doc.GetBytes()); err != nil {
		return err
	}
	return nil
}

func addVolunteerSections(m core.Maroto, data VolunteerRoadbook, settings event.RoadbookSettings, assetDir string) {
	order := settings.SectionOrder
	if len(order) == 0 {
		order = event.AllSectionKinds
	}
	for _, k := range order {
		if vis, ok := settings.SectionVisible[k]; ok && !vis {
			continue
		}
		switch k {
		case event.SectionHeader:
			sectionHeader(m, data, settings, assetDir)
		case event.SectionDay:
			sectionDays(m, data, settings)
		case event.SectionGeneralInfo:
			if data.GeneralInfo != "" {
				sectionLabel(m, "Informations générales", settings)
				m.AddAutoRow(text.NewCol(12, data.GeneralInfo, props.Text{Size: 9}))
			}
		case event.SectionCustomizableMessage:
			if data.CustomizableMessage != "" {
				sectionLabel(m, "Message", settings)
				m.AddAutoRow(text.NewCol(12, data.CustomizableMessage, props.Text{Size: 9}))
			}
		case event.SectionEmergencyContact:
			if data.EmergencyContact != "" {
				sectionLabel(m, "Contact d'urgence", settings)
				m.AddAutoRow(text.NewCol(12, data.EmergencyContact, props.Text{Size: 9}))
			}
		case event.SectionVSReference:
			sectionVSReference(m, data, settings)
		case event.SectionSponsor:
			sectionSponsor(m, data, assetDir)
		case event.SectionFooter:
			sectionFooter(m, data, settings)
		}
	}
}

func sectionHeader(m core.Maroto, data VolunteerRoadbook, settings event.RoadbookSettings, assetDir string) {
	primary := colorFromHex(settings.PrimaryColor)
	cols := []core.Col{}
	if data.LogoPath != "" {
		if buf, ext, ok := readImage(assetDir, data.LogoPath); ok {
			cols = append(cols, image.NewFromBytesCol(2, buf, ext))
		}
	}
	if len(cols) == 0 {
		cols = append(cols, col.New(2))
	}
	cols = append(cols, text.NewCol(10, data.EventName, props.Text{Size: 16, Style: fontstyle.Bold, Align: align.Left, Color: primary, Top: 4}))
	m.AddRow(16, cols...)
	if data.CoordinatorName != "" || data.CoordinatorPhone != "" {
		m.AddAutoRow(text.NewCol(12,
			fmt.Sprintf("Coordination : %s · %s", data.CoordinatorName, data.CoordinatorPhone),
			props.Text{Size: 8}))
	}
	if settings.HeaderText != "" {
		m.AddAutoRow(text.NewCol(12, settings.HeaderText, props.Text{Size: 9}))
	}
	m.AddAutoRow(text.NewCol(12,
		fmt.Sprintf("Bénévole : %s %s · %s", data.FirstName, data.LastName, data.Phone),
		props.Text{Size: 10, Style: fontstyle.Bold}))
	if data.DefaultVSName != "" {
		m.AddAutoRow(text.NewCol(12, "Point de référence : "+data.DefaultVSName, props.Text{Size: 9}))
	}
	m.AddRow(2, col.New(12).Add(line.New(props.Line{Color: primary, Thickness: 0.4})))
}

func sectionDays(m core.Maroto, data VolunteerRoadbook, settings event.RoadbookSettings) {
	primary := colorFromHex(settings.PrimaryColor)
	for _, day := range data.Days {
		m.AddRow(6, text.NewCol(12,
			fmt.Sprintf("Jour %d", day.Day+1),
			props.Text{Size: 12, Style: fontstyle.Bold, Color: primary, Top: 1}))
		for _, entry := range day.Timeline {
			switch entry.Kind {
			case KindMission:
				renderMission(m, *entry.Mission, primary)
			case KindTrip:
				renderTrip(m, *entry.Trip, primary)
			case KindIdle:
				renderIdle(m, *entry.Idle)
			}
		}
		// Mini-map block — v1 always skipped via the stub.
		if settings.MiniMap {
			if _, err := RenderMiniMap(day.Day, nil, data.References); err != nil {
				// Stub returns ErrMiniMapNotImplemented — skip silently.
				_ = err
			}
		}
	}
}

func renderMission(m core.Maroto, mb MissionBlock, primary *props.Color) {
	title := mb.Title
	if title == "" {
		title = mb.RoleType
	}
	m.AddAutoRow(
		text.NewCol(3, fmt.Sprintf("%s – %s", mb.StartTime, mb.EndTime), props.Text{Size: 9, Style: fontstyle.Bold, Color: primary}),
		text.NewCol(9, fmt.Sprintf("%s · %s", title, mb.VSName), props.Text{Size: 9}),
	)
	if len(mb.CoStaff) > 0 {
		m.AddAutoRow(text.NewCol(12, "Avec : "+joinCoStaff(mb.CoStaff), props.Text{Size: 8}))
	}
}

func renderTrip(m core.Maroto, tb TripBlock, primary *props.Color) {
	role := "Passager"
	if tb.IsDriver {
		role = "Trajet (conducteur)"
	}
	m.AddAutoRow(text.NewCol(12, role, props.Text{Size: 9, Style: fontstyle.Bold, Color: primary}))
	for _, st := range tb.Stops {
		m.AddAutoRow(
			text.NewCol(3, st.Time, props.Text{Size: 9}),
			text.NewCol(9, st.VSName, props.Text{Size: 9}),
		)
	}
	if len(tb.CoPassengers) > 0 {
		m.AddAutoRow(text.NewCol(12, "Co-passagers : "+joinCoPassengers(tb.CoPassengers), props.Text{Size: 8}))
	}
}

func renderIdle(m core.Maroto, ib IdleBlock) {
	m.AddAutoRow(text.NewCol(12,
		fmt.Sprintf("%s – %s · Pause", ib.FromTime, ib.ToTime),
		props.Text{Size: 8, Style: fontstyle.Italic}))
}

func sectionLabel(m core.Maroto, label string, settings event.RoadbookSettings) {
	primary := colorFromHex(settings.PrimaryColor)
	m.AddRow(5, text.NewCol(12, label, props.Text{Size: 10, Style: fontstyle.Bold, Color: primary, Top: 1}))
}

func sectionVSReference(m core.Maroto, data VolunteerRoadbook, settings event.RoadbookSettings) {
	if len(data.References) == 0 {
		return
	}
	sectionLabel(m, "Points VS", settings)
	m.AddAutoRow(
		text.NewCol(5, "Nom", props.Text{Size: 8, Style: fontstyle.Bold}),
		text.NewCol(3, "Latitude", props.Text{Size: 8, Style: fontstyle.Bold}),
		text.NewCol(3, "Longitude", props.Text{Size: 8, Style: fontstyle.Bold}),
		text.NewCol(1, "W3W", props.Text{Size: 8, Style: fontstyle.Bold}),
	)
	for _, ref := range data.References {
		m.AddAutoRow(
			text.NewCol(5, ref.Name, props.Text{Size: 8}),
			text.NewCol(3, fmt.Sprintf("%.5f", ref.Lat), props.Text{Size: 8}),
			text.NewCol(3, fmt.Sprintf("%.5f", ref.Lon), props.Text{Size: 8}),
			text.NewCol(1, ref.What3Words, props.Text{Size: 8}),
		)
	}
}

func sectionSponsor(m core.Maroto, data VolunteerRoadbook, assetDir string) {
	if data.SponsorPath == "" {
		return
	}
	if buf, ext, ok := readImage(assetDir, data.SponsorPath); ok {
		m.AddRow(20, image.NewFromBytesCol(12, buf, ext, props.Rect{Center: true, Percent: 80}))
	}
}

func sectionFooter(m core.Maroto, data VolunteerRoadbook, settings event.RoadbookSettings) {
	primary := colorFromHex(settings.PrimaryColor)
	m.AddRow(2, col.New(12).Add(line.New(props.Line{Color: primary, Thickness: 0.3})))
	if settings.FooterText != "" {
		m.AddAutoRow(text.NewCol(12, settings.FooterText, props.Text{Size: 8, Align: align.Center}))
	}
	m.AddAutoRow(text.NewCol(12,
		fmt.Sprintf("%s · %s – %s", data.EventName, data.EventStartDate, data.EventEndDate),
		props.Text{Size: 7, Align: align.Center, Color: &props.Color{Red: 100, Green: 116, Blue: 139}}))
}

func joinCoStaff(xs []CoStaff) string {
	out := ""
	for i, c := range xs {
		if i > 0 {
			out += ", "
		}
		if c.Phone != "" {
			out += fmt.Sprintf("%s (%s)", c.Name, c.Phone)
		} else {
			out += c.Name
		}
	}
	return out
}

func joinCoPassengers(xs []CoPassenger) string {
	out := ""
	for i, c := range xs {
		if i > 0 {
			out += ", "
		}
		if c.Phone != "" {
			out += fmt.Sprintf("%s [%s] (%s)", c.Name, c.Role, c.Phone)
		} else {
			out += fmt.Sprintf("%s [%s]", c.Name, c.Role)
		}
	}
	return out
}

func readImage(assetDir, relPath string) ([]byte, extension.Type, bool) {
	if relPath == "" {
		return nil, "", false
	}
	candidates := []string{relPath}
	if assetDir != "" {
		// relPath conventionally starts with "assets/..."; the upload writes
		// files under assetDir/logo/...; assetDir already names "assets", so
		// strip the "assets/" prefix when reading from disk.
		if len(relPath) > 7 && relPath[:7] == "assets/" {
			candidates = append(candidates, assetDir+"/"+relPath[7:])
		}
		candidates = append(candidates, assetDir+"/"+relPath)
	}
	for _, p := range candidates {
		buf, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		switch {
		case len(buf) > 3 && buf[0] == 0x89 && buf[1] == 0x50:
			return buf, extension.Png, true
		case len(buf) > 3 && buf[0] == 0xFF && buf[1] == 0xD8:
			return buf, extension.Jpg, true
		}
	}
	return nil, "", false
}

// helper used by the row.New API in tests where rowless content is fine.
var _ = row.New
