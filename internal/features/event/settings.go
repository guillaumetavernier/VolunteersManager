package event

import "encoding/json"

// SectionKind enumerates the named blocks the roadbook renderer composes.
type SectionKind string

const (
	SectionHeader              SectionKind = "header"
	SectionDay                 SectionKind = "day"
	SectionFooter              SectionKind = "footer"
	SectionSponsor             SectionKind = "sponsor"
	SectionEmergencyContact    SectionKind = "emergency_contact"
	SectionCustomizableMessage SectionKind = "customizable_message"
	SectionGeneralInfo         SectionKind = "general_info"
	SectionVSReference         SectionKind = "vs_reference"
)

// AllSectionKinds is the canonical default order.
var AllSectionKinds = []SectionKind{
	SectionHeader,
	SectionDay,
	SectionGeneralInfo,
	SectionCustomizableMessage,
	SectionEmergencyContact,
	SectionVSReference,
	SectionSponsor,
	SectionFooter,
}

// RoadbookSettings lives under events.settings JSON at the "roadbook" key.
type RoadbookSettings struct {
	PrimaryColor   string                  `json:"primary_color"`
	HeaderText     string                  `json:"header_text"`
	FooterText     string                  `json:"footer_text"`
	SectionOrder   []SectionKind           `json:"section_order"`
	SectionVisible map[SectionKind]bool    `json:"section_visible"`
	MiniMap        bool                    `json:"mini_map"`
}

// DefaultRoadbookSettings returns the v1 defaults: every section visible
// except SectionSponsor (only relevant when a sponsor logo is uploaded),
// mini-map off (the v1 risk mitigation; see M08 risks).
func DefaultRoadbookSettings() RoadbookSettings {
	order := make([]SectionKind, len(AllSectionKinds))
	copy(order, AllSectionKinds)
	vis := map[SectionKind]bool{}
	for _, k := range AllSectionKinds {
		vis[k] = true
	}
	vis[SectionSponsor] = false
	return RoadbookSettings{
		PrimaryColor:   "#2563eb",
		HeaderText:     "",
		FooterText:     "",
		SectionOrder:   order,
		SectionVisible: vis,
		MiniMap:        false,
	}
}

// ReadRoadbookSettings extracts the roadbook subkey from an events.settings
// JSON blob, applying defaults for any field that is missing.
func ReadRoadbookSettings(eventSettings string) RoadbookSettings {
	rb := DefaultRoadbookSettings()
	if eventSettings == "" {
		return rb
	}
	var top map[string]json.RawMessage
	if err := json.Unmarshal([]byte(eventSettings), &top); err != nil {
		return rb
	}
	raw, ok := top["roadbook"]
	if !ok {
		return rb
	}
	var got RoadbookSettings
	if err := json.Unmarshal(raw, &got); err != nil {
		return rb
	}
	if got.PrimaryColor != "" {
		rb.PrimaryColor = got.PrimaryColor
	}
	rb.HeaderText = got.HeaderText
	rb.FooterText = got.FooterText
	if len(got.SectionOrder) > 0 {
		rb.SectionOrder = sanitizeOrder(got.SectionOrder)
	}
	if got.SectionVisible != nil {
		for k, v := range got.SectionVisible {
			rb.SectionVisible[k] = v
		}
	}
	rb.MiniMap = got.MiniMap
	return rb
}

// WriteRoadbookSettings replaces the "roadbook" subkey of an events.settings
// JSON blob with the given settings. Returns the new JSON string.
func WriteRoadbookSettings(eventSettings string, rb RoadbookSettings) (string, error) {
	top := map[string]json.RawMessage{}
	if eventSettings != "" {
		_ = json.Unmarshal([]byte(eventSettings), &top)
	}
	enc, err := json.Marshal(rb)
	if err != nil {
		return "", err
	}
	top["roadbook"] = enc
	out, err := json.Marshal(top)
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func sanitizeOrder(in []SectionKind) []SectionKind {
	seen := map[SectionKind]bool{}
	out := make([]SectionKind, 0, len(AllSectionKinds))
	for _, k := range in {
		if !isKnown(k) || seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, k)
	}
	// Append any defaults not mentioned, in canonical order.
	for _, k := range AllSectionKinds {
		if !seen[k] {
			out = append(out, k)
		}
	}
	return out
}

func isKnown(k SectionKind) bool {
	for _, x := range AllSectionKinds {
		if x == k {
			return true
		}
	}
	return false
}
