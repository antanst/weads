(() => {
'use strict';
let NOW = Date.now();
const BLOCKING = new Set(['blocks', 'conditional-blocks', 'waits-for']);
const ST = {
  ready: { name: 'Ready' }, progress: { name: 'In progress' }, blocked: { name: 'Blocked' },
  deferred: { name: 'Deferred' }, closed: { name: 'Closed' },
};
const BEAD_ORDER = { closed: 0, progress: 1, ready: 2, blocked: 3, deferred: 4 };
const PNAME = ['critical', 'high', 'medium', 'low', 'backlog'];
const TNAME = { bug: 'Bug', feature: 'Feature', task: 'Task', epic: 'Epic', chore: 'Chore', decision: 'Decision', spike: 'Spike', story: 'Story', milestone: 'Milestone' };
const VNAME = { board: 'Board', list: 'List', graph: 'Graph' };
const QNAME = { mine: 'Assigned to me', urgent: 'P0–P1', bugs: 'Bugs' };

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const ts = t => (t ? Date.parse(t) || 0 : 0);
const cmpT = (a, b) => ts(a) - ts(b);

function rel(t) {
  if (!t) return '';
  const s = (NOW - ts(t)) / 1000, a = Math.abs(s);
  return a < 60 ? Math.round(a) + 's' : a < 3600 ? Math.round(a / 60) + 'm' : a < 86400 ? Math.round(a / 3600) + 'h' : Math.round(a / 86400) + 'd';
}
const fmtAbs = t => (t ? new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const remain = t => Math.max(1, Math.round((ts(t) - NOW) / 60000)) + 'm';

/* ---------- icons ---------- */
const IC = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  board: '<rect x="3.5" y="4" width="4.5" height="16" rx="1.5"/><rect x="9.75" y="4" width="4.5" height="10" rx="1.5"/><rect x="16" y="4" width="4.5" height="13" rx="1.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  graph: '<circle cx="5" cy="6" r="2.4"/><circle cx="5" cy="18" r="2.4"/><circle cx="19" cy="12" r="2.4"/><path d="M7.4 6c5.2 0 3.8 6 9.2 6M7.4 18c5.2 0 3.8-6 9.2-6"/>',
  lanes: '<rect x="3" y="4" width="18" height="6.5" rx="2"/><rect x="3" y="13.5" width="18" height="6.5" rx="2"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  chevr: '<path d="m9 6 6 6-6 6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V5.5A2.5 2.5 0 0 1 7.5 3H15"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  reply: '<path d="M15 10l5 5-5 5"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/>',
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  alert: '<path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>',
  folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z"/>',
  finder: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 4v16M8 9v1.5M16 9v1.5M8 15.5c2.2 1.5 5.8 1.5 8 0"/>',
};
const TI = {
  bug: '<path d="M9 7.5V6a3 3 0 1 1 6 0v1.5"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6z"/><path d="M12 20v-9M6 13H2.5M21.5 13H18M6.5 9C4.6 8.8 3 7.2 3 5M17.5 9c1.9-.2 3.5-1.8 3.5-4M6.8 17c-2.1.1-3.8 1.9-3.8 4M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
  feature: '<path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"/>',
  task: '<rect x="4" y="4" width="16" height="16" rx="4.5"/>',
  epic: '<path d="M12 2.5 2.5 7.2 12 12l9.5-4.8z"/><path d="m2.5 12 9.5 4.8 9.5-4.8"/><path d="m2.5 16.8 9.5 4.7 9.5-4.7"/>',
  chore: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
  decision: '<path d="M12 2.5 21.5 12 12 21.5 2.5 12z"/><path d="M12 8v4.5M12 15.8v.2"/>',
  spike: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  story: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  milestone: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
};
const ic = (n, cls = '', s = 14) => `<svg class="ic ${cls}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
const tico = (t, s = 14) => `<svg class="ti" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--t-${esc(t)},var(--text-3))" aria-label="${esc(TNAME[t] || t)}">${TI[t] || TI.task}</svg>`;
function sicon(st, s = 14) {
  const c = `var(--${st})`, o = `<svg class="si" width="${s}" height="${s}" viewBox="0 0 16 16" aria-label="${ST[st].name}">`;
  if (st === 'ready') return o + `<circle cx="8" cy="8" r="6" fill="none" stroke="${c}" stroke-width="1.7"/></svg>`;
  if (st === 'progress') return o + `<circle cx="8" cy="8" r="6" fill="none" stroke="${c}" stroke-width="1.7"/><path d="M8 4.6a3.4 3.4 0 0 1 0 6.8z" fill="${c}"/></svg>`;
  if (st === 'blocked') return o + `<circle cx="8" cy="8" r="6" fill="none" stroke="${c}" stroke-width="1.7"/><path d="M5.4 8h5.2" stroke="${c}" stroke-width="1.9" stroke-linecap="round"/></svg>`;
  if (st === 'closed') return o + `<circle cx="8" cy="8" r="7" fill="${c}"/><path d="m5.2 8.2 1.9 1.9 3.8-3.9" fill="none" stroke="var(--on-closed)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return o + `<circle cx="8" cy="8" r="6" fill="none" stroke="${c}" stroke-width="1.7" stroke-dasharray="2.4 2.2"/></svg>`;
}
function prio(p, s = 14) {
  if (p === 0) return `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 16 16" aria-label="P0"><rect x="1.5" y="1.5" width="13" height="13" rx="3.5" fill="var(--blocked)"/><path d="M8 4.6v4.1M8 11.3v.2" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/></svg>`;
  const filled = { 1: 3, 2: 2, 3: 1 }[p] || 0;
  return `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 16 16" aria-label="P${p}" style="color:var(--text-2)">${[0, 1, 2].map(k => `<rect x="${2 + k * 4.5}" y="${13.5 - (4.5 + k * 3.5)}" width="3" height="${4.5 + k * 3.5}" rx="1" fill="${k < filled ? 'currentColor' : 'var(--text-4)'}"/>`).join('')}</svg>`;
}
const LOGO = (s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="var(--logo-stem)" stroke-width="2.3" stroke-linecap="round"><path d="M12 22.6Q10.2 14.6 4.2 9.8"/><path d="M12 22.6V4.2"/><path d="M12 22.6Q13.8 14.6 19.8 9.8"/></g><circle cx="4.2" cy="9.8" r="3.8" fill="var(--closed)"/><circle cx="12" cy="4.2" r="3.8" fill="var(--progress)"/><circle cx="19.8" cy="9.8" r="3.8" fill="var(--ready)"/></svg>`;

/* ---------- server data ---------- */
// META is the project list; SNAP is the current project's snapshot; P is the model built from it.
let META = { bd_version: '', picker: false, projects: [] };
let SNAP = null, P = null, LIVE = false;
// State from the URL waits here until its project's first snapshot arrives.
let pendingHash = new URLSearchParams(location.hash.slice(1));
const summary = id => META.projects.find(p => p.id === id);

async function api(method, path, body) {
  const r = await fetch(path, { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error((j && j.error) || `${r.status} ${r.statusText}`), { status: r.status });
  return { status: r.status, body: j };
}
const get = async path => (await api('GET', path)).body;

// serial runs fn one at a time and coalesces calls made meanwhile into one rerun.
function serial(fn) {
  let busy = false, again = false;
  return async function run() {
    if (busy) { again = true; return; }
    busy = true;
    try { do { again = false; await fn(); } while (again); }
    catch (e) { console.error(e); }
    finally { busy = false; }
  };
}

const loadProjects = serial(async () => {
  META = await get('/api/projects');
  if (!S.p || !summary(S.p)) {
    const want = pendingHash && pendingHash.get('p');
    resetProject((want && summary(want) ? want : META.projects[0]?.id) || null);
  }
  const s = summary(S.p);
  if (s && s.loaded && (!SNAP || SNAP.version !== s.version)) await loadSnapshot();
  else render();
});

const loadSnapshot = serial(async () => {
  const id = S.p, s = summary(id);
  if (!s || !s.loaded) return render();
  try {
    const snap = await get(`/api/projects/${enc(id)}/issues`);
    if (id === S.p) applySnapshot(snap);
  } catch (e) {
    if (e.status !== 503 && e.status !== 404) toast(esc(e.message));
  }
});

function connect() {
  const es = new EventSource('/api/events');
  // Versions restart with the server, so a reconnect must refetch even when they match.
  es.onopen = () => { LIVE = true; syncLive(); if (SNAP) SNAP.version = null; loadProjects(); };
  es.onerror = () => { LIVE = false; syncLive(); };
  es.addEventListener('projects', () => loadProjects());
  es.addEventListener('issues', e => { if (JSON.parse(e.data).project === S.p) loadSnapshot(); });
}

/* ---------- model ---------- */
const S = { p: null, view: 'board', lanes: true, q: '', epic: null, label: null, queue: null, quick: new Set(), sel: null, open: null, hist: [], collapsed: new Set(), moreClosed: new Set(), graphEpic: null, nav: [] };

function model(snap, sum) {
  const issues = snap.issues, byId = new Map();
  issues.forEach(i => {
    i.type = i.issue_type;
    i.deps = (i.dependencies || []).map(d => [d.type, d.depends_on_id]);
    i.children = []; i.blocksOut = []; i.refsIn = [];
    byId.set(i.id, i);
  });
  issues.forEach(i => {
    if (i.parent && byId.has(i.parent)) byId.get(i.parent).children.push(i.id);
    i.deps.forEach(([t, on]) => {
      const b = byId.get(on);
      if (!b) return;
      if (BLOCKING.has(t)) b.blocksOut.push(i.id); else b.refsIn.push([t, i.id]);
    });
  });
  issues.forEach(i => {
    i.openBlockers = i.deps.filter(([t]) => BLOCKING.has(t)).map(([, on]) => byId.get(on)).filter(b => b && b.status !== 'closed');
    i.state = i.status === 'closed' ? 'closed'
      : i.status === 'in_progress' || i.status === 'hooked' ? 'progress'
      : i.status === 'deferred' ? 'deferred'
      : i.status === 'blocked' || i.openBlockers.length ? 'blocked' : 'ready';
  });
  const jira = /^https?:\/\//.test(snap.jira_url || '') ? snap.jira_url : '';
  return {
    id: snap.project, name: sum.name, path: sum.display, issues, byId, prefix: sum.name + '-',
    items: issues.filter(i => i.type !== 'epic'), epics: issues.filter(i => i.type === 'epic'),
    actor: snap.actor || '', jira,
  };
}
const short = id => (id.startsWith(P.prefix) ? id.slice(P.prefix.length) : id);
const isLive = i => i.state === 'progress' && i.lease_expires_at && ts(i.lease_expires_at) > NOW;
const blockingDeps = i => i.deps.filter(([t]) => BLOCKING.has(t));
const SORT = {
  ready: (a, b) => a.priority - b.priority || cmpT(a.created_at, b.created_at) || a.id.localeCompare(b.id),
  progress: (a, b) => cmpT(a.started_at || a.updated_at, b.started_at || b.updated_at),
  blocked: (a, b) => a.priority - b.priority || cmpT(a.created_at, b.created_at),
  deferred: (a, b) => a.priority - b.priority,
  closed: (a, b) => cmpT(b.closed_at, a.closed_at),
};

// Wave = longest chain of in-epic blocking edges leading to the issue.
function waveMap(epicId) {
  const e = P.byId.get(epicId), set = new Set(e ? e.children : []), memo = new Map();
  const depth = id => {
    if (memo.has(id)) return memo.get(id);
    memo.set(id, 0);
    let d = 0;
    for (const [t, on] of P.byId.get(id).deps) if (BLOCKING.has(t) && set.has(on)) d = Math.max(d, depth(on) + 1);
    memo.set(id, d);
    return d;
  };
  set.forEach(depth);
  return memo;
}

function match(i, ignoreQueue) {
  if (S.epic && i.parent !== S.epic) return false;
  if (S.label && !(i.labels || []).includes(S.label)) return false;
  if (S.queue && !ignoreQueue && i.state !== S.queue) return false;
  if (S.quick.has('mine') && (!P.actor || i.assignee !== P.actor)) return false;
  if (S.quick.has('urgent') && i.priority > 1) return false;
  if (S.quick.has('bugs') && i.type !== 'bug') return false;
  if (S.q) {
    const hay = (i.id + ' ' + i.title + ' ' + (i.labels || []).join(' ')).toLowerCase();
    if (!S.q.toLowerCase().split(/\s+/).every(w => hay.includes(w))) return false;
  }
  return true;
}

/* ---------- small renderers ---------- */
function hl(s) {
  let out = esc(s);
  if (!S.q) return out;
  for (const w of S.q.split(/\s+/).filter(Boolean)) {
    const re = new RegExp('(' + esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    out = out.replace(re, '<mark>$1</mark>');
  }
  return out;
}
const LHUES = [212, 152, 38, 268, 332, 188, 14, 98, 290, 56];
function lcolor(l) { let h = 0; for (const c of l) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${LHUES[h % LHUES.length]} 62% 58%)`; }
const lbl = l => `<span class="lbl${l === 'human' ? ' human' : ''}${S.label === l ? ' on' : ''}" style="--lc:${lcolor(l)}" data-act="label" data-arg="${esc(l)}" title="Filter by label">${l === 'human' ? ic('user', '', 10) : ''}${hl(l)}</span>`;
function avatar(a) {
  if (!a) return '';
  let h = 0; for (const c of a) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  return `<span class="av" style="--ah:${h % 360}" title="${esc(a)}">${esc(a.slice(0, 2).toUpperCase())}</span>`;
}
// Labels inherited from the parent epic are noise on child cards.
function shownLabels(i) {
  const inherited = new Set((i.parent && P.byId.get(i.parent)?.labels) || []);
  return (i.labels || []).filter(l => !inherited.has(l)).sort((a, b) => (b === 'human') - (a === 'human'));
}
function labelChips(i, max = 3) {
  const ls = shownLabels(i);
  return ls.slice(0, max).map(lbl).join('') + (ls.length > max ? `<span class="lbl-more">+${ls.length - max}</span>` : '');
}
function beadString(eid, max = 40) {
  const e = P.byId.get(eid), wm = waveMap(eid);
  const kids = e.children.map(id => P.byId.get(id)).sort((a, b) => wm.get(a.id) - wm.get(b.id) || BEAD_ORDER[a.state] - BEAD_ORDER[b.state]);
  return `<span class="beads" aria-label="${kids.filter(k => k.state === 'closed').length} of ${kids.length} closed">${kids.slice(0, max).map(k => `<i class="b b-${k.state}" title="${esc(short(k.id) + ' · ' + ST[k.state].name + ' · ' + k.title)}"></i>`).join('')}</span>`;
}
function ring(done, total, s = 14) {
  const r = 5.5, c = 2 * Math.PI * r, f = total ? done / total : 0;
  return `<svg class="ring" width="${s}" height="${s}" viewBox="0 0 14 14"><circle cx="7" cy="7" r="${r}" fill="none" stroke="var(--border-2)" stroke-width="2"/><circle cx="7" cy="7" r="${r}" fill="none" stroke="var(--closed)" stroke-width="2" stroke-dasharray="${(c * f).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 7 7)" stroke-linecap="round"/></svg>`;
}
const doneOf = e => e.children.filter(id => P.byId.get(id).state === 'closed').length;

function why(i) {
  if (i.state === 'blocked') {
    const b = i.openBlockers;
    if (!b.length) return `<div class="c-why blocked">Status set to blocked</div>`;
    return `<div class="c-why blocked"><span>Waiting on <span class="mono ref" data-open="${esc(b[0].id)}">${esc(short(b[0].id))}</span></span><span class="w-st">${sicon(b[0].state, 11)}${ST[b[0].state].name.toLowerCase()}</span>${b.length > 1 ? `<span class="faint">+${b.length - 1}</span>` : ''}</div>`;
  }
  if (i.state === 'closed' && i.close_reason) return `<div class="c-why">${ic('reply', '', 12)}<span class="clamp2">${esc(i.close_reason)}</span></div>`;
  if (i.state === 'progress') {
    if (isLive(i)) return `<div class="c-why live-row"><span class="live"></span>Agent active · lease ${remain(i.lease_expires_at)} left</div>`;
    if (i.lease_expires_at) return `<div class="c-why stale">${ic('clock', '', 12)}<span>Claimed ${rel(i.started_at)} ago · lease expired</span></div>`;
  }
  if (i.state === 'ready') {
    const blk = blockingDeps(i).map(([, on]) => P.byId.get(on)).filter(Boolean);
    if (blk.length) return `<div class="c-why ready">${ic('check', '', 12)}<span>Unblocked ${rel(blk.map(b => b.closed_at).sort().pop())} ago</span></div>`;
  }
  if (i.state === 'deferred' && i.defer_until) return `<div class="c-why">${ic('clock', '', 12)}<span>Until ${fmtAbs(i.defer_until)}</span></div>`;
  return '';
}
function meta(i) {
  const links = blockingDeps(i).length + i.blocksOut.length;
  const ep = !S.lanes && i.parent && P.byId.get(i.parent);
  const ls = labelChips(i);
  return `<div class="c-meta">${ls ? `<span class="c-lbls">${ls}</span>` : ''}${ep ? `<span class="epic-chip">${tico('epic', 11)}${esc(trunc(ep.title, 24))}</span>` : ''}<span class="sp"></span>`
    + (links ? `<span class="m-dep" title="${links} blocking links">${ic('link', '', 12)}${links}</span>` : '')
    + (i.comment_count ? `<span class="m-dep" title="${i.comment_count} comments">${ic('msg', '', 12)}${i.comment_count}</span>` : '')
    + `${avatar(i.assignee)}<span class="c-age" title="Updated ${esc(fmtAbs(i.updated_at))}">${rel(i.updated_at)}</span></div>`;
}
const cls = i => `st-${i.state}${S.sel === i.id ? ' sel' : ''}${S.open === i.id ? ' opened' : ''}`;
const card = i => `<div class="card ${cls(i)}" data-id="${esc(i.id)}">
  <div class="c-top">${tico(i.type)}<span class="c-id mono">${esc(short(i.id))}</span>${isLive(i) ? '<span class="live" title="Agent lease active"></span>' : ''}<span class="sp"></span><span title="P${i.priority} · ${PNAME[i.priority]}">${prio(i.priority)}</span></div>
  <div class="c-title">${hl(i.title)}</div>${why(i)}${meta(i)}</div>`;
const filtered = () => !!(S.queue || S.epic || S.label || S.q || S.quick.size);
const empty = () => filtered()
  ? `<div class="empty">${ic('search', '', 22)}<b>No issues match</b><span>Try a different filter.</span><button class="chip-btn" data-act="clear" data-arg="all">Clear filters</button></div>`
  : `<div class="empty">${ic('board', '', 22)}<b>${P.epics.length ? 'Only epics so far' : `No issues in ${esc(P.name)} yet`}</b><span>New issues show up here within seconds of <code>bd create</code>.</span></div>`;

/* ---------- board ---------- */
function laneGroups(items) {
  const m = new Map();
  for (const i of items) { const k = i.parent && P.byId.has(i.parent) ? i.parent : '_none'; if (!m.has(k)) m.set(k, []); m.get(k).push(i); }
  const lanes = [...m].map(([key, its]) => ({ key, epic: key === '_none' ? null : P.byId.get(key), items: its }));
  const open = L => L.items.some(i => i.state !== 'closed');
  return lanes.sort((a, b) => (!a.epic) - (!b.epic) || open(b) - open(a) || (a.epic && b.epic ? a.epic.priority - b.epic.priority || cmpT(b.epic.updated_at, a.epic.updated_at) : 0));
}
function laneHead(L) {
  const coll = S.collapsed.has(L.key);
  const tg = `<button class="lane-tg" data-act="lane" data-arg="${esc(L.key)}" title="Collapse lane">${ic('chev', coll ? 'rot' : '')}</button>`;
  if (!L.epic) return `<div class="lane-head"><div class="lh-in">${tg}<span class="lane-title muted">No epic</span><span class="lane-n">${L.items.length}</span></div></div>`;
  const e = L.epic, n = e.children.length, done = doneOf(e);
  return `<div class="lane-head"><div class="lh-in">${tg}${tico('epic')}<span class="lane-title" data-open="${esc(e.id)}" title="Open epic">${esc(e.title)}</span><span class="mono faint">${esc(short(e.id))}</span>${beadString(e.id)}<span class="lane-n">${done}/${n}</span>${coll ? `<span class="faint small">· ${n - done ? n - done + ' open' : 'all closed'}</span>` : ''}</div></div>`;
}
function renderBoard(items) {
  let cols = ['ready', 'progress', 'blocked', 'closed'];
  if (P.items.some(i => i.state === 'deferred')) cols.splice(3, 0, 'deferred');
  if (S.queue) cols = [S.queue];
  const nav = cols.map(() => []), lanes = S.lanes && P.epics.length > 0;
  let h = `<div class="board${cols.length === 1 ? ' one' : ''}${lanes ? '' : ' flat'}" style="--cols:${cols.length}">` + cols.map(c => `<div class="col-head">${sicon(c)}<span>${ST[c].name}</span><span class="count">${items.filter(i => i.state === c).length}</span>${c === 'ready' ? '<span class="sub">bd ready order</span>' : ''}</div>`).join('');
  for (const L of lanes ? laneGroups(items) : [{ key: '_all', items }]) {
    if (lanes) h += laneHead(L);
    if (lanes && S.collapsed.has(L.key)) continue;
    cols.forEach((c, ci) => {
      let list = L.items.filter(i => i.state === c).sort(SORT[c]), more = 0;
      const mk = L.key + ':' + c;
      if (c === 'closed' && list.length > 3 && !S.moreClosed.has(mk)) { more = list.length - 3; list = list.slice(0, 3); }
      list.forEach(i => nav[ci].push(i.id));
      h += `<div class="cell">${list.map(card).join('')}${more ? `<button class="more" data-act="more" data-arg="${esc(mk)}">+${more} more closed</button>` : ''}${list.length ? '' : '<div class="empty-cell"></div>'}</div>`;
    });
  }
  S.nav = nav;
  return h + '</div>';
}

/* ---------- list ---------- */
function rowWhy(i) {
  if (i.state === 'blocked' && i.openBlockers.length) return `<span class="r-why blocked">waiting on ${esc(i.openBlockers.map(b => short(b.id)).join(', '))}</span>`;
  if (isLive(i)) return `<span class="r-why" style="color:var(--ready)">agent active</span>`;
  if (i.state === 'closed' && i.close_reason) return `<span class="r-why">${esc(i.close_reason)}</span>`;
  return '';
}
function renderList(items) {
  const nav = [];
  let h = '<div class="list">';
  for (const s of ['ready', 'progress', 'blocked', 'deferred', 'closed']) {
    const g = items.filter(i => i.state === s).sort(SORT[s]);
    if (!g.length) continue;
    h += `<div class="grp">${sicon(s)}<span>${ST[s].name}</span><span class="count">${g.length}</span></div>`;
    for (const i of g) {
      nav.push(i.id);
      const ep = i.parent && P.byId.get(i.parent);
      h += `<div class="row ${cls(i)}" data-id="${esc(i.id)}"><span title="P${i.priority}">${prio(i.priority)}</span>${sicon(i.state)}<span class="mono r-id">${esc(short(i.id))}</span>${tico(i.type)}<span class="r-title"><span class="r-t">${hl(i.title)}</span>${rowWhy(i)}</span><span class="r-labels">${labelChips(i, 2)}${ep ? `<span class="epic-chip">${tico('epic', 11)}${esc(trunc(ep.title, 26))}</span>` : ''}</span>${avatar(i.assignee) || '<span></span>'}<span class="c-age">${rel(i.state === 'closed' ? i.closed_at : i.updated_at)}</span></div>`;
    }
  }
  S.nav = [nav];
  return h + '</div>';
}

/* ---------- graph ---------- */
let G = null;
function renderGraph() {
  const epics = P.epics.filter(e => e.children.length);
  if (!epics.length) { S.nav = []; return `<div class="empty">${ic('graph', '', 22)}<b>No epics with children in ${esc(P.name)}</b></div>`; }
  let e = P.byId.get(S.graphEpic || S.epic);
  if (!e || !e.children.length) e = epics.slice().sort((a, b) => b.children.length - a.children.length)[0];
  S.graphEpic = e.id;
  const wm = waveMap(e.id), set = new Set(e.children), kids = e.children.map(id => P.byId.get(id));
  const inBlk = k => blockingDeps(k).map(([, on]) => on).filter(on => set.has(on));
  const walk = (id, next) => { const seen = new Set(), st = [id]; while (st.length) for (const y of next(st.pop())) if (!seen.has(y)) { seen.add(y); st.push(y); } return seen; };
  const down = id => walk(id, x => P.byId.get(x).blocksOut.filter(y => set.has(y)));
  const up = id => walk(id, x => inBlk(P.byId.get(x)));
  G = { up, down };
  const maxD = Math.max(0, ...kids.map(k => wm.get(k.id)));
  const H = 70, GX = 36, GY = 12, PAD = 18, TOP = 34, DH = 6;
  const viewW = window.innerWidth - 248 - (S.open ? 580 : 0);
  const W = Math.max(168, Math.min(236, Math.floor((viewW - PAD * 2 - maxD * GX) / (maxD + 1))));
  // Layered layout: an edge that skips waves gets a placeholder in each skipped wave,
  // so it is routed through a reserved gap instead of behind unrelated cards.
  const layers = Array.from({ length: maxD + 1 }, () => []), preds = new Map(), chains = [];
  kids.forEach(k => { layers[wm.get(k.id)].push({ id: k.id, k }); preds.set(k.id, []); });
  kids.forEach(k => inBlk(k).forEach(bid => {
    const chain = [bid];
    for (let d = wm.get(bid) + 1; d < wm.get(k.id); d++) {
      const did = `~${bid}>${k.id}@${d}`;
      layers[d].push({ id: did, dummy: true }); preds.set(did, [chain[chain.length - 1]]); chain.push(did);
    }
    preds.get(k.id).push(chain[chain.length - 1]); chain.push(k.id); chains.push(chain);
  }));
  const nextWave = id => Math.min(Infinity, ...P.byId.get(id).blocksOut.filter(y => set.has(y)).map(y => wm.get(y)));
  const pos = new Map();
  layers.forEach((layer, d) => {
    if (d === 0) layer.sort((a, b) => nextWave(a.id) - nextWave(b.id) || down(b.id).size - down(a.id).size || BEAD_ORDER[a.k.state] - BEAD_ORDER[b.k.state]);
    else {
      layer.forEach(en => { const ys = preds.get(en.id).map(p => pos.get(p).cy); en.b = ys.reduce((s, v) => s + v, 0) / ys.length; });
      layer.sort((a, b) => a.b - b.b);
    }
    let y = TOP;
    layer.forEach(en => {
      const h = en.dummy ? DH : H, top = d === 0 ? y : Math.max(y, en.b - h / 2);
      pos.set(en.id, { x: PAD + d * (W + GX), y: top, cy: top + h / 2 });
      y = top + h + GY;
    });
  });
  const width = PAD * 2 + (maxD + 1) * W + maxD * GX;
  const height = Math.max(...[...pos.values()].map(p => p.y)) + H + PAD;
  let edges = '';
  chains.forEach(ch => {
    const pts = ch.map(id => pos.get(id)), from = ch[0], to = ch[ch.length - 1], st = P.byId.get(from).state;
    let d = `M${pts[0].x + W} ${pts[0].cy}`;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], x1 = a.x + W, mx = (x1 + b.x) / 2;
      d += `C${mx} ${a.cy} ${mx} ${b.cy} ${b.x} ${b.cy}`;
      if (k < pts.length - 1) d += `L${b.x + W} ${b.cy}`;
    }
    edges += `<path class="edge ${st === 'closed' ? 'sat' : 'open e-' + st}" data-from="${esc(from)}" data-to="${esc(to)}" d="${d}"/>`;
  });
  const cols = layers.map(layer => layer.filter(en => !en.dummy).map(en => en.k));
  const heads = cols.map((col, d) => `<div class="wave-h" style="left:${PAD + d * (W + GX)}px;width:${W}px">${col.every(k => k.state === 'closed') ? sicon('closed', 12) : ''}<span>Wave ${d}</span><span style="color:var(--text-4)">${col.length}</span>${col.some(k => k.state === 'ready') ? '<span class="next-tag">next up</span>' : ''}</div>`).join('');
  const nodes = kids.map(k => {
    const p = pos.get(k.id), human = (k.labels || []).includes('human');
    return `<div class="gnode ${cls(k)}${match(k, true) ? '' : ' nomatch'}" data-id="${esc(k.id)}" style="left:${p.x}px;top:${p.y}px;width:${W}px;height:${H}px"><div class="g-top">${sicon(k.state, 13)}<span class="mono">${esc(short(k.id))}</span>${tico(k.type, 12)}${isLive(k) ? '<span class="live"></span>' : ''}<span class="sp"></span>${human ? lbl('human') : ''}${avatar(k.assignee)}</div><div class="g-title">${hl(k.title)}</div></div>`;
  }).join('');
  S.nav = cols.map(col => col.slice().sort((a, b) => pos.get(a.id).y - pos.get(b.id).y).map(k => k.id));
  const counts = ['progress', 'ready', 'blocked'].map(s => [s, kids.filter(k => k.state === s).length]).filter(([, n]) => n);
  return `<div class="g-head">
    <div class="g-epics">${epics.map(x => `<button class="ep-pill${x.id === e.id ? ' on' : ''}" data-act="gepic" data-arg="${esc(x.id)}">${tico('epic', 12)}<span>${esc(trunc(x.title, 38))}</span><span class="faint">${doneOf(x)}/${x.children.length}</span></button>`).join('')}</div>
    <div class="g-sum"><span class="g-title-main" data-open="${esc(e.id)}">${esc(e.title)}</span>${beadString(e.id)}<span class="faint">${doneOf(e)}/${kids.length} closed</span>${counts.map(([s, n]) => `<span class="g-c">${sicon(s, 12)}${n} ${ST[s].name.toLowerCase()}</span>`).join('')}
      <span class="g-legend"><span><i class="lg"></i>satisfied</span><span><i class="lg open"></i>still blocking</span><span class="faint">waves computed from <code>blocks</code> edges</span></span></div>
  </div><div class="graph" id="graph" style="width:${width}px;height:${height}px"><svg class="edges" width="${width}" height="${height}">${edges}</svg>${heads}${nodes}</div>`;
}
function focusNode(id) {
  const g = $('#graph');
  if (!g || !G) return;
  const rel = new Set([id, ...G.up(id), ...G.down(id)]);
  g.classList.add('focus');
  g.querySelectorAll('.gnode').forEach(n => n.classList.toggle('hl', rel.has(n.dataset.id)));
  g.querySelectorAll('.edge').forEach(p => p.classList.toggle('hl', rel.has(p.dataset.from) && rel.has(p.dataset.to)));
}
const clearFocus = () => { const g = $('#graph'); g && g.classList.remove('focus'); };

/* ---------- markdown (tiny) ---------- */
function inline(s) {
  return s.replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\b[a-z][a-z0-9-]*-[a-z0-9]{3,8}(?:\.\d+)*\b/g, m => (P.byId.has(m) ? `<a class="ref" data-open="${m}">${esc(short(m))}</a>` : m));
}
function md(src) {
  if (!src) return '';
  const out = []; let para = [], list = null, code = null;
  const fp = () => { if (para.length) out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; };
  const fl = () => { if (list) out.push(`<${list.t}>${list.items.map(x => '<li>' + inline(x) + '</li>').join('')}</${list.t}>`); list = null; };
  for (const line of esc(src).split('\n')) {
    if (line.trim().startsWith('```')) { if (code) { out.push('<pre><code>' + code.join('\n') + '</code></pre>'); code = null; } else { fp(); fl(); code = []; } continue; }
    if (code) { code.push(line); continue; }
    let m;
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { fp(); if (!list || list.t !== 'ul') { fl(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { fp(); if (!list || list.t !== 'ol') { fl(); list = { t: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    if (!line.trim()) { fp(); fl(); continue; }
    if (list && /^\s{2,}/.test(line)) { list.items[list.items.length - 1] += ' ' + line.trim(); continue; }
    fl(); para.push(line);
  }
  fp(); fl();
  if (code) out.push('<pre><code>' + code.join('\n') + '</code></pre>');
  return out.join('');
}

/* ---------- detail ---------- */
const relRow = (x, tag = '') => `<div class="rel-row st-${x.state}" data-open="${esc(x.id)}">${sicon(x.state, 13)}<span class="mono r-id faint">${esc(short(x.id))}</span><span class="rel-t">${esc(x.title)}</span>${tag ? `<span class="rel-tag">${esc(tag)}</span>` : ''}${avatar(x.assignee)}</div>`;
const sec = (title, body, c = '') => (body ? `<section class="sec ${c}"><h3>${title}</h3><div class="md">${body}</div></section>` : '');
function extRef(i) {
  if (!i.external_ref) return '';
  const m = /^jira-(.+)$/.exec(i.external_ref);
  if (m && P.jira) return `<a class="ext" href="${esc(P.jira)}/browse/${enc(m[1])}" target="_blank" rel="noreferrer">${ic('ext', '', 11)}${esc(m[1])}</a>`;
  return `<span class="ext" title="${esc(i.external_ref)}">${esc(m ? m[1] : i.external_ref)}</span>`;
}
function callout(i) {
  if (i.type === 'epic' && i.children.length) {
    const ks = i.children.map(id => P.byId.get(id)), n = s => ks.filter(k => k.state === s).length;
    return `<div class="callout"><div class="co-h">${ring(doneOf(i), ks.length)}${doneOf(i)} of ${ks.length} children closed${beadString(i.id)}</div><div class="co-note">${['progress', 'ready', 'blocked'].filter(n).map(s => `${n(s)} ${ST[s].name.toLowerCase()}`).join(' · ') || 'Nothing open'}${i.status === 'closed' ? '' : ' · the epic stays open until it is closed explicitly'}</div></div>`;
  }
  if (i.state === 'closed') return `<div class="callout c-closed"><div class="co-h">${sicon('closed', 13)}Closed ${rel(i.closed_at)} ago<span class="faint" style="font-weight:400">· ${fmtAbs(i.closed_at)}</span></div>${i.close_reason ? `<div class="md">${md(i.close_reason)}</div>` : ''}</div>`;
  if (i.state === 'blocked') {
    const all = blockingDeps(i).length;
    if (!all) return `<div class="callout c-blocked"><div class="co-h">${sicon('blocked', 13)}Status set to blocked</div><div class="co-note">No open dependency blocks it. The stored status is <code>blocked</code>.</div></div>`;
    return `<div class="callout c-blocked"><div class="co-h">${sicon('blocked', 13)}Waiting on ${i.openBlockers.length} of ${all} blocker${all > 1 ? 's' : ''}</div>${i.openBlockers.map(b => relRow(b)).join('')}<div class="co-note">Computed from dependencies. The stored status is <code>${esc(i.status)}</code>.</div></div>`;
  }
  if (i.state === 'progress') {
    if (isLive(i)) return `<div class="callout c-progress"><div class="co-h"><span class="live"></span>Agent active · lease ${remain(i.lease_expires_at)} left</div><div class="co-note">Claimed by ${esc(i.assignee || '?')} · started ${rel(i.started_at)} ago · last heartbeat ${rel(i.heartbeat_at)} ago</div></div>`;
    if (i.lease_expires_at) return `<div class="callout c-stale"><div class="co-h">${ic('clock', '', 13)}In progress for ${rel(i.started_at)} · lease expired ${rel(i.lease_expires_at)} ago</div><div class="co-note">Claimed by ${esc(i.assignee || '?')}. No heartbeat since then, so <code>bd reclaim</code> could hand it to another agent.</div></div>`;
    return `<div class="callout c-stale"><div class="co-h">${ic('clock', '', 13)}In progress for ${rel(i.started_at || i.updated_at)}</div><div class="co-note">Claimed by ${esc(i.assignee || '?')} without an agent lease.</div></div>`;
  }
  if (i.state === 'ready') {
    const order = P.items.filter(x => x.state === 'ready').sort(SORT.ready);
    return `<div class="callout c-ready"><div class="co-h">${sicon('ready', 13)}Ready · #${order.indexOf(i) + 1} of ${order.length} in <code>bd ready</code> order</div><div class="co-note">Nothing blocks this issue.</div></div>`;
  }
  if (i.state === 'deferred') {
    const until = i.defer_until && ts(i.defer_until);
    const note = !until ? 'Set aside on purpose. <code>bd ready</code> skips it until someone runs <code>bd undefer</code>.'
      : until > NOW ? 'Snoozed. It returns to open once the date passes.' : 'The snooze has passed. The next <code>bd ready</code> returns it to open.';
    return `<div class="callout c-deferred"><div class="co-h">${sicon('deferred', 13)}${until ? `Deferred until ${fmtAbs(i.defer_until)}` : 'Deferred'}</div><div class="co-note">${note}</div></div>`;
  }
  return '';
}
function childrenSec(e) {
  if (!e.children.length) return '';
  const wm = waveMap(e.id), max = Math.max(...e.children.map(id => wm.get(id)));
  let h = `<section class="sec"><h3>Children <span class="faint">${doneOf(e)}/${e.children.length} closed</span><span class="sp"></span><button class="link-btn" data-act="graph" data-arg="${esc(e.id)}">${ic('graph', '', 12)}Open graph</button></h3>${beadString(e.id)}`;
  for (let d = 0; d <= max; d++) {
    const ks = e.children.map(id => P.byId.get(id)).filter(k => wm.get(k.id) === d).sort((a, b) => BEAD_ORDER[a.state] - BEAD_ORDER[b.state]);
    if (!ks.length) continue;
    if (max > 0) h += `<div class="wave-lbl">Wave ${d}</div>`;
    h += ks.map(k => relRow(k)).join('');
  }
  return h + '</section>';
}
function depsSec(i) {
  const bb = blockingDeps(i).map(([t, on]) => [t, P.byId.get(on)]).filter(([, x]) => x);
  const bl = i.blocksOut.map(id => P.byId.get(id));
  const rl = [...i.deps.filter(([t]) => !BLOCKING.has(t)).map(([t, on]) => [t, P.byId.get(on), '']), ...i.refsIn.map(([t, id]) => [t, P.byId.get(id), ' ←'])].filter(([, x]) => x);
  if (!bb.length && !bl.length && !rl.length) return '';
  let h = '<section class="sec"><h3>Dependencies</h3>';
  if (bb.length) h += `<div class="dep-lbl">Blocked by <span class="faint">${bb.length}</span></div>` + bb.map(([t, x]) => relRow(x, t !== 'blocks' ? t : x.state === 'closed' ? 'satisfied' : '')).join('');
  if (bl.length) h += `<div class="dep-lbl">Blocks <span class="faint">${bl.length}</span></div>` + bl.map(x => relRow(x)).join('');
  if (rl.length) h += `<div class="dep-lbl">Related</div>` + rl.map(([t, x, d]) => relRow(x, t + d)).join('');
  return h + '</section>';
}

// Comments load on demand and are cached per comment count, so a new comment refetches.
const CM = new Map();
function comments(i) {
  if (!i.comment_count) return '';
  const key = `${P.id}\n${i.id}\n${i.comment_count}`, c = CM.get(key);
  if (c === undefined) {
    CM.set(key, 'loading');
    const done = v => { CM.set(key, v); if (S.open === i.id) renderDetail(true); };
    get(`/api/projects/${enc(P.id)}/issues/${enc(i.id)}/comments`).then(done, done);
  }
  if (c === undefined || c === 'loading') return '<div class="cm-note">Loading comments…</div>';
  if (c instanceof Error) return `<div class="cm-note err">Could not load comments: ${esc(c.message)}</div>`;
  return `<div class="cms">${c.map(x => `<div class="cm">${avatar(x.author)}<div class="cm-b"><div class="cm-h"><b>${esc(x.author)}</b><span class="faint" title="${esc(fmtAbs(x.created_at))}">${rel(x.created_at)} ago</span></div><div class="md">${md(x.text)}</div></div></div>`).join('')}</div>`;
}
function timeline(i) {
  const n = i.comment_count || 0;
  const ev = [['created', 'Created', i.created_at, i.created_by ? 'by ' + i.created_by : ''], ['started', 'Started', i.started_at, i.assignee ? 'claimed by ' + i.assignee : ''], ['closed', 'Closed', i.closed_at, '']].filter(x => x[2]);
  return `<section class="sec"><h3>Activity <span class="faint">${n ? n + (n > 1 ? ' comments' : ' comment') : 'no comments'}</span></h3><ol class="tl">${ev.map(([k, nm, t, s]) => `<li class="k-${k}"><i></i><span class="tl-k">${nm}</span><span class="faint">${esc(s)}</span><span class="sp"></span><span class="faint" title="${esc(fmtAbs(t))}">${rel(t)} ago</span></li>`).join('')}</ol>${comments(i)}</section>`;
}
function notesSec(i, expanded) {
  if (!i.notes) return '';
  const long = i.notes.length > 700;
  return `<section class="sec notes${long ? ' long' : ''}${expanded ? ' expanded' : ''}"><h3>Notes <span class="faint">${i.notes.length.toLocaleString()} chars</span></h3><div class="md clip">${md(i.notes)}</div>${long ? '<button class="more" data-act="notes">Show all notes</button>' : ''}</section>`;
}
// keep=true re-renders the open issue in place (live update) without losing scroll.
function renderDetail(keep) {
  const app = $('#app'), el = $('#detail');
  const i = S.open && P && P.byId.get(S.open);
  writeHash();
  if (!i) { S.open = null; app.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); el.innerHTML = ''; return; }
  const old = el.querySelector('.d-inner'), top = keep && old ? old.scrollTop : 0;
  const expanded = keep && !!el.querySelector('.notes.expanded');
  app.classList.add('open'); el.setAttribute('aria-hidden', 'false');
  const ep = i.parent && P.byId.get(i.parent);
  const prop = (k, v) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : '');
  el.innerHTML = `<div class="d-inner">
    <div class="d-head">${S.hist.length ? `<button class="icon-btn sm" data-act="back" title="Back (⌫)">${ic('back')}</button>` : ''}${tico(i.type)}<span class="mono d-id">${esc(i.id)}</span><button class="icon-btn sm" data-act="copy" data-arg="${esc(i.id)}" title="Copy ID (Y)">${ic('copy', '', 13)}</button>${extRef(i)}<span class="sp"></span><span class="faint small">updated ${rel(i.updated_at)} ago</span><button class="icon-btn sm" data-act="close" title="Close (Esc)">${ic('x')}</button></div>
    <div class="d-body">
      ${ep ? `<div class="d-epic" data-open="${esc(ep.id)}">${tico('epic', 12)}<span class="t">${esc(ep.title)}</span>${beadString(ep.id, 24)}</div>` : ''}
      <h1 class="d-title">${esc(i.title)}</h1>
      <div class="pills">${i.type === 'epic' && i.status !== 'closed' ? `<span class="pill">${ring(doneOf(i), i.children.length)}Open</span>` : `<span class="pill st-${i.state}">${sicon(i.state)}${ST[i.state].name}</span>`}<span class="pill">${prio(i.priority)}P${i.priority} · ${PNAME[i.priority] || ''}</span><span class="pill">${tico(i.type)}${esc(TNAME[i.type] || i.type)}</span>${i.assignee ? `<span class="pill">${avatar(i.assignee)}${esc(i.assignee)}</span>` : '<span class="pill faint">Unassigned</span>'}</div>
      ${callout(i)}
      <dl class="props">${prop('Labels', (i.labels || []).map(lbl).join(''))}${prop('Epic', ep && `<a class="ref" data-open="${esc(ep.id)}">${tico('epic', 12)}${esc(trunc(ep.title, 52))}</a>`)}${prop('Spec', i.spec_id && `<code class="path">${esc(i.spec_id)}</code>`)}${prop('Owner', esc(i.owner || ''))}${prop('Created', `${rel(i.created_at)} ago <span class="faint">by ${esc(i.created_by || '?')}</span>`)}</dl>
      ${sec('Description', md(i.description))}
      ${sec('Acceptance criteria', md(i.acceptance_criteria), 'accept' + (i.state === 'closed' ? ' done' : ''))}
      ${sec('Design', md(i.design))}
      ${notesSec(i, expanded)}
      ${i.type === 'epic' ? childrenSec(i) : ''}
      ${depsSec(i)}
      ${timeline(i)}
      <div class="cli"><span class="faint">CLI</span><code>bd show ${esc(i.id)}</code><button class="icon-btn sm" data-act="copy" data-arg="bd show ${esc(i.id)}" title="Copy command">${ic('copy', '', 12)}</button></div>
    </div></div>`;
  el.querySelector('.d-inner').scrollTop = top;
}

/* ---------- chrome ---------- */
function renderSidebar() {
  const projs = META.projects.map(p => {
    const n = !p.loaded
      ? (p.error ? `<span class="n warn" title="${esc(p.error)}">${ic('alert', '', 12)}</span>` : '<span class="n">…</span>')
      : `<span class="n">${p.error ? `<span class="warn" title="${esc(p.error)}">${ic('alert', '', 12)}</span>&nbsp;` : ''}${p.issues - p.closed} open</span>`;
    return `<div class="sb-item proj${p.id === S.p ? ' on' : ''}" data-act="project" data-arg="${esc(p.id)}" title="${esc(p.display)}">${ring(p.closed, p.issues)}<span class="ell">${esc(p.name)}</span>${n}<button class="sb-x" data-act="rmproj" data-arg="${esc(p.id)}" title="Remove from weads">${ic('x', '', 12)}</button></div>`;
  }).join('');
  let h = `<div class="brand">${LOGO()}<b>weads</b><button class="kbtn" data-act="palette" title="Jump to (⌘K)">${ic('search', '', 13)}<kbd>⌘K</kbd></button></div>
  <div class="sb-sec"><div class="sb-h">Projects</div>${projs}<div class="sb-item sb-add" data-act="addp">${ic('plus', '', 12)}<span>Add project</span></div></div>`;
  if (P) {
    const c = s => P.items.filter(i => i.state === s).length;
    const labels = new Map();
    P.items.forEach(i => (i.labels || []).forEach(l => labels.set(l, (labels.get(l) || 0) + 1)));
    const epics = P.epics.slice().sort((a, b) => (doneOf(a) === a.children.length) - (doneOf(b) === b.children.length) || a.priority - b.priority);
    h += `<div class="sb-sec"><div class="sb-h">Queues</div>${['ready', 'progress', 'blocked', 'closed'].map(s => `<div class="sb-item${S.queue === s ? ' on' : ''}" data-act="queue" data-arg="${s}">${sicon(s)}<span>${ST[s].name}</span><span class="n">${c(s)}</span></div>`).join('')}</div>
    <div class="sb-sec"><div class="sb-h">Epics</div>${epics.map(e => `<div class="sb-item ep${S.epic === e.id ? ' on' : ''}${e.children.length && doneOf(e) === e.children.length ? ' done' : ''}" data-act="epic" data-arg="${esc(e.id)}" title="${esc(e.title)}">${tico('epic')}<span class="ell">${esc(e.title)}</span><span class="n">${doneOf(e)}/${e.children.length}</span>${e.children.length ? beadString(e.id, 18) : ''}</div>`).join('') || '<div class="sb-none">No epics</div>'}</div>
    ${labels.size ? `<div class="sb-sec"><div class="sb-h">Labels</div><div class="sb-labels">${[...labels].sort((a, b) => b[1] - a[1]).map(([l, n]) => `<span class="lbl${S.label === l ? ' on' : ''}${l === 'human' ? ' human' : ''}" style="--lc:${lcolor(l)}" data-act="label" data-arg="${esc(l)}">${l === 'human' ? ic('user', '', 10) : ''}${esc(l)}<span class="faint">${n}</span></span>`).join('')}</div></div>` : ''}`;
  }
  h += `<div class="sb-foot" title="Reads each store with bd --readonly and never writes">${ic('eye', '', 13)}Read-only<span class="sp"></span><span class="faint mono">${META.bd_version ? 'bd ' + esc(META.bd_version) : ''}</span></div>`;
  $('#sidebar').innerHTML = h;
}
function renderTopbar() {
  $('#topbar').innerHTML = `<div class="crumb"><span id="crumb-p"></span><span class="faint">/</span><span class="faint" id="crumb-v"></span></div>
  <label class="search">${ic('search', '', 14)}<input id="q" placeholder="Filter issues…" autocomplete="off" spellcheck="false"><kbd>/</kbd></label>
  <div class="quick">${Object.entries(QNAME).map(([k, v]) => `<button class="chip-btn" data-act="quick" data-arg="${k}">${k === 'mine' ? ic('user', '', 12) : ''}${k === 'mine' ? 'Mine' : v}</button>`).join('')}</div>
  <span class="sp"></span>
  <div class="seg">${['board', 'list', 'graph'].map((v, k) => `<button data-act="view" data-arg="${v}" title="${VNAME[v]} (${k + 1})">${ic(v, '', 13)}<span class="seg-t">${VNAME[v]}</span><kbd>${k + 1}</kbd></button>`).join('')}</div>
  <button class="icon-btn" id="lanes-btn" data-act="lanes" title="Swimlanes by epic (S)">${ic('lanes')}</button>`;
  $('#q').addEventListener('input', e => { S.q = e.target.value.trim(); render(); });
}
function syncTopbar() {
  const s = summary(S.p);
  $('#crumb-p').textContent = s ? s.name : 'weads';
  $('#crumb-v').textContent = VNAME[S.view];
  document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.arg === S.view));
  document.querySelectorAll('.quick .chip-btn').forEach(b => {
    b.classList.toggle('on', S.quick.has(b.dataset.arg));
    if (b.dataset.arg === 'mine') b.title = P && P.actor ? `Assigned to ${P.actor}` : 'Assigned to me';
  });
  const lb = $('#lanes-btn'), lanes = S.view === 'board' && !!P && P.epics.length > 0;
  lb.classList.toggle('on', S.lanes && lanes); lb.disabled = !lanes;
  if ($('#q').value.trim() !== S.q) $('#q').value = S.q;
}
function renderScope() {
  const chips = [];
  if (P) {
    if (S.queue) chips.push(['queue', sicon(S.queue, 12) + ST[S.queue].name]);
    if (S.epic) chips.push(['epic', tico('epic', 12) + esc(trunc(P.byId.get(S.epic).title, 44))]);
    if (S.label) chips.push(['label', 'Label: ' + esc(S.label)]);
    S.quick.forEach(q => chips.push(['quick:' + q, q === 'mine' && P.actor ? 'Assigned to ' + esc(P.actor) : QNAME[q]]));
    if (S.q) chips.push(['q', `“${esc(S.q)}”`]);
  }
  const el = $('#scopebar');
  el.innerHTML = chips.length ? `<span class="faint">Showing</span>${chips.map(([k, v]) => `<span class="scope-chip">${v}<button data-act="clear" data-arg="${k}" title="Remove">${ic('x', '', 11)}</button></span>`).join('')}<button class="link-btn" data-act="clear" data-arg="all">Clear all <kbd>esc</kbd></button>` : '';
  el.classList.toggle('on', chips.length > 0);
}
function renderStatus() {
  const k = (keys, label) => `<span>${keys.map(x => `<kbd>${x}</kbd>`).join('')} ${label}</span>`;
  $('#statusbar').innerHTML = `<span class="hints">${k(['j', 'k'], 'move')}${k(['h', 'l'], 'column')}${k(['↵'], 'open')}${k(['esc'], 'close')}${k(['/'], 'filter')}${k(['⌘K'], 'jump')}${k(['1', '2', '3'], 'views')}${k(['y'], 'copy id')}</span><span class="sp"></span><span id="perf"></span><span class="sync" id="sync-w"><span class="live"></span><span id="sync"></span></span>`;
}
function syncLive() {
  const w = $('#sync-w'), s = summary(S.p);
  w.classList.toggle('off', !LIVE);
  $('#sync').textContent = !LIVE ? 'Reconnecting…' : s ? `Live · watching ${s.display}/.beads` : 'Live';
  w.title = SNAP ? `Last change read ${fmtAbs(SNAP.loaded_at)}` : '';
}

function placeholder() {
  if (!META.projects.length) return `<div class="empty">${LOGO(40)}<b>Add a beads project</b><span>Pick a folder that uses beads. weads reads it with <code>bd --readonly</code> and never writes to it.</span><button class="btn primary" data-act="addp">${ic('plus', '', 13)}Add project</button><span class="faint small">You can also start weads with folders: <code>weads ~/work/my-project</code></span></div>`;
  const s = summary(S.p);
  if (s && s.error && !s.loaded) return `<div class="empty">${ic('alert', 'warn', 22)}<b>Cannot read ${esc(s.name)}</b><span class="mono small err-text">${esc(s.error)}</span><span class="faint small">${esc(s.display)}</span><button class="btn" data-act="rmproj" data-arg="${esc(s.id)}">Remove from weads</button></div>`;
  return `<div class="empty"><span class="spin"></span><b>Loading ${esc(s ? s.name : '')}…</b><span class="faint small">Reading with <code>bd --readonly</code></span></div>`;
}
function render() {
  NOW = Date.now();
  const t0 = performance.now();
  renderSidebar(); renderScope(); syncTopbar(); syncLive();
  const s = summary(S.p);
  $('#app').classList.toggle('idle', !META.projects.length || !!(s && s.error && !s.loaded));
  if (!P) { S.nav = []; $('#view').innerHTML = placeholder(); $('#perf').textContent = ''; writeHash(); return; }
  const items = P.items.filter(i => match(i));
  const banner = s && s.error ? `<div class="banner">${ic('alert')}<div><b>Showing the last good read.</b> The latest refresh failed.<span class="mono small">${esc(s.error)}</span></div></div>` : '';
  const html = S.view === 'graph' && P.issues.length ? renderGraph() : !items.length ? (S.nav = [], empty()) : S.view === 'list' ? renderList(items) : renderBoard(items);
  $('#view').innerHTML = banner + html;
  if (FLASH.size) paintFlash();
  const dt = performance.now() - t0;
  $('#perf').textContent = `${items.length} of ${P.items.length} issues · rendered in ${dt < 1 ? dt.toFixed(2) : dt.toFixed(1)} ms`;
  writeHash();
}
// Every view is a shareable URL.
function writeHash() {
  if (!S.p) { history.replaceState(null, '', location.pathname); return; }
  const h = new URLSearchParams({ p: S.p });
  if (S.view !== 'board') h.set('view', S.view);
  if (S.view === 'graph' && S.graphEpic) h.set('g', S.graphEpic);
  for (const k of ['epic', 'label', 'queue', 'q', 'open']) if (S[k]) h.set(k, S[k]);
  history.replaceState(null, '', '#' + h);
}

/* ---------- live data ---------- */
function resetProject(id) {
  S.p = id; P = null; SNAP = null;
  Object.assign(S, { epic: null, label: null, queue: null, sel: null, open: null, hist: [], graphEpic: null, moreClosed: new Set(), collapsed: new Set() });
  renderDetail();
}
function applySnapshot(snap) {
  const sum = summary(snap.project);
  if (!sum || snap.project !== S.p || (SNAP && SNAP.version === snap.version)) return;
  const prev = P && P.byId;
  SNAP = snap; P = model(snap, sum);
  if (!prev) {
    S.collapsed = new Set(P.epics.filter(e => e.children.length && doneOf(e) === e.children.length).map(e => e.id));
    const H = pendingHash && pendingHash.get('p') === S.p ? pendingHash : null;
    pendingHash = null;
    let open = null;
    if (H) {
      const known = id => (id && P.byId.has(id) ? id : null);
      Object.assign(S, {
        view: VNAME[H.get('view')] ? H.get('view') : 'board', graphEpic: known(H.get('g')), epic: known(H.get('epic')),
        label: H.get('label'), queue: ST[H.get('queue')] ? H.get('queue') : null, q: H.get('q') || '',
      });
      open = known(H.get('open'));
    }
    render();
    if (open) openIssue(open);
    return;
  }
  // A live update keeps every bit of view state; only references to vanished issues are dropped.
  for (const k of ['epic', 'graphEpic', 'sel', 'open']) if (S[k] && !P.byId.has(S[k])) S[k] = null;
  S.hist = S.hist.filter(id => P.byId.has(id));
  const changed = P.issues.filter(i => { const o = prev.get(i.id); return !o || o.updated_at !== i.updated_at; }).map(i => i.id);
  render();
  renderDetail(true);
  if (changed.length <= 40) { const t = performance.now(); changed.forEach(id => FLASH.set(id, t)); paintFlash(); }
}
// Changed issues stay highlighted across re-renders until the animation ends (1.8 s, as in app.css).
const FLASH = new Map();
function paintFlash() {
  const now = performance.now();
  for (const [id, t] of FLASH) {
    if (now - t > 1800) { FLASH.delete(id); continue; }
    document.querySelectorAll(`#view [data-id="${CSS.escape(id)}"]`).forEach(n => { n.classList.add('flash'); n.style.animationDelay = `${t - now}ms`; });
  }
}

/* ---------- actions ---------- */
function setView(v) { S.view = v; if (v === 'graph' && S.epic) S.graphEpic = S.epic; $('#view').scrollTo(0, 0); render(); }
function switchProject(id) {
  if (id === S.p && P) return;
  resetProject(id); render(); loadSnapshot();
}
function openIssue(id, push) {
  if (!P || !P.byId.has(id)) return;
  if (push && S.open && S.open !== id) S.hist.push(S.open); else if (!push) S.hist = [];
  S.open = id;
  if (P.byId.get(id).type !== 'epic') select(id, false, true);
  renderDetail(); markOpened();
}
function closeDetail() { S.open = null; S.hist = []; renderDetail(); markOpened(); }
function markOpened() { document.querySelectorAll('[data-id].opened').forEach(n => n.classList.remove('opened')); if (S.open) { const n = document.querySelector(`[data-id="${CSS.escape(S.open)}"]`); n && n.classList.add('opened'); } }
function select(id, fromKey, reveal) {
  S.sel = id;
  document.querySelectorAll('[data-id].sel').forEach(n => n.classList.remove('sel'));
  const n = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (n) { n.classList.add('sel'); if (fromKey || reveal) n.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  if (fromKey && S.open) { S.open = id; S.hist = []; renderDetail(); markOpened(); }
}
function move(dy, dx) {
  const cols = S.nav.filter(c => c.length);
  if (!cols.length) return;
  let ci = cols.findIndex(c => c.includes(S.sel)), ri;
  if (ci < 0) { ci = 0; ri = 0; }
  else {
    ri = cols[ci].indexOf(S.sel);
    if (dx) { ci = Math.max(0, Math.min(cols.length - 1, ci + dx)); ri = Math.min(ri, cols[ci].length - 1); }
    else ri = Math.max(0, Math.min(cols[ci].length - 1, ri + dy));
  }
  select(cols[ci][ri], true);
}
function copy(text) { navigator.clipboard && navigator.clipboard.writeText(text).catch(() => {}); toast(`Copied <code>${esc(text)}</code>`); }
let toastT, toastAction = null;
function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${msg}</span>${action ? `<button data-act="toast">${esc(action.label)}</button>` : ''}`;
  toastAction = action ? action.run : null;
  t.classList.add('on'); clearTimeout(toastT);
  toastT = setTimeout(() => { t.classList.remove('on'); toastAction = null; }, action ? 6000 : 1400);
}
function clearFilter(k) {
  if (k === 'all') Object.assign(S, { epic: null, label: null, queue: null, q: '', quick: new Set() });
  else if (k.startsWith('quick:')) S.quick.delete(k.slice(6));
  else S[k] = k === 'q' ? '' : null;
  render();
}
const toggle = (k, v) => { S[k] = S[k] === v ? null : v; render(); };

async function addProject(path) {
  const r = await api('POST', '/api/projects', { path });
  pendingHash = null;
  await loadProjects();
  switchProject(r.body.id);
  toast(r.status === 201 ? `Added <b>${esc(r.body.name)}</b>` : `<b>${esc(r.body.name)}</b> is already in weads`);
}
async function removeProject(id) {
  const s = summary(id);
  if (!s) return;
  try { await api('DELETE', `/api/projects/${enc(id)}`); } catch (e) { return toast(esc(e.message)); }
  if (S.p === id) resetProject(null);
  await loadProjects();
  toast(`Removed <b>${esc(s.name)}</b> from weads. Its files are untouched.`, { label: 'Undo', run: () => addProject(s.path).catch(e => toast(esc(e.message))) });
}

function act(a, arg, el) {
  switch (a) {
    case 'view': return setView(arg);
    case 'lanes': S.lanes = !S.lanes; return render();
    case 'lane': S.collapsed.has(arg) ? S.collapsed.delete(arg) : S.collapsed.add(arg); return render();
    case 'more': S.moreClosed.add(arg); return render();
    case 'quick': S.quick.has(arg) ? S.quick.delete(arg) : S.quick.add(arg); return render();
    case 'queue': return P && toggle('queue', arg);
    case 'epic': if (S.view === 'graph') S.graphEpic = arg; return toggle('epic', arg);
    case 'gepic': S.graphEpic = arg; return render();
    case 'graph': S.graphEpic = arg; return setView('graph');
    case 'label': return toggle('label', arg);
    case 'project': return switchProject(arg);
    case 'rmproj': return removeProject(arg);
    case 'addp': return openAdd();
    case 'addp-close': return closeAdd();
    case 'fs-up': return AD.dir && AD.dir.parent && browse(AD.dir.parent);
    case 'fs-add': return addFromDialog(arg);
    case 'fs-open': return openFromDialog(arg);
    case 'pick': return pickFolder();
    case 'toast': { const run = toastAction; $('#toast').classList.remove('on'); toastAction = null; return run && run(); }
    case 'clear': return clearFilter(arg);
    case 'close': return closeDetail();
    case 'back': S.open = S.hist.pop(); renderDetail(); return markOpened();
    case 'copy': return copy(arg);
    case 'notes': return el.closest('.notes').classList.add('expanded');
    case 'palette': return openPal();
  }
}

/* ---------- palette ---------- */
const PAL = { open: false, idx: 0, items: [] };
function fuzzy(q, s) {
  q = q.toLowerCase(); const t = s.toLowerCase();
  const at = t.indexOf(q);
  if (at >= 0) return { score: 100 - Math.min(at, 40) + (at === 0 || /\W/.test(t[at - 1]) ? 30 : 0), idx: [...Array(q.length).keys()].map(k => at + k) };
  let j = 0, score = 0, prev = -2; const idx = [];
  for (let k = 0; k < t.length && j < q.length; k++) if (t[k] === q[j]) { idx.push(k); score += (k === prev + 1 ? 5 : 1) + (k === 0 || /\W/.test(t[k - 1]) ? 3 : 0); prev = k; j++; }
  return j === q.length ? { score, idx } : null;
}
function markIdx(s, idx) { if (!idx || !idx.length) return esc(s); const set = new Set(idx); return [...s].map((c, k) => (set.has(k) ? `<mark>${esc(c)}</mark>` : esc(c))).join(''); }
function palCompute() {
  const q = $('#pq').value.trim();
  const iss = P ? P.issues.map(i => ({ sec: 'Issues', i, label: i.title, sub: short(i.id), icon: i.type === 'epic' ? tico('epic') : sicon(i.state), run: () => { closePal(); openIssue(i.id); } })) : [];
  const cmds = [
    ...(P ? ['board', 'list', 'graph'].map((v, k) => ({ sec: 'Views', label: 'Go to ' + VNAME[v], icon: ic(v), hint: String(k + 1), run: () => { closePal(); setView(v); } })) : []),
    ...(P ? ['ready', 'progress', 'blocked', 'closed'].map(s => ({ sec: 'Queues', label: 'Show ' + ST[s].name.toLowerCase(), icon: sicon(s), run: () => { closePal(); S.queue = s; render(); } })) : []),
    ...META.projects.filter(p => p.id !== S.p).map(p => ({ sec: 'Projects', label: 'Switch to ' + p.name, sub: p.display, icon: ic('folder'), run: () => { closePal(); switchProject(p.id); } })),
    { sec: 'Actions', label: 'Add project…', icon: ic('plus'), run: () => { closePal(); openAdd(); } },
    ...(P ? [{ sec: 'Actions', label: 'Toggle swimlanes', icon: ic('lanes'), hint: 'S', run: () => { closePal(); S.lanes = !S.lanes; render(); } }] : []),
  ];
  if (!q) {
    const recent = iss.slice().sort((a, b) => cmpT(b.i.updated_at, a.i.updated_at)).slice(0, 6).map(x => ({ ...x, sec: 'Recently updated', html: esc(x.label) }));
    PAL.items = [...recent, ...cmds.map(c => ({ ...c, html: esc(c.label) }))];
  } else {
    const ql = q.toLowerCase(), hits = [], ch = [];
    for (const x of iss) { const f = fuzzy(q, x.label), idHit = x.i.id.toLowerCase().includes(ql); if (f || idHit) hits.push({ ...x, score: (f ? f.score : 0) + (idHit ? 90 : 0), html: markIdx(x.label, f && f.idx) }); }
    for (const c of cmds) { const f = fuzzy(q, c.label); if (f) ch.push({ ...c, sec: 'Commands', score: f.score, html: markIdx(c.label, f.idx) }); }
    PAL.items = [...hits.sort((a, b) => b.score - a.score).slice(0, 8), ...ch.sort((a, b) => b.score - a.score).slice(0, 5)];
  }
  PAL.q = q;
}
function palPaint() {
  let sec = '', h = '';
  PAL.items.forEach((it, k) => {
    if (it.sec !== sec) { sec = it.sec; h += `<div class="pal-sec">${sec}</div>`; }
    h += `<div class="pal-item${k === PAL.idx ? ' on' : ''}" data-pi="${k}">${it.icon}<span class="pal-l">${it.html}</span>${it.sub ? `<span class="pal-sub mono">${esc(it.sub)}</span>` : ''}${it.hint ? `<kbd>${it.hint}</kbd>` : ''}</div>`;
  });
  $('#pl').innerHTML = h || `<div class="pal-empty">No results for “${esc(PAL.q)}”</div>`;
  const on = $('#pl .on'); on && on.scrollIntoView({ block: 'nearest' });
}
function openPal() {
  PAL.open = true; $('#pal').hidden = false;
  $('#pal-foot').innerHTML = `<span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span><span class="sp"></span><span>${P ? `${P.issues.length} issues in ${esc(P.name)} · fuzzy` : 'fuzzy'}</span>`;
  const q = $('#pq'); q.value = ''; PAL.idx = 0; palCompute(); palPaint(); q.focus();
}
function closePal() { PAL.open = false; $('#pal').hidden = true; }
function palKey(e) {
  const n = PAL.items.length;
  if (e.key === 'Escape') { e.preventDefault(); closePal(); }
  else if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) { e.preventDefault(); PAL.idx = n ? (PAL.idx + 1) % n : 0; palPaint(); }
  else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) { e.preventDefault(); PAL.idx = n ? (PAL.idx - 1 + n) % n : 0; palPaint(); }
  else if (e.key === 'Enter') { e.preventDefault(); PAL.items[PAL.idx] && PAL.items[PAL.idx].run(); }
}

/* ---------- add-project dialog ---------- */
const AD = { open: false, dir: null, idx: -1, req: 0, busy: false };
function openAdd() {
  closePal();
  AD.open = true; $('#addp').hidden = false;
  $('#addp-in').value = ''; addErr('');
  $('#addp-foot').innerHTML = `${META.picker ? `<button class="btn sm" data-act="pick">${ic('finder', '', 13)}Choose in Finder…</button>` : ''}<span class="sp"></span><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>→</kbd> open</span><span><kbd>↵</kbd> add</span><span><kbd>esc</kbd> close</span>`;
  browse(localStorage.getItem('weads-browse') || '~');
  $('#addp-in').focus();
}
function closeAdd() { AD.open = false; $('#addp').hidden = true; }
function addErr(msg) { $('#addp-err').innerHTML = msg ? `${ic('alert', '', 13)}<span>${esc(msg)}</span>` : ''; }
async function browse(path) {
  const req = ++AD.req;
  try {
    const d = await get('/api/fs?path=' + enc(path));
    if (req !== AD.req) return;
    AD.dir = d; AD.idx = d.dirs.length ? Math.max(0, d.dirs.findIndex(x => x.beads)) : -1;
    localStorage.setItem('weads-browse', d.path);
    paintAdd();
  } catch (e) { if (req === AD.req) addErr(e.message); }
}
function paintAdd() {
  const d = AD.dir, nb = d.dirs.filter(x => x.beads).length;
  $('#addp-bar').innerHTML = `<button class="icon-btn sm" data-act="fs-up" title="Parent folder"${d.parent ? '' : ' disabled'}>${ic('up', '', 13)}</button><span class="mono ell">${esc(d.display)}</span><span class="sp"></span>${d.project
    ? `<span class="tag added">added</span><button class="btn sm" data-act="fs-open" data-arg="${esc(d.project)}">Open</button>`
    : d.beads
    ? `<span class="tag">beads</span><button class="btn sm primary" data-act="fs-add" data-arg="${esc(d.path)}">Add this folder</button>`
    : `<span class="faint">${nb ? `${nb} ${nb > 1 ? 'folders use' : 'folder uses'} beads` : 'No beads folders here'}</span>`}`;
  const tail = x => x.project ? `<button class="btn sm" data-act="fs-open" data-arg="${esc(x.project)}">Open</button>`
    : x.beads ? `<button class="btn sm" data-act="fs-add" data-arg="${esc(x.path)}">Add</button>` : ic('chevr', 'ch', 13);
  $('#addp-list').innerHTML = d.dirs.length ? d.dirs.map((x, k) => `<div class="m-row${k === AD.idx ? ' on' : ''}${x.beads ? ' bd' : ''}" data-fi="${k}" title="${esc(x.path)}">${ic('folder', '', 15)}<span class="ell">${esc(x.name)}</span>${x.project ? '<span class="tag added">added</span>' : x.beads ? '<span class="tag">beads</span>' : ''}<span class="sp"></span>${tail(x)}</div>`).join('') : '<div class="pal-empty">No folders here</div>';
  const on = $('#addp-list .on'); on && on.scrollIntoView({ block: 'nearest' });
}
function enterDir(x) { $('#addp-in').value = ''; addErr(''); browse(x.path); }
function openFromDialog(id) { closeAdd(); pendingHash = null; switchProject(id); }
async function addFromDialog(path) {
  if (AD.busy || !path) return;
  AD.busy = true; $('#addp-go').disabled = true; addErr('');
  try { await addProject(path); closeAdd(); }
  catch (e) { addErr(e.message); }
  finally { AD.busy = false; $('#addp-go').disabled = false; }
}
async function pickFolder() {
  try {
    const r = await api('POST', '/api/pick');
    if (r.status === 200 && r.body.path) { $('#addp-in').value = r.body.path; addFromDialog(r.body.path); }
  } catch (e) { addErr(e.message); }
}
let browseT;
function addInput() {
  addErr('');
  const v = $('#addp-in').value.trim();
  clearTimeout(browseT);
  if (v === '~' || v.endsWith('/')) browseT = setTimeout(() => browse(v), 120);
}
function addKey(e) {
  const d = AD.dir, n = d ? d.dirs.length : 0, x = d && d.dirs[AD.idx];
  const typing = e.target.id === 'addp-in' && e.target.value.trim();
  if (e.key === 'Escape') { e.preventDefault(); closeAdd(); }
  else if (e.key === 'ArrowDown' && n) { e.preventDefault(); AD.idx = (AD.idx + 1) % n; paintAdd(); }
  else if (e.key === 'ArrowUp' && n) { e.preventDefault(); AD.idx = (AD.idx - 1 + n) % n; paintAdd(); }
  else if (e.key === 'ArrowRight' && x && !typing) { e.preventDefault(); enterDir(x); }
  else if ((e.key === 'ArrowLeft' || e.key === 'Backspace') && !typing && d && d.parent) { e.preventDefault(); browse(d.parent); }
  else if (e.key === 'Enter' && !typing) { e.preventDefault(); if (x) x.project ? openFromDialog(x.project) : x.beads ? addFromDialog(x.path) : enterDir(x); else if (d && d.project) openFromDialog(d.project); else if (d && d.beads) addFromDialog(d.path); }
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  if (e.target.id === 'pal') return closePal();
  if (e.target.id === 'addp') return closeAdd();
  const a = e.target.closest('[data-act]'); if (a) { e.stopPropagation(); return act(a.dataset.act, a.dataset.arg, a); }
  const pi = e.target.closest('[data-pi]'); if (pi) return PAL.items[+pi.dataset.pi].run();
  const fi = e.target.closest('[data-fi]'); if (fi) return enterDir(AD.dir.dirs[+fi.dataset.fi]);
  const o = e.target.closest('[data-open]'); if (o) { e.preventDefault(); return openIssue(o.dataset.open, !!e.target.closest('#detail')); }
  const c = e.target.closest('[data-id]'); if (c) return openIssue(c.dataset.id);
});
document.addEventListener('mousemove', e => {
  const pi = e.target.closest('[data-pi]');
  if (pi && +pi.dataset.pi !== PAL.idx) { PAL.idx = +pi.dataset.pi; document.querySelectorAll('.pal-item').forEach((n, k) => n.classList.toggle('on', k === PAL.idx)); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'pq') { PAL.idx = 0; palCompute(); palPaint(); }
  if (e.target.id === 'addp-in') addInput();
});
$('#addp-form').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#addp-in').value.trim();
  if (v) return addFromDialog(v);
  const x = AD.dir && AD.dir.dirs[AD.idx];
  if (x && x.beads) addFromDialog(x.path); else if (x) enterDir(x); else if (AD.dir && AD.dir.beads) addFromDialog(AD.dir.path);
});
$('#view').addEventListener('mouseover', e => { const n = e.target.closest('.gnode'); n ? focusNode(n.dataset.id) : clearFocus(); });
$('#view').addEventListener('mouseleave', clearFocus);
window.addEventListener('resize', () => { if (P && S.view === 'graph') render(); });
document.addEventListener('keydown', e => {
  if (AD.open) return addKey(e);
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); return PAL.open ? closePal() : openPal(); }
  if (PAL.open) return palKey(e);
  if (e.target.matches('input, textarea')) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === 'ArrowDown') { e.target.blur(); if (e.key !== 'Escape') move(0, 0); }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === 'j' || k === 'ArrowDown') { e.preventDefault(); move(1, 0); }
  else if (k === 'k' || k === 'ArrowUp') { e.preventDefault(); move(-1, 0); }
  else if (k === 'h' || k === 'ArrowLeft') { e.preventDefault(); move(0, -1); }
  else if (k === 'l' || k === 'ArrowRight') { e.preventDefault(); move(0, 1); }
  else if ((k === 'Enter' || k === 'o') && S.sel) openIssue(S.sel);
  else if (k === 'Escape') { if (S.open) closeDetail(); else if (S.q || S.epic || S.label || S.queue || S.quick.size) clearFilter('all'); }
  else if (k === '/') { e.preventDefault(); $('#q').focus(); $('#q').select(); }
  else if (k === '1') setView('board');
  else if (k === '2') setView('list');
  else if (k === '3') setView('graph');
  else if (k === 's') act('lanes');
  else if (k === 'y' && (S.open || S.sel)) copy(S.open || S.sel);
  else if (k === 'Backspace' && S.hist.length) act('back');
});
// Ages and lease countdowns are relative to now, so repaint them while the tab is visible.
setInterval(() => {
  if (!P || document.hidden || PAL.open || AD.open) return;
  render();
  if (S.open && getSelection().isCollapsed) renderDetail(true);
}, 30000);

/* ---------- boot ---------- */
$('#pal-in').innerHTML = `${ic('search', '', 16)}<input id="pq" placeholder="Jump to an issue, view, or project…" autocomplete="off" spellcheck="false"><kbd>esc</kbd>`;
$('#addp-x').innerHTML = ic('x');
$('#addp-label').insertAdjacentHTML('afterbegin', ic('folder', '', 15));
renderTopbar(); renderStatus(); render();
connect();
})();
