package projects

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

// smallFile is the size up to which a file's content counts. Dolt rewrites
// manifests in place with the same size, so their content must count.
const smallFile = 4096

// signature summarizes a store directory by relative path and size of each
// file, plus the content of small files. It skips what a read touches:
// modification times, locks, temp files, and the journal index.
func signature(dir string) (string, error) {
	h := sha256.New()
	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			if path != dir && errors.Is(err, fs.ErrNotExist) {
				return nil // removed mid-walk, e.g. by Dolt GC; the next check sees the result
			}
			return err
		}
		name := d.Name()
		if d.IsDir() {
			if name == "temptf" {
				return filepath.SkipDir
			}
			return nil
		}
		// Every reader rewrites journal.idx in place, so its size flaps mid-read.
		// It is derived from the journal, which every write appends to.
		if name == "LOCK" || name == ".lock" || name == "journal.idx" || !d.Type().IsRegular() {
			return nil
		}
		info, err := d.Info()
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(dir, path)
		fmt.Fprintf(h, "%s\x00%d\x00", rel, info.Size())
		if info.Size() <= smallFile {
			b, err := os.ReadFile(path)
			if errors.Is(err, fs.ErrNotExist) {
				return nil
			}
			if err != nil {
				return err
			}
			h.Write(b)
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
