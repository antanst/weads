# Design

## Context

`guard` in `internal/server/server.go` calls `loopbackHost(r.Host)` and answers
403 otherwise. The `Server` struct never sees the `-addr` value; `main` keeps it
local.

## Goals / Non-Goals

- Goal: one trusted host name beyond loopback, taken from `-addr`.
- Non-Goal: per-interface allow lists, hostname resolution, wildcard-address
  handling (`-addr :7707` keeps loopback-only answers, as today).

## Decisions

- **Server field, not global.** `Server` gains a `host string` field; `New`
  takes it as a parameter. `main` splits `-addr` with `net.SplitHostPort` and
  passes the host part. Tests build `Server` directly, so no test helper
  signature changes.
- **One predicate.** `loopbackHost` becomes a `hostOK` method: loopback names
  pass as before, then `host == s.host`. An empty `s.host` matches nothing
  beyond loopback, which is exactly today's behavior for the default address.
  The empty-host case never differs because a listen host is always non-empty
  for a real dialable address.

## Risks / Trade-offs

- A user who binds `0.0.0.0` or `:7707` and reaches weads through another
  local IP still sees the 403. Rare; the fix for it (interface enumeration in
  the hot path) is not worth it now.
