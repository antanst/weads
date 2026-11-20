# Spec Delta

## Purpose

Defines how weads ships as one executable and how its localhost HTTP surface
protects the user's machine from other websites and other hosts.

## ADDED Requirements

### Requirement: Single executable

weads SHALL ship as one executable that serves the complete web UI and API.
The executable SHALL embed every frontend asset, including fonts, so the UI
works with no network access and no files beside the binary.

#### Scenario: Offline start

- **WHEN** the user runs the weads executable on a machine with no network
- **THEN** weads serves the full UI with the approved fonts and no external requests

### Requirement: Loopback listen address

weads SHALL listen on `127.0.0.1:7707` by default. An `-addr` flag SHALL change
the listen address. On start, weads SHALL print the URL to open.

#### Scenario: Default start

- **WHEN** the user runs `weads` with no flags
- **THEN** weads listens on `127.0.0.1:7707` and prints `http://127.0.0.1:7707`

#### Scenario: Port in use

- **WHEN** the listen address is already in use
- **THEN** weads exits with a non-zero status and an error that names the address

### Requirement: Host header check

weads SHALL reject every request whose `Host` header is not a loopback name
(`localhost`, `127.0.0.1`, or `[::1]`, with any port) with HTTP 403. This
blocks DNS-rebinding attacks.

#### Scenario: Rebinding host

- **WHEN** a request arrives with `Host: evil.example:7707`
- **THEN** weads responds 403 and does not run the handler

#### Scenario: Loopback host

- **WHEN** a request arrives with `Host: localhost:7707`
- **THEN** weads serves the request

### Requirement: Same-origin state changes

weads SHALL reject a request with any method other than GET or HEAD with HTTP
403 unless its `Origin` header equals `http://` plus the request `Host`.

#### Scenario: Cross-site form post

- **WHEN** a page on another origin posts to `/api/projects`
- **THEN** weads responds 403 and the registry does not change

#### Scenario: Missing origin

- **WHEN** a POST request has no `Origin` header
- **THEN** weads responds 403

### Requirement: Restrictive browser policy

weads SHALL send a Content-Security-Policy that allows scripts, fonts, and
connections only from its own origin, and SHALL send `X-Content-Type-Options:
nosniff` and `Referrer-Policy: no-referrer` on every response.

#### Scenario: Security headers

- **WHEN** the browser loads `/`
- **THEN** the response carries the Content-Security-Policy, `nosniff`, and `no-referrer` headers

### Requirement: Graceful shutdown

On SIGINT or SIGTERM, weads SHALL stop accepting requests, close open event
streams, and exit with status 0 within 5 seconds.

#### Scenario: Ctrl-C

- **WHEN** the user presses Ctrl-C while a browser has an event stream open
- **THEN** weads closes the stream and exits with status 0
