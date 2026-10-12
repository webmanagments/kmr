// Auto Bet: one engine shared by every game.
//
// A game hands the hook two things: `idle` (no round in progress) and `trigger`
// (start one round). The engine starts a round, waits until the wallet records the
// result and the game is idle again, then repeats until the round count or a
// profit/loss limit is reached. Step games (Mines, Towers, Chicken…) read
// `auto.running` and play their own steps with `auto.stepDelay`.
import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import {focusDefault, focusEl} from '../lib/spatial';
import {fmtCoins, loadJSON, saveJSON, sleep} from '../lib/util';
import {toast, wallet} from '../lib/wallet';
import {ListStepper, PlayButton} from './controls';

export interface AutoCfg {
  rounds: number; // Infinity = until stopped
  profit: number; // 0 = off
  loss: number; // 0 = off
}

const ROUNDS = [5, 10, 25, 50, 100, 250, Infinity] as const;
const LIMITS = [0, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000] as const;

async function waitUntil(cond: () => boolean, timeout: number): Promise<boolean> {
  const t0 = performance.now();
  while (!cond()) {
    if (performance.now() - t0 > timeout) return false;
    await sleep(60);
  }
  return true;
}

export interface AutoApi {
  running: boolean;
  left: number;
  cfg: AutoCfg;
  setCfg: (c: AutoCfg) => void;
  start: () => void;
  stop: () => void;
  open: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  btnRef: React.RefObject<HTMLButtonElement | null>;
  /** Pause between automated steps inside a round (step games). */
  stepDelay: number;
}

export function useAutoBet({
  game,
  idle,
  trigger,
  delay = 450,
}: {
  game: string;
  idle: boolean;
  trigger: () => void;
  delay?: number;
}): AutoApi {
  const key = `kmr.auto.${game}`;
  const [cfg, setCfgState] = useState<AutoCfg>(() => {
    const c = loadJSON<{rounds: number | null; profit: number; loss: number}>(key, {rounds: 10, profit: 0, loss: 0});
    return {rounds: c.rounds === null ? Infinity : c.rounds, profit: c.profit, loss: c.loss};
  });
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(0);
  const [open, setOpen] = useState(false);
  const idleRef = useRef(idle);
  idleRef.current = idle;
  const triggerRef = useRef(trigger);
  triggerRef.current = trigger;
  const runRef = useRef(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const setCfg = useCallback(
    (c: AutoCfg) => {
      setCfgState(c);
      saveJSON(key, {rounds: c.rounds === Infinity ? null : c.rounds, profit: c.profit, loss: c.loss});
    },
    [key],
  );

  // Stop when the game closes.
  useEffect(
    () => () => {
      runRef.current = false;
    },
    [],
  );

  // Back closes the sheet: it lives in browser history like every other layer.
  useEffect(() => {
    const onPop = () => {
      const isOpen = (history.state as {sheet?: string} | null)?.sheet === 'auto';
      setOpen(prev => {
        if (prev && !isOpen) requestAnimationFrame(() => focusEl(btnRef.current) || focusDefault());
        return isOpen;
      });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openSheet = useCallback(() => {
    try {
      history.pushState({...(history.state ?? {}), sheet: 'auto'}, '');
    } catch {
      /* history unavailable: the sheet still opens, Done closes it */
    }
    setOpen(true);
    requestAnimationFrame(() => focusDefault());
  }, []);

  const closeSheet = useCallback(() => {
    if ((history.state as {sheet?: string} | null)?.sheet === 'auto') history.back();
    else {
      setOpen(false);
      requestAnimationFrame(() => focusEl(btnRef.current) || focusDefault());
    }
  }, []);

  const stop = useCallback(() => {
    runRef.current = false;
  }, []);

  const start = useCallback(() => {
    if (runRef.current) return;
    runRef.current = true;
    setRunning(true);
    const c = cfg;
    let remaining = c.rounds;
    setLeft(remaining);
    const startProfit = wallet.get().profit;
    void (async () => {
      while (runRef.current && remaining > 0) {
        const net = wallet.get().profit - startProfit;
        if (c.profit && net >= c.profit) {
          toast(`Auto stopped: +${fmtCoins(net)} profit target hit`, 'win');
          break;
        }
        if (c.loss && -net >= c.loss) {
          toast(`Auto stopped: loss limit of ${fmtCoins(c.loss)} reached`, 'info');
          break;
        }
        if (!(await waitUntil(() => idleRef.current || !runRef.current, 120_000)) || !runRef.current) break;
        const before = wallet.get().bets;
        triggerRef.current();
        const started = await waitUntil(() => wallet.get().bets > before || !idleRef.current || !runRef.current, 1500);
        if (!runRef.current) break;
        if (!started) {
          toast('Auto stopped: no bet could be placed', 'error');
          break;
        }
        const finished = await waitUntil(() => (wallet.get().bets > before && idleRef.current) || !runRef.current, 600_000);
        if (!finished) break;
        if (remaining !== Infinity) remaining -= 1;
        setLeft(remaining);
        if (runRef.current && remaining > 0) await sleep(delay);
      }
      runRef.current = false;
      setRunning(false);
      requestAnimationFrame(() => focusDefault());
    })();
    requestAnimationFrame(() => focusDefault());
  }, [cfg, delay]);

  return {running, left, cfg, setCfg, start, stop, open, openSheet, closeSheet, btnRef, stepDelay: 320};
}

function AutoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M18 2.5v4.2h-4.2M6 21.5v-4.2h4.2" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Replaces the game's main button row: [AUTO] [Bet] normally, [Stop Auto] while running. */
export function AutoRow({auto, children}: {auto: AutoApi; children: ReactNode}) {
  if (auto.running)
    return (
      <div className="play-row">
        <button type="button" className="play-btn tone-red auto-stop" onClick={auto.stop} data-autofocus="">
          <span className="play-label">Stop Auto</span>
          <span className="play-sub">{auto.left === Infinity ? 'Running until stopped' : `${auto.left} bet${auto.left === 1 ? '' : 's'} left`}</span>
        </button>
      </div>
    );
  return (
    <div className="play-row">
      <button ref={auto.btnRef} type="button" className="auto-btn" onClick={auto.openSheet} aria-label="Auto bet settings">
        <AutoIcon />
        <span>Auto</span>
      </button>
      {children}
    </div>
  );
}

const fmtLimit = (v: number) => (v ? fmtCoins(v).replace(/\.00$/, '') : 'Off');

/** Auto Bet settings. Game-specific options (e.g. "cash out after 3 gems") go in children. */
export function AutoSheet({auto, children, note}: {auto: AutoApi; children?: ReactNode; note?: string}) {
  if (!auto.open) return null;
  const {cfg, setCfg} = auto;
  return (
    <div className="sheet-backdrop">
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Auto bet settings" data-focus-scope="modal">
        <div className="modal-head">
          <AutoIcon />
          <span>Auto Bet</span>
          <button type="button" className="modal-close" onClick={auto.closeSheet}>
            Done
          </button>
        </div>
        <div className="sheet-grid">
          <ListStepper
            label="Number of Bets"
            values={ROUNDS}
            value={cfg.rounds}
            onChange={v => setCfg({...cfg, rounds: v})}
            render={v => (v === Infinity ? '∞' : String(v))}
          />
          <ListStepper label="Stop on Profit" values={LIMITS} value={cfg.profit} onChange={v => setCfg({...cfg, profit: v})} render={fmtLimit} tone="green" />
          <ListStepper label="Stop on Loss" values={LIMITS} value={cfg.loss} onChange={v => setCfg({...cfg, loss: v})} render={fmtLimit} tone="red" />
          {children}
        </div>
        <p className="sheet-note">{note ?? 'Uses your current bet and game settings. Stops early if your balance runs out.'}</p>
        <PlayButton
          onClick={() => {
            auto.closeSheet();
            auto.start();
          }}
        >
          Start Auto Bet
        </PlayButton>
      </div>
    </div>
  );
}
