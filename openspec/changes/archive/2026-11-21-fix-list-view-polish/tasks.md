# Tasks

The web UI has no JavaScript test suite. Verify each task in a browser against a project with hierarchical ids, labels, epics, and bugs (for example tripgim).

## 1. List row layout

- [x] 1.1 Size the list row id column to fit the longest short id in `web/app.css` (`.row` grid and the 560 px container-query variant). Verify: row `tl5.5.17.2.13` shows the whole id and `.r-id` right edge is left of the `.ti` icon left edge.
- [x] 1.2 Keep the epic chip visible in `.r-labels` when labels do not fit. Labels hide whole first. Verify: every `tl5.5.x` row with `dragonbane-core-gap` and `openspec` shows its epic chip, and no label is cut mid-word.
- [x] 1.3 Add a `title` with the full title to `.r-t`, and a `title` of "Closed <abs time>" or "Updated <abs time>" to `.c-age` in `renderList` (`web/app.js`). Verify: hover a cut title and a closed row age in the browser.

## 2. Close reason only in the detail panel

- [x] 2.1 Remove the close-reason branch from `rowWhy` and from `why` in `web/app.js`. Keep the detail panel callout. Verify: no closed list row or board card shows close-reason text, and opening a closed issue still shows the reason in the callout.

## 3. Sidebar queue counts follow filters

- [x] 3.1 Count sidebar queues with `match(i, true)` in `renderSidebar` (`web/app.js`). Verify: with Bugs on, the sidebar shows the same Ready / In progress / Closed counts as the list group headers. With the Closed queue selected, the other queues still show counts.

## 4. Quick filters in the URL

- [x] 4.1 Write the active quick filters to the hash in `writeHash`. Read them back in the first-snapshot restore, and accept only `mine`, `urgent`, and `bugs` (`web/app.js`). Verify: turn on Bugs, reload, and the list shows only bugs with the Bugs chip on. A URL with no quick key loads with no quick filter. A URL with an unknown quick value ignores that value.

## 5. Integration

- [x] 5.1 Run `make vet test`, rebuild, and walk the list and board views on tripgim with Bugs on and off and with the detail panel open. Verify: every scenario in the `issue-views` delta holds, and the status bar render time does not regress from the pre-change baseline (46.5 ms for 264 issues in headless Chromium).
