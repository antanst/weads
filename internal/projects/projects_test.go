package projects

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"weads/internal/bd"
	"weads/internal/bd/bdfake"
)

func TestSignature(t *testing.T) {
	dir := t.TempDir()
	noms := filepath.Join(dir, "db", ".dolt", "noms")
	write := func(rel, content string) {
		t.Helper()
		p := filepath.Join(dir, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("db/.dolt/noms/manifest", "5:root-aaaa")
	write("db/.dolt/noms/journal", strings.Repeat("x", 5000))
	write("db/.dolt/noms/LOCK", "")
	write(".lock", "")
	write("db/.dolt/temptf/metrics", "1")
	sig := func() string {
		t.Helper()
		s, err := signature(dir)
		if err != nil {
			t.Fatal(err)
		}
		return s
	}
	base := sig()

	future := time.Now().Add(time.Hour)
	for _, f := range []string{"manifest", "journal", "LOCK"} {
		if err := os.Chtimes(filepath.Join(noms, f), future, future); err != nil {
			t.Fatal(err)
		}
	}
	write("db/.dolt/noms/LOCK", "held")
	write(".lock", "held")
	write("db/.dolt/temptf/metrics", "22")
	write("db/.dolt/noms/journal.idx", "half-rewritten")
	if sig() != base {
		t.Error("signature changed on mtime, lock, temp file, or journal index changes, as a read causes")
	}

	write("db/.dolt/noms/manifest", "5:root-bbbb")
	afterManifest := sig()
	if afterManifest == base {
		t.Error("signature ignored a same-size manifest rewrite")
	}
	write("db/.dolt/noms/journal", strings.Repeat("x", 5001))
	if sig() == afterManifest {
		t.Error("signature ignored a journal append")
	}

	if _, err := signature(filepath.Join(dir, "missing")); err == nil {
		t.Error("signature of a missing store did not fail")
	}
}

func TestExpandHome(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	for in, want := range map[string]string{
		"~/work/mo/":    filepath.Join(home, "work", "mo"),
		"~":             home,
		" /tmp/x/../y ": "/tmp/y",
	} {
		if got, err := ExpandHome(in); err != nil || got != want {
			t.Errorf("ExpandHome(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	if _, err := ExpandHome("work/mo"); err == nil {
		t.Error("ExpandHome accepted a relative path")
	}
}

func TestAddRemoveReload(t *testing.T) {
	ctx := context.Background()
	m, file, log := newManager(t)

	root := t.TempDir()
	beads := bdfake.Workspace(t, root, "demo")
	sub := filepath.Join(root, "openspec")
	if err := os.Mkdir(sub, 0o755); err != nil {
		t.Fatal(err)
	}

	s, created, err := m.Add(ctx, root)
	if err != nil || !created || s.ID != "demo" || s.BeadsDir != beads || s.Path != filepath.Dir(beads) {
		t.Fatalf("Add(root) = %+v, %v, %v", s, created, err)
	}
	s, created, err = m.Add(ctx, sub)
	if err != nil || created || s.ID != "demo" {
		t.Errorf("Add(subdir) = %+v, %v, %v; want the existing project", s, created, err)
	}

	calls := len(readLog(t, log))
	for _, bad := range []string{filepath.Join(root, "missing"), filepath.Join(sub, "..", "openspec", "nope"), "relative/dir"} {
		if _, _, err := m.Add(ctx, bad); !isInput(err) {
			t.Errorf("Add(%q) error = %v, want InputError", bad, err)
		}
	}
	if got := len(readLog(t, log)); got != calls {
		t.Errorf("invalid paths ran bd %d times", got-calls)
	}
	if again, created, err := m.Add(ctx, s.Path); err != nil || created || again.ID != "demo" || len(readLog(t, log)) != calls {
		t.Errorf("re-Add(root) = %+v, %v, %v; want the existing project with no bd call", again, created, err)
	}
	_, _, err = m.Add(ctx, t.TempDir())
	if ie, ok := errors.AsType[*InputError](err); !ok || ie.Msg != "No active beads workspace found." {
		t.Errorf("Add(non-beads) error = %v, want bd's message", err)
	}

	other := t.TempDir()
	bdfake.Workspace(t, other, "demo")
	if s, _, err := m.Add(ctx, other); err != nil || s.ID != "demo-2" {
		t.Errorf("Add(second demo) = %+v, %v; want id demo-2", s, err)
	}
	if got := ids(m.Summaries()); got != "demo,demo-2" {
		t.Errorf("ids = %s", got)
	}

	if err := m.Remove("demo"); err != nil {
		t.Fatal(err)
	}
	if err := m.Remove("demo"); !errors.Is(err, ErrNotFound) {
		t.Errorf("second Remove error = %v, want ErrNotFound", err)
	}
	reopened, err := Open(ctx, m.bd, file)
	if err != nil {
		t.Fatal(err)
	}
	if got := ids(reopened.Summaries()); got != "demo-2" {
		t.Errorf("ids after reload = %s, want demo-2", got)
	}
	if _, err := os.Stat(beads); err != nil {
		t.Errorf("Remove touched the workspace: %v", err)
	}
}

func TestReloadKeepsUnresolvedProject(t *testing.T) {
	ctx := context.Background()
	m, file, _ := newManager(t)
	root := t.TempDir()
	beads := bdfake.Workspace(t, root, "demo")
	if _, _, err := m.Add(ctx, root); err != nil {
		t.Fatal(err)
	}
	if err := os.RemoveAll(beads); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(ctx, m.bd, file)
	if err != nil {
		t.Fatal(err)
	}
	s := reopened.Summaries()
	if len(s) != 1 || s[0].ID != "demo" || s[0].Error == "" {
		t.Errorf("summaries = %+v, want demo with an error", s)
	}
}

func TestLiveRefresh(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	m, _, log := newManager(t)
	root := t.TempDir()
	beads := bdfake.Workspace(t, root, "demo")
	bdfake.Write(t, beads, "list.json", `[{"id":"demo-1","title":"A","status":"open","priority":1,"issue_type":"task"}]`)
	journal := filepath.Join(beads, "embeddeddolt", "db", ".dolt", "noms", "journal")
	bdfake.Write(t, beads, "embeddeddolt/db/.dolt/noms/journal", "x")

	events, done := m.Subscribe()
	defer done()
	if _, _, err := m.Add(ctx, root); err != nil {
		t.Fatal(err)
	}
	go m.Run(ctx)

	ev := waitFor(t, events, "issues")
	if ev.Project != "demo" || ev.Version != 1 {
		t.Fatalf("first issues event = %+v", ev)
	}
	snap := decodeSnapshot(t, m, "demo")
	if snap.Version != 1 || len(snap.Issues) != 1 || snap.Issues[0].Status != "open" {
		t.Errorf("snapshot = %+v", snap)
	}

	// The store did not change, so weads must not run bd even though the
	// fixture now differs.
	bdfake.Write(t, beads, "list.json", `[{"id":"demo-1","title":"A","status":"closed","priority":1,"issue_type":"task"}]`)
	lists := countLists(t, log)
	assertNo(t, events, "issues", 100*time.Millisecond)
	if got := countLists(t, log); got != lists {
		t.Errorf("idle store ran bd list %d times", got-lists)
	}

	appendTo(t, journal, "y")
	ev = waitFor(t, events, "issues")
	if ev.Version != 2 || decodeSnapshot(t, m, "demo").Issues[0].Status != "closed" {
		t.Errorf("after write: event %+v", ev)
	}
	if s := m.Summaries()[0]; s.Issues != 1 || s.Closed != 1 {
		t.Errorf("summary counts = %+v", s)
	}

	lists = countLists(t, log)
	appendTo(t, journal, "z")
	assertNo(t, events, "issues", 150*time.Millisecond)
	if countLists(t, log) == lists {
		t.Error("store change did not refresh")
	}

	if err := os.Remove(filepath.Join(beads, "list.json")); err != nil {
		t.Fatal(err)
	}
	appendTo(t, journal, "w")
	waitFor(t, events, "projects")
	if s := m.Summaries()[0]; !strings.Contains(s.Error, "bd list") {
		t.Errorf("summary error = %q, want the bd failure", s.Error)
	}
	if decodeSnapshot(t, m, "demo").Version != 2 {
		t.Error("failed read replaced the last good snapshot")
	}

	bdfake.Write(t, beads, "list.json", `[{"id":"demo-1","title":"A","status":"closed","priority":1,"issue_type":"task"}]`)
	waitFor(t, events, "projects")
	if s := m.Summaries()[0]; s.Error != "" {
		t.Errorf("error not cleared after recovery: %q", s.Error)
	}
}

func TestServerModeFallback(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	m, _, log := newManager(t)
	root := t.TempDir()
	beads := bdfake.Workspace(t, root, "demo")
	if err := os.RemoveAll(filepath.Join(beads, "embeddeddolt")); err != nil {
		t.Fatal(err)
	}
	if _, _, err := m.Add(ctx, root); err != nil {
		t.Fatal(err)
	}
	go m.Run(ctx)
	deadline := time.Now().Add(3 * time.Second)
	for countLists(t, log) < 3 {
		if time.Now().After(deadline) {
			t.Fatalf("store without embedded data refreshed %d times, want 3", countLists(t, log))
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestComments(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	m, _, log := newManager(t)
	root := t.TempDir()
	beads := bdfake.Workspace(t, root, "demo")
	bdfake.Write(t, beads, "list.json", `[{"id":"demo-1","title":"A","status":"open","priority":1,"issue_type":"task","comment_count":1}]`)
	bdfake.Write(t, beads, "comments-demo-1.json", `[{"id":"c1","issue_id":"demo-1","author":"ann","text":"hi","created_at":"2026-11-18T12:00:00Z"}]`)
	events, done := m.Subscribe()
	defer done()
	if _, _, err := m.Add(ctx, root); err != nil {
		t.Fatal(err)
	}
	go m.Run(ctx)
	waitFor(t, events, "issues")

	got, err := m.Comments(ctx, "demo", "demo-1")
	if err != nil || len(got) != 1 || got[0] != (bd.Comment{Author: "ann", Text: "hi", CreatedAt: "2026-11-18T12:00:00Z"}) {
		t.Errorf("Comments = %+v, %v", got, err)
	}
	calls := len(readLog(t, log))
	if _, err := m.Comments(ctx, "demo", "--help"); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown issue error = %v, want ErrNotFound", err)
	}
	if len(readLog(t, log)) != calls {
		t.Error("unknown issue id reached bd")
	}
}

func TestActor(t *testing.T) {
	ctx := context.Background()
	t.Setenv("GIT_CONFIG_GLOBAL", os.DevNull)
	t.Setenv("GIT_CONFIG_NOSYSTEM", "1")
	t.Setenv("USER", "sysuser")
	repo := t.TempDir()
	for _, args := range [][]string{{"init", "-q"}, {"config", "user.name", "gituser"}} {
		if out, err := exec.Command("git", append([]string{"-C", repo}, args...)...).CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v %s", args, err, out)
		}
	}
	t.Setenv("BEADS_ACTOR", "beadsactor")
	t.Setenv("BD_ACTOR", "bdactor")
	if got := actor(ctx, repo); got != "beadsactor" {
		t.Errorf("with BEADS_ACTOR: %q", got)
	}
	t.Setenv("BEADS_ACTOR", "")
	if got := actor(ctx, repo); got != "bdactor" {
		t.Errorf("with BD_ACTOR: %q", got)
	}
	t.Setenv("BD_ACTOR", "")
	if got := actor(ctx, repo); got != "gituser" {
		t.Errorf("with git user.name: %q", got)
	}
	if got := actor(ctx, t.TempDir()); got != "sysuser" {
		t.Errorf("fallback: %q", got)
	}
}

func TestScan(t *testing.T) {
	work := t.TempDir()
	for _, d := range []string{"alpha/.beads/embeddeddolt", "beta/.beads/eventsData", ".hidden/.beads/embeddeddolt", "gamma/sub/.beads/embeddeddolt", "delta/.beads"} {
		if err := os.MkdirAll(filepath.Join(work, d), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(work, "delta", ".beads", "config.yaml"), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := Scan(work)
	if want := []string{filepath.Join(work, "alpha"), filepath.Join(work, "delta")}; err != nil || !slices.Equal(got, want) {
		t.Errorf("Scan = %v, %v; want %v", got, err, want)
	}
	if _, err := Scan(filepath.Join(work, "missing")); !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("Scan(missing) error = %v, want ErrNotExist", err)
	}
}

func newManager(t *testing.T) (m *Manager, file, log string) {
	t.Helper()
	log = filepath.Join(t.TempDir(), "calls.log")
	t.Setenv("BDFAKE_LOG", log)
	file = filepath.Join(t.TempDir(), "weads", "projects.json")
	m, err := Open(context.Background(), bd.Client{Bin: bdfake.Install(t)}, file)
	if err != nil {
		t.Fatal(err)
	}
	m.interval = 10 * time.Millisecond
	m.fallback = 30 * time.Millisecond
	return m, file, log
}

func readLog(t *testing.T, log string) []string {
	t.Helper()
	b, err := os.ReadFile(log)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		t.Fatal(err)
	}
	return strings.Split(strings.TrimSpace(string(b)), "\n")
}

func countLists(t *testing.T, log string) int {
	n := 0
	for _, l := range readLog(t, log) {
		if strings.Contains(l, "--readonly list ") {
			n++
		}
	}
	return n
}

func waitFor(t *testing.T, ch <-chan Event, typ string) Event {
	t.Helper()
	timeout := time.After(3 * time.Second)
	for {
		select {
		case ev := <-ch:
			if ev.Type == typ {
				return ev
			}
		case <-timeout:
			t.Fatalf("no %s event", typ)
		}
	}
}

func assertNo(t *testing.T, ch <-chan Event, typ string, d time.Duration) {
	t.Helper()
	timeout := time.After(d)
	for {
		select {
		case ev := <-ch:
			if ev.Type == typ {
				t.Fatalf("unexpected %s event %+v", typ, ev)
			}
		case <-timeout:
			return
		}
	}
}

func decodeSnapshot(t *testing.T, m *Manager, id string) (s struct {
	Version int        `json:"version"`
	Issues  []bd.Issue `json:"issues"`
}) {
	t.Helper()
	raw, err := m.Snapshot(id)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, &s); err != nil {
		t.Fatal(err)
	}
	return s
}

func appendTo(t *testing.T, path, s string) {
	t.Helper()
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if _, err := f.WriteString(s); err != nil {
		t.Fatal(err)
	}
}

func ids(s []Summary) string {
	out := make([]string, len(s))
	for i, x := range s {
		out[i] = x.ID
	}
	return strings.Join(out, ",")
}

func isInput(err error) bool {
	_, ok := errors.AsType[*InputError](err)
	return ok
}
