# Proposal

## Why

A live review of the tripgim list view and its Bugs filter found display bugs. These bugs hide data, give wrong counts, and lose filter state. Hierarchical ids are drawn under the type icon, epic chips never show next to two labels, sidebar counts ignore the active filter, and a reload drops the Bugs filter.

## What Changes

- The list row shows the full issue id. The type icon does not cover the id, at any id depth (for example `tl5.5.17.2.13`).
- The list row keeps the epic chip visible when the issue also has labels. Labels give way before the epic chip.
- The list row title and age have tooltips. The title tooltip shows the full title, and the age tooltip says which timestamp the age measures.
- List rows and board cards no longer show the close reason. The close reason shows only in the detail panel callout.
- Sidebar queue counts follow the active text, epic, label, and quick filters. The queue filter does not apply to these counts.
- The URL hash encodes the active quick filters (Mine, P0–P1, Bugs), and loading the URL restores them.

Out of scope: avatar initials that collide, P1 and P2 priority icons that look alike, and the top bar that hides quick-filter state when the detail panel is open.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `issue-views`: changes the "List view", "Card content", "Filters", and "Shareable URL" requirements.

## Impact

- `web/app.js`: list row render, card reason line, sidebar queue counts, URL hash write and restore.
- `web/app.css`: list row grid and label column.
- No server, API, or data changes. Old URLs with no quick-filter key still load with no quick filter.
