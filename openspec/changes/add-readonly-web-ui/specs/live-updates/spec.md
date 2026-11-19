# Spec Delta

## Purpose

Defines how weads notices that a beads store changed and how it tells open
browsers, without polling `bd` and without slowing agents that write the store.

## ADDED Requirements

### Requirement: Store signature check

weads SHALL check each registered embedded store every 2.5 seconds by computing a
signature from file names and sizes under the store directory, plus the content
of files of 4 KiB or less. Lock files, Dolt temp files, and the journal index
(`journal.idx`) SHALL NOT count. File modification times SHALL NOT count.
Every bd read updates the times and rewrites the journal index in place.

#### Scenario: Read does not trigger

- **WHEN** weads or any other process runs a `bd` read on the store
- **THEN** the signature does not change and weads starts no refresh

#### Scenario: Check lands mid-rewrite

- **WHEN** a check runs while another reader is rewriting `journal.idx`
- **THEN** the signature is the same as before the read

#### Scenario: Write triggers

- **WHEN** an agent runs a `bd` command that writes the store
- **THEN** the signature changes within one check interval

### Requirement: Refresh only on change

weads SHALL run `bd` for a project only on the first load, after its signature
changes, and when a store has no embedded data directory (server mode), at most
once every 10 seconds. Refreshes for one project SHALL NOT overlap.

#### Scenario: Idle store

- **WHEN** no process writes the store for an hour
- **THEN** weads runs no `bd` command for that project after the first load

#### Scenario: Server-mode store

- **WHEN** a project's store has no embedded data directory
- **THEN** weads refreshes that project every 10 seconds

### Requirement: Change notices over SSE

`GET /api/events` SHALL be a Server-Sent Events stream. weads SHALL send an
`issues` event with the project id and new version when a refresh produces
different issue data, and a `projects` event when the registry or a project
summary changes. A refresh with identical data SHALL send no event.

#### Scenario: Agent closes an issue

- **WHEN** an agent closes an issue while the board is open
- **THEN** the browser receives an `issues` event, reloads the snapshot, and shows the issue as closed

#### Scenario: Same data

- **WHEN** the signature changes but the issue data is byte-identical
- **THEN** weads sends no `issues` event

### Requirement: Stream keepalive

weads SHALL send an SSE comment line at least every 25 seconds on each open
stream so proxies and browsers keep it open.

#### Scenario: Quiet period

- **WHEN** no change happens for 30 seconds
- **THEN** the stream has received at least one keepalive comment

### Requirement: Client resync

The UI SHALL reload the project list and current snapshot every time the event
stream opens, including after a reconnect, even when the snapshot version is
unchanged, because versions restart with the server. A reload SHALL keep the
current view, filters, selection, open issue, and scroll positions.

#### Scenario: Server restart

- **WHEN** weads restarts while the browser is open
- **THEN** the browser reconnects, reloads, and keeps the open issue and filters

#### Scenario: Change while the server is down

- **WHEN** an agent writes the store while weads is stopped, and the restarted weads reports the same version the browser holds
- **THEN** the browser still shows the new data after it reconnects

#### Scenario: Changed card

- **WHEN** a reload changes an issue's `updated_at`
- **THEN** the UI briefly highlights that issue's card or row, and the highlight survives a re-render from another event
