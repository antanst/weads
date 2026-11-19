// Package bdfake installs a fake bd executable for tests. The fake resolves
// workspaces by walking up to a .beads directory and serves fixture files
// from the pinned BEADS_DIR, so tests never touch a real beads store.
package bdfake

import (
	"os"
	"path/filepath"
	"testing"
)

const script = `#!/bin/sh
[ -n "$BDFAKE_LOG" ] && printf '%s|%s|%s\n' "$BEADS_DIR" "$BD_DOLT_LOCAL_ONLY" "$*" >> "$BDFAKE_LOG"
[ "$1" = --readonly ] || { echo "fake bd: missing --readonly" >&2; exit 2; }
shift
case "$1" in
where)
  d=$(pwd -P)
  while :; do
    if [ -d "$d/.beads" ]; then
      printf '{"path":"%s","database_path":"%s","prefix":"%s","schema_version":1}\n' \
        "$d/.beads" "$d/.beads/embeddeddolt" "$(cat "$d/.beads/prefix")"
      exit 0
    fi
    [ "$d" = / ] && break
    d=$(dirname "$d")
  done
  echo '{"error":"no_beads_directory","message":"No active beads workspace found."}'
  exit 1 ;;
list) cat "$BEADS_DIR/list.json" ;;
comments) f="$BEADS_DIR/comments-$4.json"; if [ -f "$f" ]; then cat "$f"; else echo '[]'; fi ;;
config) printf '{"key":"%s","value":"%s"}\n' "$3" "$(cat "$BEADS_DIR/config-$3" 2>/dev/null)" ;;
version) echo '{"version":"9.9.9"}' ;;
*) echo "fake bd: unknown command $1" >&2; exit 2 ;;
esac
`

// Install writes the fake bd into a temp dir and returns its path.
func Install(t testing.TB) string {
	t.Helper()
	bin := filepath.Join(t.TempDir(), "bd")
	if err := os.WriteFile(bin, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	return bin
}

// Workspace creates root/.beads with an issue prefix and an empty list, and
// returns the .beads path with symlinks resolved, as the fake reports it.
func Workspace(t testing.TB, root, prefix string) string {
	t.Helper()
	beads := filepath.Join(root, ".beads")
	if err := os.MkdirAll(filepath.Join(beads, "embeddeddolt", "db", ".dolt", "noms"), 0o755); err != nil {
		t.Fatal(err)
	}
	Write(t, beads, "prefix", prefix)
	Write(t, beads, "list.json", "[]")
	resolved, err := filepath.EvalSymlinks(beads)
	if err != nil {
		t.Fatal(err)
	}
	return resolved
}

// Write writes one fixture file into a .beads directory.
func Write(t testing.TB, beadsDir, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(beadsDir, name), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}
