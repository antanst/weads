# Tasks

## 1. Module setup

- [x] 1.1 Create `go.mod` (module `weads`), `Makefile` (`build`, `test`, `vet`, `run`), and the package folders, and verify `go build ./...` succeeds

## 2. bd adapter

- [x] 2.1 Implement `internal/bd` (`Where`, `List`, `Comments`, `Config`, `Version`) with a pinned environment (`BEADS_DIR`, `BD_DOLT_LOCAL_ONLY=1`, inherited `BEADS_DIR` removed), and verify with unit tests that run a fake `bd` script
- [x] 2.2 Convert bd list JSON to the API issue shape (P0 kept, `parent-child` dropped from deps, empty fields omitted), and verify with a unit test on a bd 1.3.4 fixture

## 3. Projects and live updates

- [x] 3.1 Implement the store signature (path, size, small-file content; skip locks, `temptf`, `journal.idx`, mtimes), and verify with a unit test that an mtime bump or journal index rewrite keeps it and a size or content change alters it
- [x] 3.2 Implement the registry file (load, atomic save, `-config` path) and the Manager add, remove, list, and id-suffix rules, and verify with unit tests for add, duplicate, subdirectory, non-beads, suffix, remove, and reload
- [x] 3.3 Implement the refresh loop (2.5 s check, refresh on change, 10 s fallback for server mode, no overlap, last good snapshot kept on error) and subscriber fan-out, and verify with a unit test that a store change produces exactly one `issues` event and identical data produces none
- [x] 3.4 Resolve the current actor (bd order) and Jira base URL per project, and verify with a unit test of the actor order

## 4. HTTP server

- [x] 4.1 Implement routes for projects, issues, comments, events (SSE with 25 s keepalive), directory browser, and macOS picker, and verify with `httptest` tests for status codes and payloads
- [x] 4.2 Implement the Host check, Origin check, and security headers, and verify with `httptest` tests for rebinding host, cross-site POST, missing Origin, and allowed requests
- [x] 4.3 Wire `main.go` (flags `-addr`, `-config`, `-bd`, positional dirs, graceful shutdown on SIGINT/SIGTERM), and verify by starting the binary against go-drip and mo and stopping it with Ctrl-C

## 5. Web UI

- [x] 5.1 Embed the assets and the Inter and JetBrains Mono WOFF2 fonts with their OFL text, and verify the binary serves them with no network
- [x] 5.2 Port the mockup to `web/` with the system theme (no toggle) and with mockup-only parts removed, and verify in headless Chrome in both color schemes
- [x] 5.3 Replace the data layer with API fetches and the SSE stream, keeping view state across reloads and highlighting changed issues, and verify that a server restart and a snapshot change keep the open issue and filters
- [x] 5.4 Add comments to the detail activity section, the actor-based Mine filter, and the Jira link from the snapshot, and verify on an issue fixture with comments
- [x] 5.5 Add the project selector (dialog with path input, directory browser, beads highlighting, macOS picker button, inline errors), sidebar removal with undo, and the empty state, and verify by adding and removing a project in the browser

## 6. Startup settings

- [x] 6.1 Implement `internal/config` (load `.env` without overriding set variables, read `WEADS_WORK_DIR` and `WEADS_PROJECTS`), and verify with unit tests for comments, quotes, `export`, environment precedence, a missing file, and a malformed line
- [x] 6.2 Move the bd marker check to `projects.UsesBeads`, add `projects.Scan` and a no-bd re-add of registered roots, and verify with unit tests for the scan filter and the re-add
- [x] 6.3 Wire the settings into `main.go` (configured projects fatal, scanned folders skipped with a warning, missing work folder noted), add the gitignored `.env` with `WEADS_WORK_DIR=~/.work` and `WEADS_PROJECTS=~/work/go-drip,~/work/mo`, and verify startup on a fresh and an existing registry

## 7. Integration check

- [x] 7.1 Run the binary on go-drip and mo, check board, list, graph, detail, palette, and keyboard against the specs in headless Chrome, confirm an idle store starts no bd process, and run `go vet ./...` and `go test ./...`
