// Shared building blocks for the e2e fixture pages (test/<area>.html).
// Each page composes the pieces it needs — no query flags, one page per spec.
import '../src/index.ts';

/** The standard command set: a 3-step wizard, a 1-step wizard and an instant command. */
export const commands = () => [
  {
    id: 'deploy', trigger: '/deploy', aliases: ['/d'], shortcut: 'g d', text: 'Deploy to Environment', description: 'Deploy a branch',
    steps: [
      { id: 'env', prompt: ' to ', options: [
        { id: 'prod', text: 'Production', value: 'production' },
        { id: 'staging', text: 'Staging', value: 'staging' },
      ] },
      { id: 'branch', prompt: ' branch ', isLiveSearch: true },
      { id: 'note', prompt: ' note ', isFreeTextAllowed: true },
    ],
  },
  { id: 'go', trigger: '/go', shortcut: 'g g', text: 'Go to Page', description: 'Navigate to a page',
    steps: [{ id: 'page', options: [{ text: 'Home', value: '/' }, { text: 'Users', value: '/users' }] }] },
  { id: 'reload', trigger: '/reload', shortcut: 'g r', text: 'Reload Data', description: 'Instant' },
];

export const contexts = () => [
  { id: 'products', trigger: ':products', aliases: [':p'], text: 'Products', description: 'Search products' },
  { id: 'users', trigger: ':users', aliases: [':u'], text: 'Users', description: 'Search users' },
];

/** Fake async search provider: 3 hits (20 for the term "many") after 20 ms; calls go to window.calls.search. */
export function fakeSearch({ scope, term }) {
  window.calls.search.push({ scope, term });
  const count = term === 'many' ? 20 : 3;
  const name = scope === 'global' ? 'Global' : scope.contextId;
  return new Promise((resolve) => setTimeout(() => resolve(
    Array.from({ length: count }, (_, i) => ({ id: `${name}-${i}`, title: `${name} ${term} ${i}`, subtitle: `hit ${i}`, badge: 'Hit', badgeVariant: 'info' })),
  ), 20));
}

/** Fake step-options provider (the live `branch` step); calls go to window.calls.stepOptions. */
export function fakeStepOptions({ commandId, stepId, term, selections }) {
  window.calls.stepOptions.push({ commandId, stepId, term, selections });
  if (stepId === 'branch') return ['main', `feature/${term || 'x'}`].map((b) => ({ id: b, text: b, value: b }));
  return [];
}

export const EVENT_NAMES = ['open', 'close', 'select', 'action', 'ready'];

/**
 * Record the palette's events: `window.events` (structured, the detail as plain JSON —
 * controller / element are non-enumerable) and a `<pre data-testid="<area>-log">` with
 * one `name:detail` line per event.
 */
export function recordEvents(el, area) {
  window.events ??= [];
  let log = document.querySelector(`[data-testid="${area}-log"]`);
  if (!log) {
    log = document.createElement('pre');
    log.dataset.testid = `${area}-log`;
    document.body.appendChild(log);
  }
  for (const name of EVENT_NAMES) {
    el.addEventListener(name, (e) => {
      const detail = JSON.parse(JSON.stringify(e.detail ?? null));
      window.events.push({ name, detail, target: el.id });
      log.textContent += `${name}:${JSON.stringify(detail)}\n`;
    });
  }
}

/**
 * The standard setup most pages share: `#palette` with the standard commands /
 * contexts, the fake providers and event recording. `#opener` (if present) opens it.
 */
export function setupStandard(area, { search = true, stepOptions = true, el = document.getElementById('palette') } = {}) {
  window.calls = { search: [], stepOptions: [] };
  recordEvents(el, area);
  document.getElementById('opener')?.addEventListener('click', () => el.open());
  el.commands = commands();
  el.contexts = contexts();
  if (search) el.searchCallback = fakeSearch;
  if (stepOptions) el.getStepOptionsCallback = fakeStepOptions;
  return el;
}

export const ready = () => { window.ready = true; };
