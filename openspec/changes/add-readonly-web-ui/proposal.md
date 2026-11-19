# Proposal

## Why

Beads (`bd`) keeps a project's issues in an embedded Dolt store, and agents
update that store all day. Today, reading it means many `bd` commands in a
terminal. weads gives a fast, read-only web view of one or more beads projects
that stays current while agents work, so a human can see what is ready, what is
blocked and why, and what each agent is doing.

## What Changes

- A single Go executable, `weads`, that serves the web UI and an HTTP API on
  localhost. The executable embeds every frontend asset, including fonts.
- weads reads issues only through `bd --readonly ... --json`. It never writes to
  a beads store.
- weads detects store changes with a cheap file signature check and runs `bd`
  only after a change. It pushes change notices to the browser over
  Server-Sent Events (SSE). It does not poll `bd`.
- A project registry: the user adds a directory as a project only when `bd`
  resolves a beads workspace for it, and can remove projects. The registry
  persists in the user config directory.
- A directory browser and a native folder picker (macOS) for adding projects.
- The approved design as the web UI: board with epic swimlanes, list, dependency
  graph by waves, detail panel, command palette, keyboard navigation, and
  shareable URLs.
- The theme follows the operating system light or dark setting.

## Capabilities

### New Capabilities

- `local-server`: Packaging as one executable, the localhost HTTP surface, and
  its protection against cross-site and DNS-rebinding requests.
- `beads-reading`: How weads reads issues and comments from a beads workspace
  through `bd`, and the issue data it serves.
- `live-updates`: How weads detects store changes and pushes them to open
  browsers.
- `project-registry`: Adding, validating, listing, persisting, and removing
  projects, including directory browsing and the native picker.
- `issue-views`: What the UI shows: computed states, board, list, graph, detail,
  filters, palette, keyboard, URL state, and system theme.

### Modified Capabilities

None. This is the first change in the project.

## Impact

- New Go module `weads` with a `main` package and `internal/` packages. The only dependency beyond the standard library is
  `golang.org/x/sync` for `errgroup`.
- Runtime dependency: a `bd` binary on `PATH` (tested with bd 1.3.4).
- weads writes only its own registry file under the user config directory.
- Each refresh is one `bd` command. bd usage metrics count it unless the user
  sets `BD_DISABLE_METRICS=1` or `DO_NOT_TRACK=1` when starting weads.
