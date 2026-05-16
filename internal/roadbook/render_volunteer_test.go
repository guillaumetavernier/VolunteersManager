package roadbook

import (
	"bytes"
	"sync"
	"testing"

	"github.com/guillaumetavernier/volunteersmanager/internal/features/event"
)

func TestRenderVolunteer_DeterministicBytes(t *testing.T) {
	state := fixtureState()
	settings := event.DefaultRoadbookSettings()
	data, err := BuildVolunteerData(state, 1)
	if err != nil {
		t.Fatalf("gather: %v", err)
	}

	var first bytes.Buffer
	if err := RenderVolunteer(data, settings, "", &first); err != nil {
		t.Fatalf("render 1: %v", err)
	}
	if first.Len() == 0 {
		t.Fatal("empty pdf")
	}
	for i := 0; i < 4; i++ {
		var again bytes.Buffer
		if err := RenderVolunteer(data, settings, "", &again); err != nil {
			t.Fatalf("render %d: %v", i, err)
		}
		if !bytes.Equal(first.Bytes(), again.Bytes()) {
			t.Fatalf("render run %d differs (len %d vs %d)", i, first.Len(), again.Len())
		}
	}
}

func TestRenderVolunteer_ConcurrentBytesIdentical(t *testing.T) {
	state := fixtureState()
	settings := event.DefaultRoadbookSettings()
	data, err := BuildVolunteerData(state, 1)
	if err != nil {
		t.Fatalf("gather: %v", err)
	}
	var reference []byte
	{
		var buf bytes.Buffer
		if err := RenderVolunteer(data, settings, "", &buf); err != nil {
			t.Fatalf("baseline: %v", err)
		}
		reference = buf.Bytes()
	}
	const n = 10
	results := make([][]byte, n)
	var wg sync.WaitGroup
	wg.Add(n)
	for i := 0; i < n; i++ {
		i := i
		go func() {
			defer wg.Done()
			var buf bytes.Buffer
			if err := RenderVolunteer(data, settings, "", &buf); err != nil {
				t.Errorf("render %d: %v", i, err)
				return
			}
			results[i] = buf.Bytes()
		}()
	}
	wg.Wait()
	for i, r := range results {
		if !bytes.Equal(r, reference) {
			t.Fatalf("concurrent render %d diverged (%d vs %d bytes)", i, len(r), len(reference))
		}
	}
}

func TestRenderVolunteer_PrimaryColorChangesOutput(t *testing.T) {
	state := fixtureState()
	data, err := BuildVolunteerData(state, 1)
	if err != nil {
		t.Fatalf("gather: %v", err)
	}
	settingsA := event.DefaultRoadbookSettings()
	settingsA.PrimaryColor = "#ff0000"
	settingsB := event.DefaultRoadbookSettings()
	settingsB.PrimaryColor = "#0000ff"
	var a, b bytes.Buffer
	if err := RenderVolunteer(data, settingsA, "", &a); err != nil {
		t.Fatalf("a: %v", err)
	}
	if err := RenderVolunteer(data, settingsB, "", &b); err != nil {
		t.Fatalf("b: %v", err)
	}
	if bytes.Equal(a.Bytes(), b.Bytes()) {
		t.Fatal("expected different bytes for different primary color")
	}
}

func TestRenderVolunteer_SponsorToggleStripsBytes(t *testing.T) {
	state := fixtureState()
	data, err := BuildVolunteerData(state, 1)
	if err != nil {
		t.Fatalf("gather: %v", err)
	}
	on := event.DefaultRoadbookSettings()
	on.SectionVisible[event.SectionGeneralInfo] = true
	off := event.DefaultRoadbookSettings()
	off.SectionVisible[event.SectionGeneralInfo] = false
	// Make sure data exposes the toggled section.
	data.GeneralInfo = "Information générale pour tester l'effet du toggle."
	var aBuf, bBuf bytes.Buffer
	if err := RenderVolunteer(data, on, "", &aBuf); err != nil {
		t.Fatalf("on: %v", err)
	}
	if err := RenderVolunteer(data, off, "", &bBuf); err != nil {
		t.Fatalf("off: %v", err)
	}
	if bytes.Equal(aBuf.Bytes(), bBuf.Bytes()) {
		t.Fatal("toggling a section should change the bytes")
	}
}

func TestRenderMaster_DeterministicBytes(t *testing.T) {
	state := fixtureState()
	settings := event.DefaultRoadbookSettings()
	var first bytes.Buffer
	if err := RenderMaster(state, settings, "", &first); err != nil {
		t.Fatalf("master 1: %v", err)
	}
	var second bytes.Buffer
	if err := RenderMaster(state, settings, "", &second); err != nil {
		t.Fatalf("master 2: %v", err)
	}
	if !bytes.Equal(first.Bytes(), second.Bytes()) {
		t.Fatal("master pdf bytes diverged")
	}
}
