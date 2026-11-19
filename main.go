// Command weads serves a fast, read-only web UI for beads projects.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"weads/internal/bd"
	"weads/internal/projects"
	"weads/internal/server"
	"weads/web"
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
		fmt.Fprintf(flag.CommandLine.Output(), "Usage: weads [flags] [dir ...]\n\nServes a read-only web UI for beads projects. Each dir is added as a project.\n\n")
		flag.PrintDefaults()
	}
	flag.Parse()
	if *file == "" {
		return errors.New("no user config directory; pass -config")
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
	for _, arg := range flag.Args() {
		dir, err := filepath.Abs(arg)
		if err != nil {
			return err
		}
		if _, _, err := m.Add(ctx, dir); err != nil {
			return fmt.Errorf("%s: %w", arg, err)
		}
	}

	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		return err
	}
	srv := &http.Server{
		Handler:           server.New(m, version, web.FS),
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
