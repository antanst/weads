# Spec Delta

## MODIFIED Requirements

### Requirement: Card content

Each card SHALL show the type icon, short id, priority, title, labels not
inherited from the parent epic, blocking link count, comment count, assignee,
age, and one reason line: the first open blocker and its state, a live agent
lease with time left, an expired lease, or the defer date. Cards SHALL NOT show
the close reason.
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

#### Scenario: Closed card

- **WHEN** a closed issue has a close reason
- **THEN** its card shows no reason line and the detail panel callout shows the close reason

### Requirement: List view

The list SHALL group issues by state in the order Ready, In progress, Blocked,
Deferred, Closed, with one dense row per issue showing priority, state, id,
type, title, reason, labels, epic, assignee, and age. The reason SHALL be
"waiting on" for blocked rows and "agent active" for live rows; rows SHALL NOT
show the close reason. The id SHALL show in full and SHALL NOT overlap the type
icon. When labels and the epic chip do not fit, labels SHALL hide first. The
title and age SHALL have tooltips with the full title and the measured time.

#### Scenario: Blocked row

- **WHEN** a blocked issue waits on two issues
- **THEN** its row says "waiting on" followed by both short ids

#### Scenario: Deep hierarchical id

- **WHEN** an issue has short id `tl5.5.17.2.13`
- **THEN** its row shows the whole id and the type icon does not cover any character of it

#### Scenario: Labels and epic

- **WHEN** an issue has two labels and a parent epic, and the row cannot fit all three
- **THEN** the epic chip stays visible and the labels that do not fit are hidden whole

#### Scenario: Closed row

- **WHEN** a closed issue has a close reason
- **THEN** its row shows no close reason text

#### Scenario: Age tooltip

- **WHEN** the user hovers the age of a closed row
- **THEN** the tooltip says "Closed" and the absolute close time, and for other rows it says "Updated" and the absolute update time

#### Scenario: Truncated title

- **WHEN** a row title is cut with an ellipsis and the user hovers it
- **THEN** the tooltip shows the full title

### Requirement: Filters

The UI SHALL filter by text, queue (state), epic, label, and the quick filters
Mine (assignee is the current actor), P0–P1, and Bugs. Active filters SHALL show
as removable chips, and `Esc` SHALL clear them when no panel is open. Sidebar
queue counts SHALL count only issues that match the active text, epic, label,
and quick filters, ignoring the queue filter.

#### Scenario: Mine

- **WHEN** the user turns on Mine
- **THEN** only issues assigned to the snapshot actor remain

#### Scenario: Queue counts follow filters

- **WHEN** the user turns on Bugs and the project has 9 ready bugs and 58 ready issues
- **THEN** the sidebar shows 9 next to Ready

#### Scenario: Queue counts ignore queue filter

- **WHEN** the user selects the Closed queue
- **THEN** the sidebar still shows counts for Ready, In progress, and Blocked

### Requirement: Shareable URL

The URL hash SHALL encode project, view, graph epic, epic, label, queue, text
filter, quick filters, and open issue, and loading that URL SHALL restore them.

#### Scenario: Reload

- **WHEN** the user reloads a URL with `view=graph` and `open=go-drip-dov.1`
- **THEN** the graph view shows with that issue's panel open

#### Scenario: Quick filter reload

- **WHEN** the user turns on Bugs in the list view and reloads the page
- **THEN** the list view shows with Bugs on and only bugs listed
