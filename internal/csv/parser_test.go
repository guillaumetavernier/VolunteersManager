package csv

import (
	"strings"
	"testing"
)

func TestParse_BOMAndSemicolon(t *testing.T) {
	body := string([]byte{0xEF, 0xBB, 0xBF}) + "Prénom;Nom;Téléphone\nMarie;Dupont;+33611111111\n"
	p, err := Parse(strings.NewReader(body))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if p.Delimiter != ';' {
		t.Fatalf("delim = %q, want ';'", p.Delimiter)
	}
	if len(p.Headers) != 3 || p.Headers[0] != "Prénom" {
		t.Fatalf("headers = %v", p.Headers)
	}
	if len(p.Rows) != 1 || p.Rows[0][1] != "Dupont" {
		t.Fatalf("rows = %v", p.Rows)
	}
}

func TestParse_CommaDelimiter(t *testing.T) {
	body := "first_name,last_name,phone\nA,B,+33611111111\nC,D,+33611111112\n"
	p, err := Parse(strings.NewReader(body))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if p.Delimiter != ',' {
		t.Fatalf("delim = %q, want ','", p.Delimiter)
	}
	if len(p.Rows) != 2 {
		t.Fatalf("rows = %v", p.Rows)
	}
}

func TestParse_RejectsInvalidUTF8(t *testing.T) {
	body := []byte{0xff, 0xfe, 0x00, 'a'}
	if _, err := Parse(strings.NewReader(string(body))); err == nil {
		t.Fatalf("expected error on invalid utf-8")
	}
}

func TestDetectDelimiter_TieGoesToComma(t *testing.T) {
	got := detectDelimiter([]byte("a,b;c\n"))
	if got != ',' {
		t.Fatalf("got %q, want ','", got)
	}
}
