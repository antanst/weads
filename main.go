// Command weads serves a fast, read-only web UI for beads projects.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/antanst/weads/internal/bd"
	"github.com/antanst/weads/internal/config"
	"github.com/antanst/weads/internal/projects"
	"github.com/antanst/weads/internal/server"
	"github.com/antanst/weads/web"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "weads:", err)
		os.Exit(1)
	}
}

// run parses flags, opens the registry, and serves until SIGINT or SIGTERM.
func run() error {
	defaultFile, _ := projects.DefaultFile()
	addr := flag.String("addr", "127.0.0.1:7707", "listen `address`")
	file := flag.String("config", defaultFile, "project registry `file`")
	bin := flag.String("bd", "bd", "bd `executable`")
	flag.Usage = func() {
		fmt.Fprintf(flag.CommandLine.Output(), `Usage: weads [flags] [dir ...]

Serves a read-only web UI for beads projects. Each dir is added as a project.

A .env file in the current directory fills in unset environment variables:
  WEADS_WORK_DIR  folder whose top-level folders that use beads are added
  WEADS_PROJECTS  comma-separated folders to add as projects

`)
		flag.PrintDefaults()
	}
	flag.Parse()
	host, _, err := net.SplitHostPort(*addr)
	if err != nil {
		return fmt.Errorf("bad -addr %q: %w", *addr, err)
	}
	if *file == "" {
		return errors.New("no user config directory; pass -config")
	}
	settings, err := config.Load(".env")
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	client := bd.Client{Bin: *bin}
	version, err := client.Version(ctx)
	if err != nil {
		return fmt.Errorf("cannot run bd: %w", err)
	}
	m, err := projects.Open(ctx, client, *file)
	if err != nil {
		return err
	}
	for _, dir := range settings.Projects {
		if err := add(ctx, m, dir); err != nil {
			return fmt.Errorf("WEADS_PROJECTS: %w", err)
		}
	}
	if err := addWorkDir(ctx, m, settings.WorkDir); err != nil {
		return fmt.Errorf("WEADS_WORK_DIR: %w", err)
	}
	for _, arg := range flag.Args() {
		if err := add(ctx, m, arg); err != nil {
			return err
		}
	}

	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		return err
	}
	srv := &http.Server{
		Handler:           server.New(m, version, web.FS, host),
		ReadHeaderTimeout: 10 * time.Second,
		BaseContext:       func(net.Listener) context.Context { return ctx },
	}
	go m.Run(ctx)
	fmt.Printf("weads serving %d project(s) at http://%s\n", len(m.Summaries()), ln.Addr())

	errc := make(chan error, 1)
	go func() { errc <- srv.Serve(ln) }()
	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}
	stop()
	shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return srv.Shutdown(shutdown)
}

// add registers dir as a project. A dir that is not a beads project is an error.
func add(ctx context.Context, m *projects.Manager, dir string) error {
	abs, err := absPath(dir)
	if err == nil {
		_, _, err = m.Add(ctx, abs)
	}
	if err != nil {
		return fmt.Errorf("%s: %w", dir, err)
	}
	return nil
}

// addWorkDir adds each top-level folder of dir that uses beads. An unset or
// missing dir adds nothing, and a folder that fails is skipped with a warning.
func addWorkDir(ctx context.Context, m *projects.Manager, dir string) error {
	if dir == "" {
		return nil
	}
	abs, err := absPath(dir)
	if err != nil {
		return err
	}
	found, err := projects.Scan(abs)
	if errors.Is(err, fs.ErrNotExist) {
		fmt.Fprintf(os.Stderr, "weads: %s does not exist; not scanning it\n", dir)
		return nil
	}
	if err != nil {
		return err
	}
	for _, p := range found {
		if err := add(ctx, m, p); err != nil {
			fmt.Fprintln(os.Stderr, "weads: skipping", err)
		}
	}
	return nil
}

// absPath expands a leading ~ and resolves a relative path against the working directory.
func absPath(p string) (string, error) {
	if strings.HasPrefix(p, "~") {
		return projects.ExpandHome(p)
	}
	return filepath.Abs(p)
}
