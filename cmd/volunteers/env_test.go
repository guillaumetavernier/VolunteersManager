package main

import "testing"

func TestEnvDefault(t *testing.T) {
	t.Run("returns fallback when env var unset", func(t *testing.T) {
		t.Setenv("VM_TEST_UNSET", "")
		if got := envDefault("VM_TEST_UNSET", "fallback"); got != "fallback" {
			t.Fatalf("got %q, want fallback", got)
		}
	})

	t.Run("returns env value when set", func(t *testing.T) {
		t.Setenv("VM_TEST_SET", "from-env")
		if got := envDefault("VM_TEST_SET", "fallback"); got != "from-env" {
			t.Fatalf("got %q, want from-env", got)
		}
	})

	t.Run("empty env counts as unset", func(t *testing.T) {
		t.Setenv("VM_TEST_EMPTY", "")
		if got := envDefault("VM_TEST_EMPTY", "fallback"); got != "fallback" {
			t.Fatalf("got %q, want fallback (empty env should be treated as unset)", got)
		}
	})
}
