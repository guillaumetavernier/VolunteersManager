package csv

import (
	"bytes"
	"encoding/csv"
	"errors"
	"io"
	"strings"
	"unicode/utf8"
)

// utf8BOM is stripped from the head of the file when present.
var utf8BOM = []byte{0xEF, 0xBB, 0xBF}

// Parsed holds the headers and data rows of a CSV file.
type Parsed struct {
	Delimiter rune
	Headers   []string
	Rows      [][]string
}

// Parse autodetects BOM + delimiter (comma vs semicolon), then reads the file
// fully. The reader is consumed.
func Parse(r io.Reader) (*Parsed, error) {
	buf, err := io.ReadAll(r)
	if err != nil {
		return nil, err
	}
	buf = bytes.TrimPrefix(buf, utf8BOM)
	if !utf8.Valid(buf) {
		return nil, errors.New("csv: invalid utf-8 input")
	}
	delim := detectDelimiter(buf)
	cr := csv.NewReader(bytes.NewReader(buf))
	cr.Comma = delim
	cr.FieldsPerRecord = -1
	cr.LazyQuotes = true
	records, err := cr.ReadAll()
	if err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return &Parsed{Delimiter: delim, Headers: nil, Rows: nil}, nil
	}
	headers := records[0]
	for i, h := range headers {
		headers[i] = strings.TrimSpace(h)
	}
	rows := records[1:]
	for i := range rows {
		for j := range rows[i] {
			rows[i][j] = strings.TrimSpace(rows[i][j])
		}
	}
	return &Parsed{Delimiter: delim, Headers: headers, Rows: rows}, nil
}

// detectDelimiter counts comma vs semicolon occurrences in the first 10 lines.
// Tabs are rare in Google Sheets exports so we deliberately ignore them.
func detectDelimiter(buf []byte) rune {
	lines := bytes.SplitN(buf, []byte("\n"), 11)
	if len(lines) > 10 {
		lines = lines[:10]
	}
	var commas, semis int
	for _, line := range lines {
		commas += bytes.Count(line, []byte(","))
		semis += bytes.Count(line, []byte(";"))
	}
	if semis > commas {
		return ';'
	}
	return ','
}
