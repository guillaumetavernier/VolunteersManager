package csv

import (
	"encoding/csv"
	"io"
	"strings"

	"github.com/guillaumetavernier/volunteersmanager/internal/features/volunteer"
)

// WriteExport streams non-archived volunteers as a Google-Sheets friendly CSV
// (semicolon delimiter, UTF-8 BOM, canonical headers).
func WriteExport(w io.Writer, vols []volunteer.Volunteer) error {
	if _, err := w.Write(utf8BOM); err != nil {
		return err
	}
	cw := csv.NewWriter(w)
	cw.Comma = ';'
	if err := cw.Write(CanonicalHeaders()); err != nil {
		return err
	}
	for _, v := range vols {
		if err := cw.Write(rowFor(v)); err != nil {
			return err
		}
	}
	cw.Flush()
	return cw.Error()
}

// WriteTemplate writes the canonical headers plus a single example row.
func WriteTemplate(w io.Writer) error {
	if _, err := w.Write(utf8BOM); err != nil {
		return err
	}
	cw := csv.NewWriter(w)
	cw.Comma = ';'
	if err := cw.Write(CanonicalHeaders()); err != nil {
		return err
	}
	example := []string{
		"Marie",
		"Dupont",
		"+33612345678",
		"marie@example.org",
		"Jean Dupont",
		"+33687654321",
		"Bénévole depuis 2022",
		"Merci !",
		"Ravitaillement;Accueil",
		"oui",
		"B",
		"",
	}
	if err := cw.Write(example); err != nil {
		return err
	}
	cw.Flush()
	return cw.Error()
}

func rowFor(v volunteer.Volunteer) []string {
	canDrive := "non"
	if v.CanDrive {
		canDrive = "oui"
	}
	return []string{
		v.FirstName,
		v.LastName,
		v.Phone,
		ptr(v.Email),
		ptr(v.EmergencyContactName),
		ptr(v.EmergencyContactPhone),
		ptr(v.GeneralInfo),
		ptr(v.CustomizableMessage),
		strings.Join(v.RoleTypes, ";"),
		canDrive,
		ptr(v.LicenseType),
		ptr(v.Notes),
	}
}

func ptr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

