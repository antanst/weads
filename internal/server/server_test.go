package server

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"weads/internal/bd"
	"weads/internal/bd/bdfake"
	"weads/internal/projects"
)

func newTestServer(t *testing.T) (*Server, http.Handler) {
	t.Helper()
	m, err := projects.Open(context.Background(), bd.Client{Bin: bdfake.Install(t)}, filepath.Join(t.TempDir(), "projects.json"))
	if err != nil {
		t.Fatal(err)
	}
	s := &Server{
		m:         m,
		bdVersion: "9.9.9",
		assets:    fstest.MapFS{"index.html": {Data: []byte("<!doctype html><title>weads</title>")}},
		keepalive: 20 * time.Millisecond,
	}
	return s, s.routes()
}

func do(t *testing.T, h http.Handler, method, target, host, origin, body string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(method, target, strings.NewReader(body))
	r.Host = host
	if origin != "" {
		r.Header.Set("Origin", origin)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestGuard(t *testing.T) {
	_, h := newTestServer(t)
	nonBeads := `{"path":"` + t.TempDir() + `"}`
	for _, tc := range []struct {
		name, method, host, origin, body string
		want                             int
	}{
		{"rebinding host", "GET", "evil.example:7707", "", "", http.StatusForbidden},
		{"localhost", "GET", "localhost:7707", "", "", http.StatusOK},
		{"ipv4 loopback", "GET", "127.0.0.1:7707", "", "", http.StatusOK},
		{"ipv6 loopback", "GET", "[::1]:7707", "", "", http.StatusOK},
		{"post without origin", "POST", "127.0.0.1:7707", "", nonBeads, http.StatusForbidden},
		{"cross-site post", "POST", "127.0.0.1:7707", "http://evil.example", nonBeads, http.StatusForbidden},
		{"same-origin post", "POST", "127.0.0.1:7707", "http://127.0.0.1:7707", nonBeads, http.StatusUnprocessableEntity},
		{"cross-site delete", "DELETE", "127.0.0.1:7707", "http://localhost:7707", "", http.StatusForbidden},
	} {
		t.Run(tc.name, func(t *testing.T) {
			target := "/api/projects"
			if tc.method == "DELETE" {
				target += "/demo"
			}
			w := do(t, h, tc.method, target, tc.host, tc.origin, tc.body)
			if w.Code != tc.want {
				t.Errorf("status = %d, want %d (%s)", w.Code, tc.want, w.Body)
			}
			for _, k := range []string{"Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy"} {
				if w.Header().Get(k) == "" {
					t.Errorf("missing %s header", k)
				}
			}
		})
	}
}

func TestProjectAPI(t *testing.T) {
	s, h := newTestServer(t)
	const host, origin = "127.0.0.1:7707", "http://127.0.0.1:7707"
	root := t.TempDir()
	beads := bdfake.Workspace(t, root, "demo")
	bdfake.Write(t, beads, "list.json", `[{"id":"demo-1","title":"A","status":"open","priority":0,"issue_type":"task"}]`)
	add := `{"path":"` + root + `"}`

	if w := do(t, h, "POST", "/api/projects", host, origin, add); w.Code != http.StatusCreated {
		t.Fatalf("add = %d %s", w.Code, w.Body)
	}
	if w := do(t, h, "POST", "/api/projects", host, origin, add); w.Code != http.StatusOK {
		t.Errorf("second add = %d, want 200", w.Code)
	}
	w := do(t, h, "POST", "/api/projects", host, origin, `{"path":"`+t.TempDir()+`"}`)
	if w.Code != http.StatusUnprocessableEntity || !strings.Contains(w.Body.String(), "No active beads workspace found.") {
		t.Errorf("non-beads add = %d %s", w.Code, w.Body)
	}

	var list struct {
		BDVersion string             `json:"bd_version"`
		Projects  []projects.Summary `json:"projects"`
	}
	decode(t, do(t, h, "GET", "/api/projects", host, "", ""), &list)
	if list.BDVersion != "9.9.9" || len(list.Projects) != 1 || list.Projects[0].ID != "demo" {
		t.Errorf("project list = %+v", list)
	}

	if w := do(t, h, "GET", "/api/projects/demo/issues", host, "", ""); w.Code != http.StatusServiceUnavailable {
		t.Errorf("issues before load = %d, want 503", w.Code)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go s.m.Run(ctx)
	deadline := time.Now().Add(3 * time.Second)
	for {
		if _, err := s.m.Snapshot("demo"); err == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("project never loaded")
		}
		time.Sleep(10 * time.Millisecond)
	}
	var snap struct {
		Project string     `json:"project"`
		Issues  []bd.Issue `json:"issues"`
	}
	decode(t, do(t, h, "GET", "/api/projects/demo/issues", host, "", ""), &snap)
	if snap.Project != "demo" || len(snap.Issues) != 1 || snap.Issues[0].ID != "demo-1" {
		t.Errorf("snapshot = %+v", snap)
	}

	if w := do(t, h, "GET", "/api/projects/demo/issues/demo-1/comments", host, "", ""); w.Code != http.StatusOK || strings.TrimSpace(w.Body.String()) != "[]" {
		t.Errorf("comments = %d %s", w.Code, w.Body)
	}
	if w := do(t, h, "GET", "/api/projects/demo/issues/demo-9/comments", host, "", ""); w.Code != http.StatusNotFound {
		t.Errorf("unknown issue comments = %d, want 404", w.Code)
	}
	if w := do(t, h, "GET", "/api/projects/nope/issues", host, "", ""); w.Code != http.StatusNotFound {
		t.Errorf("unknown project issues = %d, want 404", w.Code)
	}

	if w := do(t, h, "DELETE", "/api/projects/demo", host, origin, ""); w.Code != http.StatusNoContent {
		t.Errorf("delete = %d", w.Code)
	}
	if w := do(t, h, "DELETE", "/api/projects/demo", host, origin, ""); w.Code != http.StatusNotFound {
		t.Errorf("second delete = %d, want 404", w.Code)
	}
}

func TestEvents(t *testing.T) {
	_, h := newTestServer(t)
	srv := httptest.NewServer(h)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/events")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("content type = %q", ct)
	}
	lines := make(chan string, 100)
	go func() {
		sc := bufio.NewScanner(resp.Body)
		for sc.Scan() {
			lines <- sc.Text()
		}
		close(lines)
	}()
	waitLine(t, lines, ": keepalive")

	root := t.TempDir()
	bdfake.Workspace(t, root, "demo")
	req, _ := http.NewRequest("POST", srv.URL+"/api/projects", strings.NewReader(`{"path":"`+root+`"}`))
	req.Header.Set("Origin", srv.URL)
	if r, err := http.DefaultClient.Do(req); err != nil || r.StatusCode != http.StatusCreated {
		t.Fatalf("add: %v %v", r, err)
	}
	waitLine(t, lines, "event: projects")
}

func TestBrowse(t *testing.T) {
	_, h := newTestServer(t)
	home := t.TempDir()
	t.Setenv("HOME", home)
	work := filepath.Join(home, "work")
	for _, d := range []string{"alpha/.beads/embeddeddolt", "Beta/.beads/eventsData", ".hidden/.beads/embeddeddolt"} {
		if err := os.MkdirAll(filepath.Join(work, d), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(work, "notes.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(work, "alpha"), filepath.Join(work, "link")); err != nil {
		t.Fatal(err)
	}

	var got struct {
		Path    string     `json:"path"`
		Display string     `json:"display"`
		Parent  string     `json:"parent"`
		Dirs    []dirEntry `json:"dirs"`
	}
	decode(t, do(t, h, "GET", "/api/fs?path=~/work", "localhost", "", ""), &got)
	var names []string
	for _, d := range got.Dirs {
		names = append(names, d.Name+map[bool]string{true: "*"}[d.Beads])
	}
	if strings.Join(names, ",") != "alpha*,Beta,link*" || got.Display != "~/work" || got.Parent != home {
		t.Errorf("listing = %+v (names %v)", got, names)
	}
	if w := do(t, h, "GET", "/api/fs?path=~/missing", "localhost", "", ""); w.Code != http.StatusUnprocessableEntity {
		t.Errorf("missing dir = %d, want 422", w.Code)
	}
}

func TestAssets(t *testing.T) {
	_, h := newTestServer(t)
	w := do(t, h, "GET", "/", "localhost:7707", "", "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "<title>weads</title>") {
		t.Errorf("index = %d %s", w.Code, w.Body)
	}
}

func decode(t *testing.T, w *httptest.ResponseRecorder, v any) {
	t.Helper()
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	if err := json.NewDecoder(io.Reader(w.Body)).Decode(v); err != nil {
		t.Fatal(err)
	}
}

func waitLine(t *testing.T, lines <-chan string, want string) {
	t.Helper()
	timeout := time.After(3 * time.Second)
	for {
		select {
		case l, ok := <-lines:
			if !ok {
				t.Fatalf("stream ended before %q", want)
			}
			if l == want {
				return
			}
		case <-timeout:
			t.Fatalf("no %q line", want)
		}
	}
}
