package archive

import (
	"bytes"
	"database/sql"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// CanonicalDump produces a deterministic SQL dump of every user table (i.e.
// excluding sqlite internal tables and schema_migrations). Tables and columns
// are sorted; rows are ordered by the table's first column (`id` for every
// user table in this schema). The output is intended to be diff-friendly,
// hashed for the round-trip test, and replayed verbatim by Import.
func CanonicalDump(db *sql.DB) ([]byte, error) {
	tables, err := listTables(db)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	for _, t := range tables {
		if err := dumpTable(db, t, &buf); err != nil {
			return nil, fmt.Errorf("archive: dump %s: %w", t, err)
		}
	}
	return buf.Bytes(), nil
}

func listTables(db *sql.DB) ([]string, error) {
	rows, err := db.Query(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations' ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

type column struct {
	cid  int
	name string
}

func tableColumns(db *sql.DB, table string) ([]column, error) {
	rows, err := db.Query(fmt.Sprintf(`PRAGMA table_info(%s)`, quoteIdent(table)))
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var cols []column
	for rows.Next() {
		var cid int
		var name, typ string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &typ, &notnull, &dflt, &pk); err != nil {
			return nil, err
		}
		cols = append(cols, column{cid: cid, name: name})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Slice(cols, func(i, j int) bool { return cols[i].cid < cols[j].cid })
	return cols, nil
}

func dumpTable(db *sql.DB, table string, out *bytes.Buffer) error {
	cols, err := tableColumns(db, table)
	if err != nil {
		return err
	}
	if len(cols) == 0 {
		return nil
	}
	colNames := make([]string, len(cols))
	for i, c := range cols {
		colNames[i] = c.name
	}
	orderCol := colNames[0]
	q := fmt.Sprintf(
		`SELECT %s FROM %s ORDER BY %s ASC`,
		joinIdents(colNames),
		quoteIdent(table),
		quoteIdent(orderCol),
	)
	rows, err := db.Query(q)
	if err != nil {
		return err
	}
	defer func() { _ = rows.Close() }()
	insertPrefix := fmt.Sprintf("INSERT INTO %s (%s) VALUES (", quoteIdent(table), joinIdents(colNames))
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return err
		}
		out.WriteString(insertPrefix)
		for i, v := range vals {
			if i > 0 {
				out.WriteString(", ")
			}
			out.WriteString(formatLiteral(v))
		}
		out.WriteString(");\n")
	}
	return rows.Err()
}

func formatLiteral(v any) string {
	if v == nil {
		return "NULL"
	}
	switch x := v.(type) {
	case int64:
		return strconv.FormatInt(x, 10)
	case float64:
		return strconv.FormatFloat(x, 'g', -1, 64)
	case bool:
		if x {
			return "1"
		}
		return "0"
	case []byte:
		return quoteString(string(x))
	case string:
		return quoteString(x)
	default:
		return quoteString(fmt.Sprintf("%v", x))
	}
}

func quoteString(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}

func quoteIdent(s string) string {
	return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
}

func joinIdents(names []string) string {
	out := make([]string, len(names))
	for i, n := range names {
		out[i] = quoteIdent(n)
	}
	return strings.Join(out, ", ")
}
