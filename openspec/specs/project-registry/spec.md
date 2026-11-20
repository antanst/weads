# project-registry Specification

## Purpose
Defines how the user chooses which beads projects weads shows: adding a
directory only when it uses beads, removing projects, and keeping the list
between runs.

## Requirements

### Requirement: Add a beads directory

`POST /api/projects` with a directory path SHALL run `bd --readonly where --json`
in that directory. When bd resolves a workspace, weads SHALL register the
directory that contains the resolved `.beads` and return the project. When bd
resolves none, weads SHALL respond 422 with bd's message and register nothing.

#### Scenario: Directory uses beads

- **WHEN** the user adds `~/work/go-drip`
- **THEN** weads registers project `go-drip` with root `~/work/go-drip` and starts loading it

#### Scenario: Subdirectory of a project

- **WHEN** the user adds `~/work/go-drip/openspec`
- **THEN** weads registers the project rooted at `~/work/go-drip`

#### Scenario: Directory without beads

- **WHEN** the user adds `/tmp`
- **THEN** weads responds 422 with "No active beads workspace found." and the registry is unchanged

#### Scenario: Path is not a directory

- **WHEN** the user adds a path that does not exist or is a file
- **THEN** weads responds 422 and runs no `bd` command

### Requirement: Path input forms

The add endpoint SHALL accept absolute paths and paths that start with `~/`,
and SHALL clean them before use.

#### Scenario: Home-relative path

- **WHEN** the user adds `~/work/mo/`
- **THEN** weads resolves it to the absolute path of `mo` in the home directory

### Requirement: No duplicates

Adding a directory whose resolved `.beads` is already registered SHALL return
the existing project with HTTP 200 and SHALL NOT add a second entry.

#### Scenario: Add twice

- **WHEN** the user adds `~/work/go-drip` a second time
- **THEN** the registry still has one `go-drip` project

### Requirement: Stable project ids

A project id SHALL be the workspace issue prefix. When that id is already taken,
weads SHALL append `-2`, `-3`, and so on. The id SHALL stay the same across runs.

#### Scenario: Two checkouts of one repo

- **WHEN** the user adds two checkouts whose prefix is `go-drip`
- **THEN** their ids are `go-drip` and `go-drip-2`

### Requirement: Remove a project

`DELETE /api/projects/{id}` SHALL remove the project from the registry, stop its
watcher, and leave its files untouched.

#### Scenario: Remove

- **WHEN** the user removes `mo`
- **THEN** `mo` no longer appears in the project list after a restart, and `~/work/mo/.beads` is unchanged

### Requirement: Persistent registry

weads SHALL save the registry as JSON at `<user config dir>/weads/projects.json`
after each add or remove, writing a temp file and renaming it. A `-config` flag
SHALL override the path. On start, weads SHALL load and re-resolve every saved
project.

#### Scenario: Restart

- **WHEN** the user restarts weads
- **THEN** the same projects appear in the same order

#### Scenario: Project moved away

- **WHEN** a saved project directory no longer resolves a workspace
- **THEN** weads keeps the entry, shows it with its error, and lets the user remove it

### Requirement: Add from the command line

Each positional argument to `weads` SHALL be added as a project before serving.
A directory that does not use beads SHALL make weads exit with an error.

#### Scenario: CLI add

- **WHEN** the user runs `weads ~/work/mo`
- **THEN** `mo` is registered and appears in the UI

### Requirement: Settings from .env

weads SHALL read its startup settings from the environment. A `.env` file in the
current directory SHALL fill in variables the environment does not already set.

#### Scenario: Environment wins

- **WHEN** the environment sets `WEADS_WORK_DIR` and `.env` sets it too
- **THEN** weads uses the environment value

### Requirement: Configured projects

weads SHALL add each folder in the comma-separated `WEADS_PROJECTS` at startup,
before the work folder and positional arguments. A folder that is not a beads
project SHALL make weads exit with an error naming the setting. Re-adding a
registered, resolved project SHALL run no `bd` command.

#### Scenario: Configured projects

- **WHEN** `.env` sets `WEADS_PROJECTS=~/work/go-drip,~/work/mo`
- **THEN** both are registered after startup

#### Scenario: Restart with configured projects

- **WHEN** weads restarts and every configured project is already registered
- **THEN** startup runs `bd where` only to re-resolve the saved projects

### Requirement: Work folder scan

At startup weads SHALL add each top-level, non-hidden folder of `WEADS_WORK_DIR`
that holds a bd project marker, without looking deeper. A scanned folder that
fails to resolve SHALL be skipped with a warning. When the setting is unset or
the folder does not exist, weads SHALL skip the scan.

#### Scenario: Work folder scan

- **WHEN** `WEADS_WORK_DIR=~/work` and only `~/work/go-drip` and `~/work/mo` hold beads markers
- **THEN** weads adds those two and runs `bd where` for no other folder

#### Scenario: Missing work folder

- **WHEN** `WEADS_WORK_DIR=~/.work` and that folder does not exist
- **THEN** weads prints a note, scans nothing, and starts

### Requirement: Directory browser

`GET /api/fs?path=` SHALL list the subdirectories of a directory, sorted by name,
skipping hidden ones. It SHALL mark each whose `.beads` directory holds a bd
project marker (`metadata.json`, `config.yaml`, `embeddeddolt/`, or `dolt/`),
return the parent path, and default to the home directory. It SHALL list
directories only, never file names or contents. The mark is a hint. Adding a
project still resolves it with `bd where`.

#### Scenario: Browse work folder

- **WHEN** the user browses `~/work`
- **THEN** the response lists its subdirectories and marks `go-drip` and `mo` as beads projects

#### Scenario: bd's own state folder

- **WHEN** the user browses `~` and `~/.beads` holds only bd's metrics state
- **THEN** the home directory is not marked as a beads project

### Requirement: Registered folders in the browser

`GET /api/fs` SHALL return the project id for the browsed directory and for each
marked subdirectory whose path, after resolving symlinks, is a registered
project root.

#### Scenario: Already added

- **WHEN** the user browses `~/work` and `go-drip` is registered as project `go-drip`
- **THEN** the `go-drip` entry carries project id `go-drip`

### Requirement: Native folder picker

On macOS, `POST /api/pick` SHALL open the system folder chooser and return the
chosen path, or HTTP 204 when the user cancels. On other systems the project
list SHALL report the picker as unavailable and the UI SHALL hide its button.

#### Scenario: Pick in Finder

- **WHEN** the user clicks "Choose in Finder…" and selects `~/work/mo`
- **THEN** the UI receives that path and adds it as a project

### Requirement: Project selector UI

The UI SHALL offer "Add project" from the sidebar, the palette, and the empty
state. The dialog SHALL accept a typed path, browse directories, and highlight
beads projects. A folder that is already a project SHALL show "added" and an
"Open" action that switches to it. After an add, the UI SHALL switch to the new
project. Each sidebar project SHALL offer removal.

#### Scenario: First run

- **WHEN** the registry is empty
- **THEN** the UI shows an empty state with an "Add project" action

#### Scenario: Add error

- **WHEN** the user submits a directory without beads
- **THEN** the dialog shows bd's message inline and stays open
