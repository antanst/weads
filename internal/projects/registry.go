package projects

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

type savedProject struct {
	ID   string `json:"id"`
	Root string `json:"root"`
}

type registryFile struct {
	Projects []savedProject `json:"projects"`
}

// DefaultFile is the registry path under the user config directory.
func DefaultFile() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "weads", "projects.json"), nil
}

// readRegistry loads the saved projects. A missing file is an empty registry.
func readRegistry(file string) ([]savedProject, error) {
	b, err := os.ReadFile(file)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var r registryFile
	if err := json.Unmarshal(b, &r); err != nil {
		return nil, fmt.Errorf("read %s: %w", file, err)
	}
	return r.Projects, nil
}

// writeRegistry saves the projects through a temp file and a rename, so a
// crash never leaves a half-written registry.
func writeRegistry(file string, projects []savedProject) error {
	if projects == nil {
		projects = []savedProject{}
	}
	b, err := json.MarshalIndent(registryFile{Projects: projects}, "", "  ")
	if err != nil {
		return err
	}
	dir := filepath.Dir(file)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".projects-*.json")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(append(b, '\n')); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), file)
}
