# Design

## Context

See proposal.md for motivation. The facts below come from bd 1.3.4 and its
source, measured on the go-drip workspace (22 issues).

- The embedded Dolt store in `.beads/embeddeddolt/` is the source of truth.
  `.beads/issues.jsonl` is only an optional export, so weads cannot rely on it.
- `bd --readonly list --all -n 0 --json` returns every issue field except
  comment text. It takes about 0.4 s and returns about 68 KB.
- A read-only bd open does not take bd's exclusive `embeddeddolt/.lock`. But
  the Dolt driver opens the database with exponential backoff (up to 5 s
  between tries) when another process holds it. So every bd read can delay an
  agent's write while the read is open. Reads must be rare.
- A `--readonly` read updates the modification time of `noms/manifest`,
  `noms/journal.idx`, and the journal file. It rewrites `journal.idx` in place,
  so its size drops for a moment during the read (seen at 131,072 and 212,992
  of 221,328 bytes). It changes no other size and not the manifest content. A
  write appends to the journal, so its size grows.
- `bd where --json` resolves the workspace from any subdirectory or worktree,
  and exits 1 with `no_beads_directory` when none exists.

## Goals / Non-Goals

**Goals:**

- Show a change made by an agent within about 3 s.
- Start no bd process while the store is idle.
- Keep the approved mockup's look and interaction exactly, minus mockup-only
  parts (fake lease, intro card, theme toggle, hardcoded user and Jira URL).

**Non-Goals:**

- Any write to a beads store, including comments or status changes.
- Remote access, accounts, or multi-user hosting.
- Windows and Linux native folder pickers (the in-app browser covers them).

## Decisions

### Read through `bd --json`, not Dolt directly

weads runs `bd --readonly <cmd> --json` with `BEADS_DIR` pinned per project.
bd owns the schema, the migration and drift checks, and the computed fields
(`parent`, `comment_count`). Opening Dolt directly would need cgo, the large
Dolt driver, and a copy of bd's schema knowledge. It would also hold the store
open longer.

Alternative considered: read `.beads/issues.jsonl` like beads-web does. Rejected
because the export is optional and can be stale.

### Detect changes with a file signature, not by polling bd

A loop runs every 2.5 seconds. For each embedded project it walks the store
directory and builds a signature from relative path and size of every file,
plus the content of files of 4 KiB or less (manifests, repo state). It skips
`LOCK`, `.lock`, `temptf/`, and `journal.idx`, and ignores modification times,
because reads change them. The journal index is derived from the journal, and
every write appends to the journal, so skipping the index hides no write.
weads runs bd only when the signature changes. The walk touches about ten
files, so the cost is negligible.

The journal index rule came from a live test. Another bd reader (a running
beads-web, polling every 15 s) made weads refresh go-drip in bursts of two or
three. A check had caught `journal.idx` mid-rewrite, saved that transient
signature, and then saw the settled file as a second change.

The order is: compute the signature, then refresh. A write that lands during a
refresh changes the next signature, so weads never misses it.

Alternatives considered:

- Poll bd every few seconds: each poll holds the store about 0.4 s and can delay
  agent writes. Rejected.
- fsnotify: a new dependency. Reads would still fire events through mtime
  changes, so weads would need the signature anyway. Rejected.

A store with no embedded data directory (server mode) cannot be signed. weads
refreshes it every 10 s. Server mode has no single-writer lock, so this does
not delay agents.

### Push change notices over SSE, then fetch

`GET /api/events` is a Server-Sent Events stream. It carries small
`projects` and `issues` notices. The browser then fetches the snapshot it
needs. weads encodes each snapshot to JSON once per refresh and serves those
bytes from memory. It compares the new issue bytes with the old ones, so a
refresh that changes nothing sends nothing.

Snapshot versions are per process and restart at 1. The browser therefore
refetches after every stream reconnect instead of trusting a matching version.

Alternatives considered: WebSocket (needs a dependency, two-way is not needed),
and sending whole snapshots on the stream (every client would get every
project's data).

### Packages

- `main.go`: flags, signal handling, wiring.
- `internal/bd`: runs bd and converts its JSON to the API issue shape.
- `internal/projects`: the registry file, per-project state, the refresh loop,
  the store signature, and the subscriber fan-out.
- `internal/server`: HTTP routes, security middleware, SSE, the directory
  browser, and the macOS picker.
- `web/`: `index.html`, `app.css`, `app.js`, fonts, and the `embed.FS`.

The HTTP layer depends only on `projects.Manager`. The manager depends on a
small `bd` client value. Tests replace the `bd` binary with a script.

### Frontend: vanilla JS, no build step

The approved mockup is already vanilla JS with string templates and renders a
project in a few milliseconds. It is ported into `web/app.js` with the data
layer swapped for API calls. A framework or bundler would add a build step and
weight without a gain.

### Fonts embedded, theme from the system

Inter and JetBrains Mono (both SIL OFL) are embedded as variable WOFF2 Latin
subsets, about 80 KB together, with their license text. The color tokens sit
on `:root` for dark, and a `prefers-color-scheme: light` media query overrides
them. The browser switches at once, with no JavaScript.

### Project identity and registry file

The registry file stores an ordered list of `{id, root}`. weads re-resolves each
entry with `bd where` on start, so it never trusts stale paths. The id is the
issue prefix, with a numeric suffix when taken. The current actor and the Jira
base URL are read once per resolve. A config change needs a restart.

### Security

weads checks the Host header on every request (against DNS rebinding) and the
Origin on every state-changing request (against CSRF). It sends a strict CSP.
The directory browser lists only directory names. Comment reads accept only ids
that exist in the snapshot, so no user text reaches bd as a flag.

## Risks / Trade-offs

- [A write that keeps every file size and small-file content the same would be
  missed] → The Dolt journal is append-only, and the manifest content changes
  on compaction. Server-mode stores use the timed refresh.
- [bd output changes in a later version] → Parsing uses named fields and
  ignores unknown ones. Unit tests pin the 1.3.4 shape.
- [A refresh can delay an agent write by up to one backoff step] → Refreshes
  happen only after a write and never overlap per project.
- [Each refresh counts in bd's usage metrics] → weads passes its environment
  through unchanged, so `BD_DISABLE_METRICS=1` or `DO_NOT_TRACK=1` on weads
  turns this off.
- [The osascript dialog can open behind the browser] → The script activates
  itself first, and the in-app browser remains available.

## Migration Plan

None. This is a new project.
