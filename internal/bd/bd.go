// Package bd runs the beads CLI in read-only mode and decodes its JSON output.
package bd

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"slices"
	"strings"
	"time"
)

// callTimeout bounds one bd call. The Dolt driver waits with backoff while a
// writer holds the store, so a call can otherwise block indefinitely.
const callTimeout = 30 * time.Second

// Client runs one bd executable.
type Client struct {
	Bin string
}

// Workspace is a beads workspace as resolved by `bd where`.
type Workspace struct {
	BeadsDir     string `json:"path"`
	DatabasePath string `json:"database_path"`
	Prefix       string `json:"prefix"`
}

// NoWorkspaceError means bd found no beads workspace for a directory.
type NoWorkspaceError struct {
	Message string
}

func (e *NoWorkspaceError) Error() string { return e.Message }

// Issue is one issue in the shape the API serves: bd's field names, with
// fields the UI does not use dropped and empty values omitted.
type Issue struct {
	ID                 string       `json:"id"`
	Title              string       `json:"title"`
	Status             string       `json:"status"`
	Priority           int          `json:"priority"`
	IssueType          string       `json:"issue_type"`
	Assignee           string       `json:"assignee,omitempty"`
	Owner              string       `json:"owner,omitempty"`
	Labels             []string     `json:"labels,omitempty"`
	Parent             string       `json:"parent,omitempty"`
	Dependencies       []Dependency `json:"dependencies,omitempty"`
	CreatedAt          string       `json:"created_at,omitempty"`
	CreatedBy          string       `json:"created_by,omitempty"`
	UpdatedAt          string       `json:"updated_at,omitempty"`
	StartedAt          string       `json:"started_at,omitempty"`
	ClosedAt           string       `json:"closed_at,omitempty"`
	LeaseExpiresAt     string       `json:"lease_expires_at,omitempty"`
	HeartbeatAt        string       `json:"heartbeat_at,omitempty"`
	ExternalRef        string       `json:"external_ref,omitempty"`
	SpecID             string       `json:"spec_id,omitempty"`
	CommentCount       int          `json:"comment_count,omitempty"`
	Description        string       `json:"description,omitempty"`
	AcceptanceCriteria string       `json:"acceptance_criteria,omitempty"`
	Design             string       `json:"design,omitempty"`
	Notes              string       `json:"notes,omitempty"`
	CloseReason        string       `json:"close_reason,omitempty"`
}

// Dependency is an edge from an issue to the issue it depends on.
type Dependency struct {
	Type        string `json:"type"`
	DependsOnID string `json:"depends_on_id"`
}

// Comment is one comment on an issue.
type Comment struct {
	Author    string `json:"author"`
	Text      string `json:"text"`
	CreatedAt string `json:"created_at"`
}

// Where resolves the workspace that bd would use from dir.
// It returns *NoWorkspaceError when dir is not inside a beads workspace.
func (c Client) Where(ctx context.Context, dir string) (Workspace, error) {
	out, err := c.run(ctx, dir, "", "where", "--json")
	var ws struct {
		Workspace
		Error   string `json:"error"`
		Message string `json:"message"`
	}
	if jerr := json.Unmarshal(out, &ws); jerr == nil && ws.Error == "no_beads_directory" {
		return Workspace{}, &NoWorkspaceError{Message: ws.Message}
	}
	if err != nil {
		return Workspace{}, err
	}
	if ws.BeadsDir == "" {
		return Workspace{}, fmt.Errorf("bd where: no workspace path in output")
	}
	return ws.Workspace, nil
}

// List returns every issue in the workspace, including closed ones.
func (c Client) List(ctx context.Context, beadsDir string) ([]Issue, error) {
	out, err := c.run(ctx, "", beadsDir, "list", "--all", "-n", "0", "--json")
	if err != nil {
		return nil, err
	}
	return decodeIssues(out)
}

// Comments returns the comments on one issue, oldest first.
func (c Client) Comments(ctx context.Context, beadsDir, id string) ([]Comment, error) {
	out, err := c.run(ctx, "", beadsDir, "comments", "--json", "--", id)
	if err != nil {
		return nil, err
	}
	comments := []Comment{}
	if err := json.Unmarshal(out, &comments); err != nil {
		return nil, fmt.Errorf("decode bd comments: %w", err)
	}
	return comments, nil
}

// ConfigValue returns one bd config value, or "" when it is unset.
func (c Client) ConfigValue(ctx context.Context, beadsDir, key string) (string, error) {
	out, err := c.run(ctx, "", beadsDir, "config", "get", key, "--json")
	if err != nil {
		return "", err
	}
	var v struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(out, &v); err != nil {
		return "", fmt.Errorf("decode bd config: %w", err)
	}
	return v.Value, nil
}

// Version returns the bd version, for example "1.3.4".
func (c Client) Version(ctx context.Context) (string, error) {
	out, err := c.run(ctx, "", "", "version", "--json")
	if err != nil {
		return "", err
	}
	var v struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(out, &v); err != nil {
		return "", fmt.Errorf("decode bd version: %w", err)
	}
	return v.Version, nil
}

// decodeIssues decodes `bd list --json` and drops parent-child edges, which
// the parent field already carries.
func decodeIssues(raw []byte) ([]Issue, error) {
	issues := []Issue{}
	if err := json.Unmarshal(raw, &issues); err != nil {
		return nil, fmt.Errorf("decode bd list: %w", err)
	}
	for i := range issues {
		issues[i].Dependencies = slices.DeleteFunc(issues[i].Dependencies, func(d Dependency) bool {
			return d.Type == "parent-child"
		})
	}
	return issues, nil
}

// run executes bd with --readonly. A non-empty beadsDir pins the workspace;
// otherwise bd resolves it from dir.
func (c Client) run(ctx context.Context, dir, beadsDir string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, callTimeout)
	defer cancel()
	bin := c.Bin
	if bin == "" {
		bin = "bd"
	}
	cmd := exec.CommandContext(ctx, bin, append([]string{"--readonly"}, args...)...)
	cmd.Dir = dir
	cmd.Env = childEnv(cmd.Environ(), beadsDir)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		msg := strings.TrimSpace(stderr.String())
		if i := strings.IndexByte(msg, '\n'); i > 0 {
			msg = msg[:i]
		}
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			msg = "timed out after " + callTimeout.String()
		}
		return out, fmt.Errorf("bd %s: %w: %s", args[0], err, msg)
	}
	return out, nil
}

// childEnv removes variables that would point bd at another workspace, pins
// beadsDir when set, and keeps bd off any Dolt remote.
func childEnv(env []string, beadsDir string) []string {
	env = slices.DeleteFunc(slices.Clone(env), func(kv string) bool {
		k, _, _ := strings.Cut(kv, "=")
		return k == "BEADS_DIR" || k == "BEADS_DB" || k == "BD_DB" || k == "BD_DOLT_LOCAL_ONLY"
	})
	env = append(env, "BD_DOLT_LOCAL_ONLY=1")
	if beadsDir != "" {
		env = append(env, "BEADS_DIR="+beadsDir)
	}
	return env
}
