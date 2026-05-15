package i18n

import "testing"

func TestT_MissingKeyReturnsKey(t *testing.T) {
	c, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	got := c.T("missing.key")
	if got != "missing.key" {
		t.Fatalf("want fallback to key, got %q", got)
	}
}

func TestT_WithEntryAndArgs(t *testing.T) {
	c := &Catalog{entries: map[string]string{
		"greet": "Bonjour {name}",
	}}
	got := c.T("greet", "name", "Alice")
	if got != "Bonjour Alice" {
		t.Fatalf("interpolation failed, got %q", got)
	}
}

func TestT_OddArgsAreIgnored(t *testing.T) {
	c := &Catalog{entries: map[string]string{"x": "y {a}"}}
	got := c.T("x", "a")
	if got != "y {a}" {
		t.Fatalf("expected raw value on malformed args, got %q", got)
	}
}
