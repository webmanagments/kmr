// Directional focus navigation for the Neural Band / touchpad D-pad.
//
// Mirrors the approach Meta's own UI Toolkit FocusNavigationProvider uses: a single
// document-level keydown handler that moves focus to the nearest visible control in
// the pressed direction and calls preventDefault so the host does not move twice.
// Pinch / Select arrives as a normal click on the focused <button>, so nothing here
// synthesizes clicks.

const FOCUSABLE =
  'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

type Dir = 'up' | 'down' | 'left' | 'right';

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/** Topmost active scope: an open modal traps focus, otherwise the whole app. */
export function activeScope(): HTMLElement | null {
  const modals = document.querySelectorAll<HTMLElement>('[data-focus-scope="modal"]');
  if (modals.length) return modals[modals.length - 1];
  return document.getElementById('root');
}

function isVisible(el: HTMLElement): boolean {
  if (el.closest('[inert],[aria-hidden="true"]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none';
}

export function focusables(scope: HTMLElement | null = activeScope()): HTMLElement[] {
  if (!scope) return [];
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isVisible);
}

function score(dir: Dir, from: DOMRect, to: DOMRect): number | null {
  const fcx = from.left + from.width / 2;
  const fcy = from.top + from.height / 2;
  const tcx = to.left + to.width / 2;
  const tcy = to.top + to.height / 2;
  let primary: number;
  let orthGap: number;
  let centerDiff: number;
  // Targets must lie in the half-plane beyond the current control's edge (6px slack
  // for the focus scale effect), so a press never wanders sideways or backwards.
  const SLACK = 6;
  switch (dir) {
    case 'down':
      if (!(tcy > fcy + 1 && to.top >= from.bottom - SLACK)) return null;
      primary = Math.max(0, to.top - from.bottom);
      orthGap = Math.max(0, to.left - from.right, from.left - to.right);
      centerDiff = Math.abs(tcx - fcx);
      break;
    case 'up':
      if (!(tcy < fcy - 1 && to.bottom <= from.top + SLACK)) return null;
      primary = Math.max(0, from.top - to.bottom);
      orthGap = Math.max(0, to.left - from.right, from.left - to.right);
      centerDiff = Math.abs(tcx - fcx);
      break;
    case 'right':
      if (!(tcx > fcx + 1 && to.left >= from.right - SLACK)) return null;
      primary = Math.max(0, to.left - from.right);
      orthGap = Math.max(0, to.top - from.bottom, from.top - to.bottom);
      centerDiff = Math.abs(tcy - fcy);
      break;
    case 'left':
      if (!(tcx < fcx - 1 && to.right <= from.left + SLACK)) return null;
      primary = Math.max(0, from.left - to.right);
      orthGap = Math.max(0, to.top - from.bottom, from.top - to.bottom);
      centerDiff = Math.abs(tcy - fcy);
      break;
  }
  return primary + orthGap * 2.5 + centerDiff * 0.12;
}

export function focusEl(el: HTMLElement | null | undefined): boolean {
  if (!el) return false;
  el.focus({preventScroll: true});
  el.scrollIntoView({block: 'nearest', inline: 'nearest'});
  return document.activeElement === el;
}

/** Focus the preferred control in the scope ([data-autofocus]) or the first one. */
export function focusDefault(scope: HTMLElement | null = activeScope()): void {
  if (!scope) return;
  const preferred = scope.querySelector<HTMLElement>('[data-autofocus]:not([disabled])');
  if (preferred && isVisible(preferred) && focusEl(preferred)) return;
  // Prefer the main view over the top bar so Wallet is never the default target.
  const main = scope.querySelector<HTMLElement>('.view');
  const first = (main && focusables(main)[0]) || focusables(scope)[0];
  focusEl(first);
}

/** Does `to` share a row (horizontal moves) or column (vertical moves) with `from`? */
function aligned(dir: Dir, from: DOMRect, to: DOMRect): boolean {
  if (dir === 'left' || dir === 'right') return to.bottom > from.top + 2 && to.top < from.bottom - 2;
  return to.right > from.left + 2 && to.left < from.right - 2;
}

/**
 * Move focus one step. `aligned` restricts the search to controls in the same
 * row/column; the caller falls back to any direction afterwards.
 */
export function moveFocus(dir: Dir, mode: 'aligned' | 'any' = 'any'): boolean {
  const scope = activeScope();
  if (!scope) return false;
  const current = document.activeElement as HTMLElement | null;
  const list = focusables(scope);
  if (!current || current === document.body || !scope.contains(current)) {
    focusDefault(scope);
    return true;
  }
  const from = current.getBoundingClientRect();
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of list) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    if (mode === 'aligned' && !aligned(dir, from, r)) continue;
    const s = score(dir, from, r);
    if (s !== null && s < bestScore) {
      bestScore = s;
      best = el;
    }
  }
  if (best) return focusEl(best);
  return false;
}

/**
 * A screen can claim directional presses that run off the edge of the layout
 * (the paged lobby uses this to flip pages). Return true if handled.
 */
type EdgeHandler = (dir: Dir, from: HTMLElement | null) => boolean;
let edgeHandler: EdgeHandler | null = null;
export function setEdgeHandler(h: EdgeHandler | null): void {
  edgeHandler = h;
}

/** Install the global handler. Returns a cleanup function. */
export function installSpatialNav(onEscape: () => void): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const dir = KEY_DIR[e.key];
    if (dir) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      e.preventDefault();
      const from = document.activeElement as HTMLElement | null;
      // 1) same row/column, 2) screen-specific edge behaviour (page flips), 3) anything that way.
      if (moveFocus(dir, 'aligned')) return;
      if (edgeHandler && edgeHandler(dir, from)) return;
      moveFocus(dir, 'any');
      return;
    }
    if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'BrowserBack') {
      e.preventDefault();
      onEscape();
    }
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
