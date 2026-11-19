package bd_test

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"weads/internal/bd"
	"weads/internal/bd/bdfake"
)

// listFixture follows the bd 1.3.4 `list --json` shape, including fields the
// API drops (metadata, counts) and nulls it omits.
const listFixture = `[
  {"id":"demo-a1","title":"Fix crash","description":"Steps","status":"open","priority":0,
   "issue_type":"bug","owner":"ann@example.com","created_at":"2026-11-18T12:00:00Z","created_by":"ann",
   "updated_at":"2026-11-18T13:00:00Z","labels":null,"parent":"demo-ep","design":null,"metadata":null,
   "acceptance_criteria":"No crash","comment_count":2,"dependency_count":2,"dependent_count":0,
   "dependencies":[
     {"issue_id":"demo-a1","depends_on_id":"demo-ep","type":"parent-child","created_at":"2026-11-18T12:00:00Z","created_by":"ann","metadata":"{}"},
     {"issue_id":"demo-a1","depends_on_id":"demo-b2","type":"blocks","created_at":"2026-11-18T12:00:00Z","created_by":"ann","metadata":"{}"}
   ]},
  {"id":"demo-ep","title":"Epic","status":"open","priority":2,"issue_type":"epic","labels":["ops"],
   "comment_count":0,"dependency_count":0,"dependent_count":1}
]`

func TestListShape(t *testing.T) {
	c := bd.Client{Bin: bdfake.Install(t)}
	beads := bdfake.Workspace(t, t.TempDir(), "demo")
	bdfake.Write(t, beads, "list.json", listFixture)

	issues, err := c.List(context.Background(), beads)
	if err != nil {
		t.Fatal(err)
	}
	got, err := json.Marshal(issues[0])
	if err != nil {
		t.Fatal(err)
	}
	want := `{"id":"demo-a1","title":"Fix crash","status":"open","priority":0,"issue_type":"bug",` +
		`"owner":"ann@example.com","parent":"demo-ep","dependencies":[{"type":"blocks","depends_on_id":"demo-b2"}],` +
		`"created_at":"2026-11-18T12:00:00Z","created_by":"ann","updated_at":"2026-11-18T13:00:00Z",` +
		`"comment_count":2,"description":"Steps","acceptance_criteria":"No crash"}`
	if string(got) != want {
		t.Errorf("issue JSON\n got: %s\nwant: %s", got, want)
	}
	if len(issues) != 2 || issues[1].Labels[0] != "ops" {
		t.Errorf("second issue = %+v", issues[1:])
	}
}

func TestWhere(t *testing.T) {
	c := bd.Client{Bin: bdfake.Install(t)}
	root := t.TempDir()
	beads := bdfake.Workspace(t, root, "demo")
	sub := filepath.Join(root, "docs", "deep")
	if err := os.MkdirAll(sub, 0o755); err != nil {
		t.Fatal(err)
	}

	ws, err := c.Where(context.Background(), sub)
	if err != nil {
		t.Fatal(err)
	}
	if ws.BeadsDir != beads || ws.Prefix != "demo" {
		t.Errorf("Where(sub) = %+v, want beads dir %s and prefix demo", ws, beads)
	}

	_, err = c.Where(context.Background(), t.TempDir())
	var nw *bd.NoWorkspaceError
	if !errors.As(err, &nw) || nw.Message != "No active beads workspace found." {
		t.Errorf("Where(non-beads) error = %v, want NoWorkspaceError with bd's message", err)
	}
}

func TestPinnedEnvironment(t *testing.T) {
	c := bd.Client{Bin: bdfake.Install(t)}
	beads := bdfake.Workspace(t, t.TempDir(), "demo")
	log := filepath.Join(t.TempDir(), "calls.log")
	t.Setenv("BDFAKE_LOG", log)
	t.Setenv("BEADS_DIR", "/elsewhere/.beads")
	t.Setenv("BD_DOLT_LOCAL_ONLY", "0")

	if _, err := c.List(context.Background(), beads); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Comments(context.Background(), beads, "--help"); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(log)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(string(raw)), "\n")
	want := []string{
		beads + "|1|--readonly list --all -n 0 --json",
		beads + "|1|--readonly comments --json -- --help",
	}
	if strings.Join(lines, "\n") != strings.Join(want, "\n") {
		t.Errorf("calls\n got: %q\nwant: %q", lines, want)
	}
}

func TestListError(t *testing.T) {
	c := bd.Client{Bin: bdfake.Install(t)}
	beads := bdfake.Workspace(t, t.TempDir(), "demo")
	if err := os.Remove(filepath.Join(beads, "list.json")); err != nil {
		t.Fatal(err)
	}
	if _, err := c.List(context.Background(), beads); err == nil || !strings.Contains(err.Error(), "bd list") {
		t.Errorf("List error = %v, want a bd list error", err)
	}
}
