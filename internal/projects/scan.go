package projects

import (
	"os"
	"path/filepath"
	"strings"
)

// UsesBeads reports whether dir/.beads holds a project, using bd's own markers.
// A bare ~/.beads holds only bd's metrics state, so the directory alone is not enough.
func UsesBeads(dir string) bool {
	beads := filepath.Join(dir, ".beads")
	for _, f := range []string{"metadata.json", "config.yaml"} {
		if _, err := os.Stat(filepath.Join(beads, f)); err == nil {
			return true
		}
	}
	return isDir(filepath.Join(beads, "embeddeddolt")) || isDir(filepath.Join(beads, "dolt"))
}

// Scan lists the top-level, non-hidden folders of dir that use beads.
// It does not descend further, so a nested workspace is not found.
func Scan(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var found []string
	for _, e := range entries {
		full := filepath.Join(dir, e.Name())
		if !strings.HasPrefix(e.Name(), ".") && UsesBeads(full) {
			found = append(found, full)
		}
	}
	return found, nil
}

func isDir(path string) bool {
	fi, err := os.Stat(path)
	return err == nil && fi.IsDir()
}
