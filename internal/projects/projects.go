// Package projects keeps the registry of beads projects and a live in-memory
// snapshot of each project's issues, refreshed only when its store changes.
package projects

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"

	"weads/internal/bd"
)

const (
	checkInterval    = 2500 * time.Millisecond
	fallbackInterval = 10 * time.Second
)

// ErrNotFound means no project or issue has the requested id.
var ErrNotFound = errors.New("not found")

// ErrNotLoaded means the project has no snapshot yet.
var ErrNotLoaded = errors.New("not loaded yet")

// InputError is a request the user can fix, such as a path without beads.
type InputError struct {
	Msg string
}

func (e *InputError) Error() string { return e.Msg }

// Summary describes a project for the project list.
type Summary struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Path     string `json:"path"`
	Display  string `json:"display"`
	BeadsDir string `json:"beads_dir,omitempty"`
	Loaded   bool   `json:"loaded"`
	Issues   int    `json:"issues"`
	Closed   int    `json:"closed"`
	Version  int    `json:"version"`
	Error    string `json:"error,omitempty"`
}

// Event tells subscribers that the project list or one project's issues changed.
type Event struct {
	Type    string `json:"-"` // "projects" or "issues"
	Project string `json:"project,omitempty"`
	Version int    `json:"version,omitempty"`
}

// Manager owns the registered projects. It is safe for concurrent use.
type Manager struct {
	bd       bd.Client
	file     string
	interval time.Duration
	fallback time.Duration
	wake     chan struct{}

	mu   sync.Mutex
	list []*project
	subs map[chan Event]struct{}
}

type project struct {
	id, root   string
	ws         bd.Workspace
	actor      string
	jira       string
	resolveErr string

	sig     string
	lastRun time.Time
	busy    bool
	removed bool

	loaded   bool
	version  int
	issues   []byte
	snapshot []byte
	ids      map[string]bool
	total    int
	closed   int
	err      string
}

type snapshot struct {
	Project  string          `json:"project"`
	Version  int             `json:"version"`
	LoadedAt time.Time       `json:"loaded_at"`
	Actor    string          `json:"actor,omitempty"`
	JiraURL  string          `json:"jira_url,omitempty"`
	Issues   json.RawMessage `json:"issues"`
}

// Open loads the registry file and resolves every saved project with bd.
// A project that no longer resolves stays listed with its error.
func Open(ctx context.Context, client bd.Client, file string) (*Manager, error) {
	saved, err := readRegistry(file)
	if err != nil {
		return nil, err
	}
	m := &Manager{
		bd:       client,
		file:     file,
		interval: checkInterval,
		fallback: fallbackInterval,
		wake:     make(chan struct{}, 1),
		list:     make([]*project, len(saved)),
		subs:     map[chan Event]struct{}{},
	}
	var g errgroup.Group
	g.SetLimit(4)
	for i, s := range saved {
		g.Go(func() error {
			p := &project{id: s.ID, root: s.Root}
			if ws, err := client.Where(ctx, s.Root); err != nil {
				p.resolveErr = err.Error()
			} else {
				m.resolve(ctx, p, ws)
			}
			m.list[i] = p
			return nil
		})
	}
	_ = g.Wait()
	return m, nil
}

// Add registers the beads workspace that contains dir and reports whether it
// is new. An already registered workspace is returned unchanged.
func (m *Manager) Add(ctx context.Context, dir string) (Summary, bool, error) {
	abs, err := ExpandHome(dir)
	if err != nil {
		return Summary{}, false, &InputError{Msg: "Use an absolute path or one that starts with ~/."}
	}
	if fi, err := os.Stat(abs); err != nil || !fi.IsDir() {
		return Summary{}, false, &InputError{Msg: abs + " is not a directory."}
	}
	ws, err := m.bd.Where(ctx, abs)
	if nw, ok := errors.AsType[*bd.NoWorkspaceError](err); ok {
		return Summary{}, false, &InputError{Msg: nw.Message}
	}
	if err != nil {
		return Summary{}, false, err
	}
	p := &project{root: filepath.Dir(ws.BeadsDir)}
	m.resolve(ctx, p, ws)

	m.mu.Lock()
	defer m.mu.Unlock()
	for _, q := range m.list {
		if q.ws.BeadsDir == ws.BeadsDir {
			return q.summary(), false, nil
		}
		if q.root == p.root && q.ws.BeadsDir == "" {
			q.ws, q.actor, q.jira, q.resolveErr = p.ws, p.actor, p.jira, ""
			m.emit(Event{Type: "projects"})
			m.poke()
			return q.summary(), false, nil
		}
	}
	p.id = m.uniqueID(ws.Prefix)
	m.list = append(m.list, p)
	if err := m.save(); err != nil {
		m.list = m.list[:len(m.list)-1]
		return Summary{}, false, err
	}
	m.emit(Event{Type: "projects"})
	m.poke()
	return p.summary(), true, nil
}

// Remove unregisters a project. Its files stay untouched.
func (m *Manager) Remove(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	i := slices.IndexFunc(m.list, func(p *project) bool { return p.id == id })
	if i < 0 {
		return ErrNotFound
	}
	p := m.list[i]
	m.list = slices.Delete(m.list, i, i+1)
	if err := m.save(); err != nil {
		m.list = slices.Insert(m.list, i, p)
		return err
	}
	p.removed = true
	m.emit(Event{Type: "projects"})
	return nil
}

// Summaries lists the projects in registry order.
func (m *Manager) Summaries() []Summary {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Summary, len(m.list))
	for i, p := range m.list {
		out[i] = p.summary()
	}
	return out
}

// Snapshot returns the encoded issue snapshot of a project.
func (m *Manager) Snapshot(id string) ([]byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p := m.find(id)
	switch {
	case p == nil:
		return nil, ErrNotFound
	case !p.loaded:
		return nil, ErrNotLoaded
	}
	return p.snapshot, nil
}

// Comments reads the comments of an issue that is in the current snapshot.
func (m *Manager) Comments(ctx context.Context, id, issueID string) ([]bd.Comment, error) {
	m.mu.Lock()
	p := m.find(id)
	known := p != nil && p.ids[issueID]
	var beadsDir string
	if known {
		beadsDir = p.ws.BeadsDir
	}
	m.mu.Unlock()
	if !known {
		return nil, ErrNotFound
	}
	return m.bd.Comments(ctx, beadsDir, issueID)
}

// Subscribe returns a channel of change events and a function that ends the
// subscription. A subscriber that falls 64 events behind misses events.
func (m *Manager) Subscribe() (<-chan Event, func()) {
	ch := make(chan Event, 64)
	m.mu.Lock()
	m.subs[ch] = struct{}{}
	m.mu.Unlock()
	return ch, func() {
		m.mu.Lock()
		delete(m.subs, ch)
		m.mu.Unlock()
	}
}

// Run checks every project for store changes until ctx ends.
func (m *Manager) Run(ctx context.Context) {
	t := time.NewTicker(m.interval)
	defer t.Stop()
	for {
		m.check(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		case <-m.wake:
		}
	}
}

// check starts a refresh for each project whose store signature changed.
// The signature is taken before bd runs, so a write during a refresh shows
// up as a change on the next check.
func (m *Manager) check(ctx context.Context) {
	m.mu.Lock()
	todo := slices.Clone(m.list)
	m.mu.Unlock()
	for _, p := range todo {
		m.mu.Lock()
		db := p.ws.DatabasePath
		skip := p.busy || p.ws.BeadsDir == ""
		m.mu.Unlock()
		if skip {
			continue
		}
		sig, sigErr := signature(db)

		m.mu.Lock()
		retry := (sigErr != nil || p.err != "") && time.Since(p.lastRun) >= m.fallback
		if !p.busy && !p.removed && ((sigErr == nil && sig != p.sig) || retry) {
			p.busy, p.sig = true, sig
			go m.refresh(ctx, p, p.ws.BeadsDir)
		}
		m.mu.Unlock()
	}
}

// refresh reads the project's issues and publishes them when they changed.
// A failed read keeps the last good snapshot and records the error.
func (m *Manager) refresh(ctx context.Context, p *project, beadsDir string) {
	issues, err := m.bd.List(ctx, beadsDir)
	var raw []byte
	if err == nil {
		raw, err = json.Marshal(issues)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	p.busy = false
	p.lastRun = time.Now()
	if p.removed || ctx.Err() != nil {
		return
	}
	if err != nil {
		if msg := err.Error(); msg != p.err {
			p.err = msg
			m.emit(Event{Type: "projects"})
		}
		return
	}
	hadErr := p.err != ""
	p.err = ""
	if p.loaded && bytes.Equal(raw, p.issues) {
		if hadErr {
			m.emit(Event{Type: "projects"})
		}
		return
	}
	p.setIssues(issues, raw)
	m.emit(Event{Type: "projects"})
	m.emit(Event{Type: "issues", Project: p.id, Version: p.version})
}

func (p *project) setIssues(issues []bd.Issue, raw []byte) {
	p.loaded = true
	p.version++
	p.issues = raw
	p.ids = make(map[string]bool, len(issues))
	p.total, p.closed = 0, 0
	for _, i := range issues {
		p.ids[i.ID] = true
		if i.IssueType == "epic" {
			continue
		}
		p.total++
		if i.Status == "closed" {
			p.closed++
		}
	}
	p.snapshot, _ = json.Marshal(snapshot{
		Project:  p.id,
		Version:  p.version,
		LoadedAt: time.Now().UTC().Truncate(time.Second),
		Actor:    p.actor,
		JiraURL:  strings.TrimRight(p.jira, "/"),
		Issues:   raw,
	})
}

// resolve fills in the workspace, the current actor, and the Jira base URL.
func (m *Manager) resolve(ctx context.Context, p *project, ws bd.Workspace) {
	p.ws = ws
	p.actor = actor(ctx, p.root)
	p.jira, _ = m.bd.ConfigValue(ctx, ws.BeadsDir, "jira.url") // optional; a failure only hides Jira links
}

func (p *project) summary() Summary {
	name := p.ws.Prefix
	if name == "" {
		name = p.id
	}
	errText := p.resolveErr
	if errText == "" {
		errText = p.err
	}
	return Summary{
		ID:       p.id,
		Name:     name,
		Path:     p.root,
		Display:  Tildify(p.root),
		BeadsDir: p.ws.BeadsDir,
		Loaded:   p.loaded,
		Issues:   p.total,
		Closed:   p.closed,
		Version:  p.version,
		Error:    errText,
	}
}

// emit sends ev to every subscriber without blocking. Caller holds m.mu.
func (m *Manager) emit(ev Event) {
	for ch := range m.subs {
		select {
		case ch <- ev:
		default:
		}
	}
}

func (m *Manager) poke() {
	select {
	case m.wake <- struct{}{}:
	default:
	}
}

func (m *Manager) find(id string) *project {
	for _, p := range m.list {
		if p.id == id {
			return p
		}
	}
	return nil
}

var unsafeID = regexp.MustCompile(`[^a-z0-9-]+`)

// uniqueID derives a URL-safe id from the issue prefix, adding -2, -3, ...
// when it is taken. Caller holds m.mu.
func (m *Manager) uniqueID(prefix string) string {
	base := strings.Trim(unsafeID.ReplaceAllString(strings.ToLower(prefix), "-"), "-")
	if base == "" {
		base = "project"
	}
	id := base
	for n := 2; m.find(id) != nil; n++ {
		id = fmt.Sprintf("%s-%d", base, n)
	}
	return id
}

// save writes the registry file. Caller holds m.mu.
func (m *Manager) save() error {
	saved := make([]savedProject, len(m.list))
	for i, p := range m.list {
		saved[i] = savedProject{ID: p.id, Root: p.root}
	}
	return writeRegistry(m.file, saved)
}

// actor names the current user the way bd does: BEADS_ACTOR, BD_ACTOR,
// git user.name in the project, then USER.
func actor(ctx context.Context, root string) string {
	for _, k := range []string{"BEADS_ACTOR", "BD_ACTOR"} {
		if v := os.Getenv(k); v != "" {
			return v
		}
	}
	if out, err := exec.CommandContext(ctx, "git", "-C", root, "config", "user.name").Output(); err == nil {
		if name := strings.TrimSpace(string(out)); name != "" {
			return name
		}
	}
	return os.Getenv("USER")
}

// ExpandHome turns "~" or "~/..." into an absolute path and cleans it.
// Other relative paths are rejected.
func ExpandHome(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "~" || strings.HasPrefix(path, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		path = filepath.Join(home, path[1:])
	}
	if !filepath.IsAbs(path) {
		return "", errors.New("path must be absolute or start with ~/")
	}
	return filepath.Clean(path), nil
}

// Tildify shortens a path under the home directory to start with ~.
func Tildify(path string) string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return path
	}
	if path == home {
		return "~"
	}
	if rest, ok := strings.CutPrefix(path, home+string(filepath.Separator)); ok {
		return "~/" + rest
	}
	return path
}
