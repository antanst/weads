// Package config reads the weads startup settings from the environment,
// which an optional .env file can fill in.
package config

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"strings"
)

// Settings name the folders weads adds as projects at startup.
type Settings struct {
	WorkDir  string   // WEADS_WORK_DIR: its top-level folders that use beads are added
	Projects []string // WEADS_PROJECTS: comma-separated folders, each added as a project
}

// Load sets each variable from the .env file at path that the environment
// does not already set, then reads the settings. A missing file is fine.
func Load(path string) (Settings, error) {
	if err := loadDotEnv(path); err != nil {
		return Settings{}, err
	}
	s := Settings{WorkDir: strings.TrimSpace(os.Getenv("WEADS_WORK_DIR"))}
	for p := range strings.SplitSeq(os.Getenv("WEADS_PROJECTS"), ",") {
		if p = strings.TrimSpace(p); p != "" {
			s.Projects = append(s.Projects, p)
		}
	}
	return s, nil
}

// loadDotEnv applies KEY=value lines, skipping blanks and # comments.
func loadDotEnv(path string) error {
	b, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	for n, line := range strings.Split(string(b), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, val, ok := strings.Cut(strings.TrimPrefix(line, "export "), "=")
		key = strings.TrimSpace(key)
		if !ok || key == "" {
			return fmt.Errorf("%s:%d: want KEY=value", path, n+1)
		}
		if _, set := os.LookupEnv(key); set {
			continue
		}
		if err := os.Setenv(key, value(strings.TrimSpace(val))); err != nil {
			return fmt.Errorf("%s:%d: %w", path, n+1, err)
		}
	}
	return nil
}

// value strips matching quotes, or a trailing " #" comment from a bare value.
func value(v string) string {
	if len(v) >= 2 && (v[0] == '"' || v[0] == '\'') && v[len(v)-1] == v[0] {
		return v[1 : len(v)-1]
	}
	if i := strings.Index(v, " #"); i >= 0 {
		return strings.TrimSpace(v[:i])
	}
	return v
}
