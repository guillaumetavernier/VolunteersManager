package event

import "testing"

func TestRoadbookSettings_RoundTrip(t *testing.T) {
	src := DefaultRoadbookSettings()
	src.PrimaryColor = "#abcdef"
	src.HeaderText = "Bonjour"
	src.SectionVisible[SectionSponsor] = true
	src.SectionOrder = []SectionKind{SectionDay, SectionHeader, SectionFooter}

	blob, err := WriteRoadbookSettings(`{"region":"fr"}`, src)
	if err != nil {
		t.Fatalf("write: %v", err)
	}
	got := ReadRoadbookSettings(blob)
	if got.PrimaryColor != src.PrimaryColor {
		t.Fatalf("color: got %q want %q", got.PrimaryColor, src.PrimaryColor)
	}
	if got.HeaderText != "Bonjour" {
		t.Fatalf("header: got %q", got.HeaderText)
	}
	if !got.SectionVisible[SectionSponsor] {
		t.Fatal("sponsor visibility lost")
	}
	// Order should include the explicit three first, then the rest in canonical order.
	if got.SectionOrder[0] != SectionDay || got.SectionOrder[1] != SectionHeader || got.SectionOrder[2] != SectionFooter {
		t.Fatalf("order head wrong: %+v", got.SectionOrder)
	}
	if len(got.SectionOrder) != len(AllSectionKinds) {
		t.Fatalf("order len = %d, want %d", len(got.SectionOrder), len(AllSectionKinds))
	}
}

func TestRoadbookSettings_DefaultsOnMissingBlob(t *testing.T) {
	got := ReadRoadbookSettings("")
	if got.PrimaryColor == "" {
		t.Fatal("expected default primary color")
	}
	if len(got.SectionOrder) == 0 {
		t.Fatal("expected default section order")
	}
}
