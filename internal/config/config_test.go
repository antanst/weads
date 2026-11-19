package config

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// unset clears key for the test and restores it afterwards.
func unset(t *testing.T, key string) {
	t.Helper()
	t.Setenv(key, "")
	os.Unsetenv(key)
}

func TestLoad(t *testing.T) {
	unset(t, "WEADS_WORK_DIR")
	unset(t, "WEADS_PROJECTS")
	unset(t, "WEADS_TEST_QUOTED")
	t.Setenv("WEADS_TEST_SET", "from-env")
	env := filepath.Join(t.TempDir(), ".env")
	content := `# weads settings
WEADS_WORK_DIR=~/.work   # scanned at startup

export WEADS_PROJECTS= ~/work/go-drip , ~/work/mo,,
WEADS_TEST_QUOTED="a # not a comment"
WEADS_TEST_SET=from-file
`
	if err := os.WriteFile(env, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	s, err := Load(env)
	if err != nil {
		t.Fatal(err)
	}
	if s.WorkDir != "~/.work" || !slices.Equal(s.Projects, []string{"~/work/go-drip", "~/work/mo"}) {
		t.Errorf("Load = %+v", s)
	}
	if got := os.Getenv("WEADS_TEST_QUOTED"); got != "a # not a comment" {
		t.Errorf("quoted value = %q", got)
	}
	if got := os.Getenv("WEADS_TEST_SET"); got != "from-env" {
		t.Errorf("set variable = %q, want the environment to win", got)
	}
}

func TestLoadMissingFile(t *testing.T) {
	unset(t, "WEADS_WORK_DIR")
	unset(t, "WEADS_PROJECTS")
	s, err := Load(filepath.Join(t.TempDir(), ".env"))
	if err != nil || s.WorkDir != "" || s.Projects != nil {
		t.Errorf("Load(missing) = %+v, %v; want empty settings", s, err)
	}
}

func TestLoadMalformed(t *testing.T) {
	env := filepath.Join(t.TempDir(), ".env")
	if err := os.WriteFile(env, []byte("# ok\nWEADS_WORK_DIR\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(env); err == nil || !strings.Contains(err.Error(), ".env:2") {
		t.Errorf("Load(malformed) error = %v, want one naming line 2", err)
	}
}
