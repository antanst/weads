# Proposal

## Why

The host guard in the web server accepts only loopback `Host` headers. A user
who starts `weads -addr 192.168.1.10:7707` and opens `http://192.168.1.10:7707`
gets HTTP 403 with the body "weads only answers on localhost", although weads
listens on that address. The guard ignores the configured listen address.

## What Changes

- The host check accepts the host part of the `-addr` listen address in
  addition to the loopback names. The DNS-rebinding guard stays.
- `main` passes the listen host to the server.
- No API, flag, or default-address change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-server`: the Host header check requirement now also accepts the
  listen address host.

## Impact

- `internal/server/server.go`: guard host check, `Server` gains the listen host.
- `main.go`: derive the host from `-addr` and pass it to `server.New`.
- `internal/server/server_test.go`: new cases for the listen-address host.
