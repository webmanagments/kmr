import {useCallback, useEffect, useRef, useState} from 'react';
import {loadJSON, saveJSON} from './util';

/**
 * Schedule work (usually "pay out after the animation") that must still happen if
 * the game screen closes early. Pending jobs run immediately on unmount.
 */
export function useSettler() {
  const jobs = useRef(new Map<number, {timer: ReturnType<typeof setTimeout>; fn: () => void}>());
  const seq = useRef(0);

  useEffect(() => {
    const map = jobs.current;
    return () => {
      for (const {timer, fn} of map.values()) {
        clearTimeout(timer);
        fn();
      }
      map.clear();
    };
  }, []);

  return useCallback((fn: () => void, delay: number) => {
    const id = ++seq.current;
    const timer = setTimeout(() => {
      jobs.current.delete(id);
      fn();
    }, delay);
    jobs.current.set(id, {timer, fn});
  }, []);
}

/** State that survives leaving the game and reloading (for in-progress rounds). */
export function usePersistent<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const storageKey = `kmr.round.${key}`;
  const [value, setValue] = useState<T>(() => loadJSON<T>(storageKey, initial));
  const ref = useRef(value);
  // Save synchronously so a round settled after the screen closes is still recorded.
  const set = useCallback(
    (v: T | ((p: T) => T)) => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(ref.current) : v;
      ref.current = next;
      saveJSON(storageKey, next);
      setValue(next);
    },
    [storageKey],
  );
  return [value, set];
}

/** Interval that only runs while `active`, cleared on unmount or when the page hides. */
export function useTicker(active: boolean, ms: number, fn: () => void) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!active) return;
    let id: ReturnType<typeof setInterval> | null = setInterval(() => fnRef.current(), ms);
    const onVis = () => {
      if (document.hidden && id) {
        clearInterval(id);
        id = null;
      } else if (!document.hidden && !id) {
        id = setInterval(() => fnRef.current(), ms);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (id) clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [active, ms]);
}

/** Transient value that resets after `ms` (for win flashes and result badges). */
export function useFlash<T>(ms = 1800): [T | null, (v: T) => void] {
  const [v, setV] = useState<T | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (t.current) clearTimeout(t.current);
  }, []);
  const show = useCallback(
    (next: T) => {
      if (t.current) clearTimeout(t.current);
      setV(next);
      t.current = setTimeout(() => setV(null), ms);
    },
    [ms],
  );
  return [v, show];
}
