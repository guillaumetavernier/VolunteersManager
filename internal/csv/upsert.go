package csv

import (
	"strings"

	"github.com/guillaumetavernier/volunteersmanager/internal/features/volunteer"
)

// Classification is the per-row outcome of matching incoming CSV rows against
// the existing roster.
type Classification string

const (
	ClassNew       Classification = "new"
	ClassUpdate    Classification = "update"
	ClassAmbiguous Classification = "ambiguous"
	ClassError     Classification = "error"
	ClassSkip      Classification = "skip"
)

// RowDecision pairs a validated row with a classification + resolution.
type RowDecision struct {
	Row        ValidatedRow   `json:"row"`
	Class      Classification `json:"class"`
	Candidates []int64        `json:"candidates,omitempty"`
	// TargetID is set when the row will be applied as an update (either because
	// classification was unambiguous, or because the user resolved an
	// ambiguity).
	TargetID *int64 `json:"target_id,omitempty"`
}

// UpsertKey is either "name" (first_name+last_name, case-insensitive) or
// "email" (case-insensitive, trimmed).
type UpsertKey string

const (
	UpsertByName  UpsertKey = "name"
	UpsertByEmail UpsertKey = "email"
)

// Classify produces a decision per validated row using the upsert key.
// Existing volunteers are matched case-insensitively. Rows with validation
// errors get ClassError. Two-or-more matches → ClassAmbiguous.
func Classify(rows []ValidatedRow, existing []volunteer.Volunteer, key UpsertKey) []RowDecision {
	byKey := map[string][]int64{}
	for _, e := range existing {
		k := volunteerKey(e, key)
		if k == "" {
			continue
		}
		byKey[k] = append(byKey[k], e.ID)
	}

	out := make([]RowDecision, 0, len(rows))
	for _, r := range rows {
		dec := RowDecision{Row: r}
		if len(r.Errors) > 0 {
			dec.Class = ClassError
			out = append(out, dec)
			continue
		}
		k := rowKey(r.Input, key)
		ids := byKey[k]
		switch {
		case k == "":
			dec.Class = ClassNew
		case len(ids) == 0:
			dec.Class = ClassNew
		case len(ids) == 1:
			dec.Class = ClassUpdate
			id := ids[0]
			dec.TargetID = &id
		default:
			dec.Class = ClassAmbiguous
			dec.Candidates = append([]int64(nil), ids...)
		}
		out = append(out, dec)
	}
	return out
}

func volunteerKey(v volunteer.Volunteer, key UpsertKey) string {
	switch key {
	case UpsertByEmail:
		if v.Email == nil {
			return ""
		}
		return strings.ToLower(strings.TrimSpace(*v.Email))
	default:
		return strings.ToLower(strings.TrimSpace(v.FirstName)) + "\x00" + strings.ToLower(strings.TrimSpace(v.LastName))
	}
}

func rowKey(in volunteer.Input, key UpsertKey) string {
	switch key {
	case UpsertByEmail:
		if in.Email == nil {
			return ""
		}
		return strings.ToLower(strings.TrimSpace(*in.Email))
	default:
		return strings.ToLower(strings.TrimSpace(in.FirstName)) + "\x00" + strings.ToLower(strings.TrimSpace(in.LastName))
	}
}

// Counts groups decisions by class.
type Counts struct {
	New       int `json:"new"`
	Update    int `json:"update"`
	Ambiguous int `json:"ambiguous"`
	Error     int `json:"error"`
	Skip      int `json:"skip"`
}

func Tally(decisions []RowDecision) Counts {
	var c Counts
	for _, d := range decisions {
		switch d.Class {
		case ClassNew:
			c.New++
		case ClassUpdate:
			c.Update++
		case ClassAmbiguous:
			c.Ambiguous++
		case ClassError:
			c.Error++
		case ClassSkip:
			c.Skip++
		}
	}
	return c
}
