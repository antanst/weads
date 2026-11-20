# Spec Delta

## Purpose

Defines how weads reads a beads workspace through the `bd` CLI without ever
writing to it, and the issue data that the API serves to the UI.

## ADDED Requirements

### Requirement: Read only through bd

weads SHALL read issue data only by running the `bd` executable with the global
`--readonly` flag and `--json` output. weads SHALL NOT open Dolt files itself
and SHALL NOT run any `bd` command that writes.

#### Scenario: Issue read

- **WHEN** weads loads a project
- **THEN** it runs `bd --readonly list --all -n 0 --json` for that project

### Requirement: Pinned workspace

Every `bd` command for a registered project SHALL run with `BEADS_DIR` set to the
project's resolved `.beads` directory and with `BD_DOLT_LOCAL_ONLY=1`. A
`BEADS_DIR` in the weads environment SHALL NOT redirect any project.

#### Scenario: Inherited BEADS_DIR

- **WHEN** weads starts with `BEADS_DIR=/other/.beads` in its environment
- **THEN** each project still reads its own `.beads` directory

### Requirement: Issue snapshot

`GET /api/projects/{id}/issues` SHALL return the latest issue snapshot from
memory without running `bd`. The snapshot SHALL contain the project id, a
version number, the load time, the current actor, the Jira base URL when one
is configured, and every issue.

#### Scenario: Cached read

- **WHEN** the browser requests the issues of a loaded project
- **THEN** weads responds from memory and starts no `bd` process

#### Scenario: Unknown project

- **WHEN** the browser requests issues for an id that is not registered
- **THEN** weads responds 404

### Requirement: Issue fields

Each issue SHALL carry id, title, status, priority, type, assignee, owner,
labels, parent, non-parent dependencies as type and target pairs, timestamps,
lease fields, external ref, spec id, comment count, description, acceptance
criteria, design, notes, and close reason. Empty values SHALL be omitted except
priority.

#### Scenario: P0 issue

- **WHEN** an issue has priority 0
- **THEN** the snapshot includes `"priority": 0`

#### Scenario: Parent link

- **WHEN** an issue has a `parent-child` dependency on an epic
- **THEN** the snapshot sets `parent` to the epic id and lists no `parent-child` pair in its dependencies

### Requirement: Current actor

The snapshot SHALL name the current actor with the same order bd uses:
`BEADS_ACTOR`, then `BD_ACTOR`, then `git config user.name` in the project
directory, then `USER`.

#### Scenario: Git identity

- **WHEN** no actor variable is set and the project's git `user.name` is `ann`
- **THEN** the snapshot actor is `ann`

### Requirement: Jira link base

When the project's bd config sets `jira.url`, the snapshot SHALL include it so
the UI can link `jira-<KEY>` external refs. When it is not set, the snapshot
SHALL omit it.

#### Scenario: No Jira config

- **WHEN** the project has no `jira.url` config
- **THEN** the snapshot has no Jira base URL and the UI shows the external ref as text

### Requirement: Comments on demand

`GET /api/projects/{id}/issues/{issueId}/comments` SHALL run
`bd --readonly comments <issueId> --json` and return author, text, and creation
time for each comment. weads SHALL reject an issue id that is not in the current
snapshot with 404 and SHALL NOT run `bd` for it.

#### Scenario: Unknown issue id

- **WHEN** the browser requests comments for `--help`
- **THEN** weads responds 404 and runs no `bd` command

### Requirement: Read failure keeps last data

When a `bd` read fails, weads SHALL keep serving the last good snapshot and SHALL
report the error text on the project until a later read succeeds.

#### Scenario: Store temporarily unreadable

- **WHEN** a refresh fails after an earlier load succeeded
- **THEN** the snapshot is unchanged and the project list shows the error
