# Spec Delta

## Purpose

Defines what the weads UI shows for a beads project: computed issue states,
the board, list, and graph views, the detail panel, filters, palette, keyboard
control, shareable URLs, and the system-driven theme.

## ADDED Requirements

### Requirement: Computed state

The UI SHALL give each issue one state: Closed when status is `closed`; In
progress when status is `in_progress` or `hooked`; Deferred when `deferred`;
Blocked when status is `blocked` or an open issue it depends on through
`blocks`, `conditional-blocks`, or `waits-for` is not closed; otherwise Ready.

#### Scenario: Open blocker

- **WHEN** issue A is `open` and has a `blocks` dependency on open issue B
- **THEN** A shows as Blocked with "Waiting on B"

#### Scenario: Blocker closed

- **WHEN** B closes
- **THEN** A shows as Ready with "Unblocked … ago"

### Requirement: Board view

The board SHALL show columns Ready, In progress, Blocked, Deferred (only when a
deferred issue exists), and Closed. Swimlanes by epic SHALL be on by default and
toggle with `s`. A hairline that fades to the right SHALL separate each lane from
the one above it. A project with no epics SHALL show one flat board with the
swimlane toggle disabled. Ready SHALL sort like `bd ready`: priority, then
created time, then id. Closed SHALL show the 3 most recent per lane with a "+N
more" control.

#### Scenario: Ready order

- **WHEN** two ready issues have priority 1 and 2
- **THEN** the priority 1 issue appears first

#### Scenario: Completed epic lane

- **WHEN** every child of an epic is closed
- **THEN** that lane starts collapsed and shows "all closed"

#### Scenario: No epics

- **WHEN** the project has issues but no epic
- **THEN** the board shows no lane header and the swimlane toggle is disabled

### Requirement: Card content

Each card SHALL show the type icon, short id, priority, title, labels not
inherited from the parent epic, blocking link count, comment count, assignee,
age, and one reason line: the first open blocker and its state, the close
reason, a live agent lease with time left, an expired lease, or the defer date.
Labels that do not fit on one line SHALL be hidden whole, never cut mid-label.

#### Scenario: Snoozed issue

- **WHEN** a deferred issue has `defer_until` set
- **THEN** its card shows "Until" followed by that date

#### Scenario: Live lease

- **WHEN** an in-progress issue has `lease_expires_at` in the future
- **THEN** its card shows a pulsing dot and "Agent active · lease Nm left"

#### Scenario: Expired lease

- **WHEN** an in-progress issue has `lease_expires_at` in the past
- **THEN** its card shows "Claimed … ago · lease expired"

### Requirement: Epic progress beads

The UI SHALL draw epic progress as a string of beads, one per child, colored by
child state and ordered by wave, in the sidebar, lane headers, graph header, and
detail panel.

#### Scenario: Partly done epic

- **WHEN** an epic has 2 closed and 3 open children
- **THEN** its bead string shows 2 filled closed beads and 3 open beads, with "2/5"

### Requirement: List view

The list SHALL group issues by state in the order Ready, In progress, Blocked,
Deferred, Closed, with one dense row per issue showing priority, state, id,
type, title, reason, labels, epic, assignee, and age.

#### Scenario: Blocked row

- **WHEN** a blocked issue waits on two issues
- **THEN** its row says "waiting on" followed by both short ids

### Requirement: Graph view

The graph SHALL show one epic's children in waves, where an issue's wave is the
length of the longest chain of in-epic blocking dependencies before it. Edges
SHALL be solid when satisfied and dashed when still blocking. Hovering a node
SHALL highlight everything upstream and downstream of it.

#### Scenario: Skipped wave

- **WHEN** an edge goes from wave 0 to wave 2
- **THEN** the edge routes through a reserved gap in wave 1 and never passes behind a card

#### Scenario: No epics

- **WHEN** the project has no epic with children
- **THEN** the graph view shows an empty state

### Requirement: Detail panel

Opening an issue SHALL show a side panel with title, state, priority, type,
assignee, a state callout, properties, description, acceptance criteria,
design, notes, children by wave for epics, dependencies, activity with comments,
and a copyable `bd show <id>` command. Bead ids in text SHALL open that issue.

#### Scenario: Closed issue

- **WHEN** the user opens a closed issue
- **THEN** the callout leads with when it closed and its close reason

#### Scenario: Deferred issue

- **WHEN** the user opens a deferred issue
- **THEN** the callout shows "Deferred until" and the date when `defer_until` is set, and otherwise says the issue waits for `bd undefer`

#### Scenario: Comments

- **WHEN** the user opens an issue with comments
- **THEN** the activity section lists each comment with author, age, and text

#### Scenario: Jira ref

- **WHEN** an issue has external ref `jira-ABC-1` and the project has a Jira base URL
- **THEN** the panel shows an `ABC-1` link to that Jira issue

### Requirement: Filters

The UI SHALL filter by text, queue (state), epic, label, and the quick filters
Mine (assignee is the current actor), P0–P1, and Bugs. Active filters SHALL show
as removable chips, and `Esc` SHALL clear them when no panel is open.

#### Scenario: Mine

- **WHEN** the user turns on Mine
- **THEN** only issues assigned to the snapshot actor remain

### Requirement: Empty views

When filters hide every issue, the view SHALL say that nothing matches and
offer "Clear filters". When the project has no issues, or only epics, the view
SHALL say so and SHALL NOT offer to clear filters.

#### Scenario: Nothing matches

- **WHEN** the text filter matches no issue
- **THEN** the view shows "No issues match" with a "Clear filters" button

#### Scenario: New project

- **WHEN** project `empty` has no issues
- **THEN** the view shows "No issues in empty yet"

### Requirement: Responsive layout

The top bar and status bar SHALL fit the main area at every window width from
1024 px up, with the detail panel open or closed. They SHALL drop key hints,
view labels, quick filters, and status hints as the main area narrows, before
they cut the project name. The detail panel width SHALL scale with the window
between 420 px and 580 px.

#### Scenario: Narrow window with detail open

- **WHEN** the window is 1024 px wide and the detail panel is open
- **THEN** the top bar does not overflow and the project name shows in full

### Requirement: Command palette

`⌘K` or `Ctrl+K` SHALL open a fuzzy palette over issues, views, queues,
projects, and "Add project", showing recently updated issues when empty.

#### Scenario: Fuzzy search

- **WHEN** the user types "slack hand" in the palette
- **THEN** the issue whose title best matches those words is the first result

### Requirement: Keyboard control

The UI SHALL support `j`/`k` and arrows to move, `h`/`l` to change column,
`Enter` or `o` to open, `Esc` to close, `/` to filter, `1`/`2`/`3` for views,
`s` for swimlanes, `y` to copy the id, and `Backspace` to go back in the panel.

#### Scenario: Keyboard open

- **WHEN** the user presses `j` then `Enter` on the board
- **THEN** the first card is selected and its detail panel opens

### Requirement: Shareable URL

The URL hash SHALL encode project, view, graph epic, epic, label, queue, text
filter, and open issue, and loading that URL SHALL restore them.

#### Scenario: Reload

- **WHEN** the user reloads a URL with `view=graph` and `open=go-drip-dov.1`
- **THEN** the graph view shows with that issue's panel open

### Requirement: System theme

The UI SHALL use the dark palette when the system prefers dark and the light
palette when it prefers light, and SHALL switch at once when the system setting
changes. The UI SHALL offer no manual theme toggle.

#### Scenario: OS switches to light

- **WHEN** the operating system changes from dark to light while weads is open
- **THEN** the UI changes to the light palette without a reload

### Requirement: Render speed

The status bar SHALL show how many issues match and how long the last render
took. A render of a 200-issue project SHALL take under 16 ms on a recent laptop.

#### Scenario: Status bar

- **WHEN** a view renders
- **THEN** the status bar shows "N of M issues · rendered in X ms"
