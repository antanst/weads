// Package server exposes the projects manager and the embedded web UI over
// HTTP on a loopback address.
package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"sync"
	"time"

	"weads/internal/projects"
)

const csp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
	"font-src 'self'; img-src 'self' data:; connect-src 'self'; " +
	"base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

// maxDirs caps one directory listing so a huge folder cannot stall the UI.
const maxDirs = 2000

// Server serves the API and the web assets.
type Server struct {
	m         *projects.Manager
	bdVersion string
	assets    fs.FS
	host      string // host part of the listen address
	keepalive time.Duration
	picker    bool
	picking   sync.Mutex
}

// New returns the HTTP handler for weads, wrapped in the security guard. The
// host is the host part of the listen address.
func New(m *projects.Manager, bdVersion string, assets fs.FS, host string) http.Handler {
	_, err := exec.LookPath("osascript")
	s := &Server{
		m:         m,
		bdVersion: bdVersion,
		assets:    assets,
		host:      host,
		keepalive: 25 * time.Second,
		picker:    runtime.GOOS == "darwin" && err == nil,
	}
	return s.routes()
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/projects", s.listProjects)
	mux.HandleFunc("POST /api/projects", s.addProject)
	mux.HandleFunc("DELETE /api/projects/{id}", s.removeProject)
	mux.HandleFunc("GET /api/projects/{id}/issues", s.issues)
	mux.HandleFunc("GET /api/projects/{id}/issues/{issue}/comments", s.comments)
	mux.HandleFunc("GET /api/events", s.events)
	mux.HandleFunc("GET /api/fs", s.browse)
	mux.HandleFunc("POST /api/pick", s.pick)
	mux.Handle("GET /", http.FileServerFS(s.assets))
	return s.guard(mux)
}

// guard sets security headers, rejects Host headers that name neither a
// loopback address nor this server's listen host (DNS rebinding), and rejects
// state changes from other origins (CSRF).
func (s *Server) guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", csp)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		if !s.hostOK(r.Host) {
			http.Error(w, "weads does not serve this host", http.StatusForbidden)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Header.Get("Origin") != "http://"+r.Host {
			http.Error(w, "cross-origin request refused", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// hostOK reports whether a Host header names this server: a loopback alias or
// the configured listen host.
func (s *Server) hostOK(host string) bool {
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	host = strings.TrimSuffix(strings.TrimPrefix(host, "["), "]")
	if host == "localhost" || host == "127.0.0.1" || host == "::1" {
		return true
	}
	return host != "" && host == s.host
}

func (s *Server) listProjects(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"bd_version": s.bdVersion,
		"picker":     s.picker,
		"projects":   s.m.Summaries(),
	})
}

func (s *Server) addProject(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Send a JSON body with a path.")
		return
	}
	sum, created, err := s.m.Add(r.Context(), req.Path)
	if ie, ok := errors.AsType[*projects.InputError](err); ok {
		writeError(w, http.StatusUnprocessableEntity, ie.Msg)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	writeJSON(w, status, sum)
}

func (s *Server) removeProject(w http.ResponseWriter, r *http.Request) {
	err := s.m.Remove(r.PathValue("id"))
	switch {
	case errors.Is(err, projects.ErrNotFound):
		writeError(w, http.StatusNotFound, "No such project.")
	case err != nil:
		writeError(w, http.StatusInternalServerError, err.Error())
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

func (s *Server) issues(w http.ResponseWriter, r *http.Request) {
	snap, err := s.m.Snapshot(r.PathValue("id"))
	switch {
	case errors.Is(err, projects.ErrNotFound):
		writeError(w, http.StatusNotFound, "No such project.")
	case errors.Is(err, projects.ErrNotLoaded):
		writeError(w, http.StatusServiceUnavailable, "The project is still loading.")
	default:
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		w.Write(snap)
	}
}

func (s *Server) comments(w http.ResponseWriter, r *http.Request) {
	list, err := s.m.Comments(r.Context(), r.PathValue("id"), r.PathValue("issue"))
	switch {
	case errors.Is(err, projects.ErrNotFound):
		writeError(w, http.StatusNotFound, "No such issue.")
	case err != nil:
		writeError(w, http.StatusBadGateway, err.Error())
	default:
		writeJSON(w, http.StatusOK, list)
	}
}

// events streams change notices as Server-Sent Events until the client or
// the server goes away.
func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	rc := http.NewResponseController(w)
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	ch, done := s.m.Subscribe()
	defer done()
	fmt.Fprint(w, "retry: 1000\n\n")
	if err := rc.Flush(); err != nil {
		return
	}
	tick := time.NewTicker(s.keepalive)
	defer tick.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-tick.C:
			fmt.Fprint(w, ": keepalive\n\n")
		case ev := <-ch:
			data, _ := json.Marshal(ev)
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Type, data)
		}
		if err := rc.Flush(); err != nil {
			return
		}
	}
}

type dirEntry struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Beads   bool   `json:"beads"`
	Project string `json:"project,omitempty"`
}

// browse lists the subdirectories of a directory and marks the ones that
// use beads or are already projects. It never lists files.
func (s *Server) browse(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Query().Get("path")
	if p == "" {
		p = "~"
	}
	dir, err := projects.ExpandHome(p)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "Use an absolute path or one that starts with ~/.")
		return
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "Cannot open "+projects.Tildify(dir)+".")
		return
	}
	added := map[string]string{}
	for _, p := range s.m.Summaries() {
		added[realPath(p.Path)] = p.ID
	}
	dirs := []dirEntry{}
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".") || len(dirs) == maxDirs {
			continue
		}
		full := filepath.Join(dir, e.Name())
		if !e.IsDir() && (e.Type()&fs.ModeSymlink == 0 || !isDir(full)) {
			continue
		}
		d := dirEntry{Name: e.Name(), Path: full, Beads: projects.UsesBeads(full)}
		if d.Beads {
			d.Project = added[realPath(full)]
		}
		dirs = append(dirs, d)
	}
	slices.SortFunc(dirs, func(a, b dirEntry) int { return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name)) })
	parent := filepath.Dir(dir)
	if parent == dir {
		parent = ""
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"path":    dir,
		"display": projects.Tildify(dir),
		"parent":  parent,
		"beads":   projects.UsesBeads(dir),
		"project": added[realPath(dir)],
		"dirs":    dirs,
	})
}

// pick opens the macOS folder chooser and returns the chosen path, or 204
// when the user cancels.
func (s *Server) pick(w http.ResponseWriter, r *http.Request) {
	if !s.picker {
		writeError(w, http.StatusNotFound, "The native folder picker is not available on this system.")
		return
	}
	if !s.picking.TryLock() {
		writeError(w, http.StatusConflict, "A folder chooser is already open.")
		return
	}
	defer s.picking.Unlock()
	cmd := exec.CommandContext(r.Context(), "osascript",
		"-e", "activate",
		"-e", `POSIX path of (choose folder with prompt "Choose a folder that uses beads")`)
	var stderr strings.Builder
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		if strings.Contains(stderr.String(), "(-128)") {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		writeError(w, http.StatusInternalServerError, strings.TrimSpace(stderr.String()))
		return
	}
	path := strings.TrimSpace(string(out))
	if len(path) > 1 {
		path = strings.TrimSuffix(path, "/")
	}
	writeJSON(w, http.StatusOK, map[string]string{"path": path})
}

func isDir(path string) bool {
	fi, err := os.Stat(path)
	return err == nil && fi.IsDir()
}

// realPath resolves symlinks so a folder matches the root bd reported for it.
func realPath(path string) string {
	if p, err := filepath.EvalSymlinks(path); err == nil {
		return p
	}
	return path
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
