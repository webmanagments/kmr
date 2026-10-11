import {Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {CATEGORIES, GAMES, gameComponent, gameName} from './games/registry';
import {GameArt} from './games/art';
import {focusDefault, focusEl, focusIsLost, installSpatialNav, setEdgeHandler} from './lib/spatial';
import {DAILY_BONUS, setToaster, toast, useWallet, wallet} from './lib/wallet';
import {fmtCoins, fmtMult} from './lib/util';
import {Chart, Coin, Gift, Refresh, Trophy, WalletIcon} from './ui/icons';

interface Nav {
  screen: 'lobby' | 'game';
  id?: string;
  modal?: 'wallet';
}

const HOME: Nav = {screen: 'lobby'};

/** Apply focus on the next frame, then re-apply shortly after only if it was lost. */
function settleFocus(apply: () => void) {
  requestAnimationFrame(apply);
  for (const ms of [160, 450]) setTimeout(() => focusIsLost() && apply(), ms);
}

/** History calls can throw in locked-down web views; never let that break the app. */
function safeHistory(kind: 'push' | 'replace', state: Nav): boolean {
  try {
    if (kind === 'push') history.pushState(state, '');
    else history.replaceState(state, '');
    return true;
  } catch {
    return false;
  }
}

interface Toast {
  id: number;
  msg: string;
  tone: 'info' | 'error' | 'win';
}

export default function App() {
  const [nav, setNav] = useState<Nav>(HOME);
  const navRef = useRef(nav);
  navRef.current = nav;
  const lastGame = useRef<string | null>(null);
  const modalOpener = useRef<HTMLElement | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // History is the source of truth for Back: the glasses shell calls history.back().
  useEffect(() => {
    // Input first, so nothing below can stop the Neural Band from working.
    const uninstall = installSpatialNav(() => {
      const n = navRef.current;
      if (n.modal) {
        // Hand focus back synchronously so it is never dropped while the modal closes.
        const view = document.querySelector<HTMLElement>('.view');
        if (view) view.inert = false;
        const opener = modalOpener.current;
        if (!(opener && opener.isConnected && focusEl(opener))) focusEl(document.querySelector<HTMLElement>('.wallet-btn'));
        history.back();
      } else if (n.screen !== 'lobby') {
        // Park focus on a control that survives the screen change; the lobby then refocuses the tile.
        focusEl(document.querySelector<HTMLElement>('.wallet-btn'));
        history.back();
      } else if (focusIsLost()) focusDefault();
    });
    safeHistory('replace', HOME);
    const onPop = (e: PopStateEvent) => setNav((e.state as Nav | null) ?? HOME);
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      uninstall();
    };
  }, []);

  useEffect(() => {
    let seq = 0;
    setToaster((msg, tone = 'info') => {
      const id = ++seq;
      setToasts(t => [...t.slice(-1), {id, msg, tone}]);
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600);
    });
  }, []);

  const openGame = useCallback((id: string) => {
    lastGame.current = id;
    const next: Nav = {screen: 'game', id};
    safeHistory('push', next);
    setNav(next);
  }, []);

  const openWallet = useCallback(() => {
    if (navRef.current.modal) return;
    modalOpener.current = document.activeElement as HTMLElement | null;
    const next: Nav = {...navRef.current, modal: 'wallet'};
    safeHistory('push', next);
    setNav(next);
  }, []);

  // Focus follows navigation. The glasses browser can reset focus to the page itself
  // around a navigation, so the target is re-applied a couple of times if it was lost.
  const prev = useRef<Nav>(HOME);
  useLayoutEffect(() => {
    const before = prev.current;
    prev.current = nav;
    if (nav.modal && !before.modal) {
      settleFocus(() => focusDefault());
      return;
    }
    if (!nav.modal && before.modal) {
      const opener = modalOpener.current;
      settleFocus(() => {
        if (!(opener && opener.isConnected && focusEl(opener))) focusDefault();
      });
      return;
    }
    if (nav.screen === 'lobby' && before.screen === 'game') {
      settleFocus(() => {
        const tile = document.querySelector<HTMLElement>(`[data-game="${lastGame.current}"]`);
        if (!focusEl(tile)) focusDefault();
      });
    }
  }, [nav]);

  useEffect(() => {
    settleFocus(() => focusDefault());
  }, []);

  const inGame = nav.screen === 'game' && nav.id;

  return (
    <div className="app">
      <TopBar title={inGame ? gameName(nav.id!) : null} onWallet={openWallet} />
      <main className="view" inert={nav.modal ? true : undefined}>
        {inGame ? <GameScreen key={nav.id} id={nav.id!} /> : <Lobby onOpen={openGame} onWallet={openWallet} />}
      </main>
      {nav.modal === 'wallet' && <WalletModal onClose={() => history.back()} />}
      <div className="toasts" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast tone-${t.tone}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

function TopBar({title, onWallet}: {title: string | null; onWallet: () => void}) {
  const {balance} = useWallet();
  const [bump, setBump] = useState<'up' | 'down' | null>(null);
  const last = useRef(balance);
  useEffect(() => {
    if (balance === last.current) return;
    setBump(balance > last.current ? 'up' : 'down');
    last.current = balance;
    const t = setTimeout(() => setBump(null), 450);
    return () => clearTimeout(t);
  }, [balance]);
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo" aria-label="KMR Casino">
          KMR
        </span>
        {title && (
          <>
            <span className="crumb-sep" aria-hidden="true">
              /
            </span>
            <span className="crumb">{title}</span>
          </>
        )}
      </div>
      <div className="wallet-group">
        <div className={`balance${bump ? ` bump-${bump}` : ''}`} aria-label={`Balance ${fmtCoins(balance)} coins`}>
          <Coin size={16} />
          <span>{fmtCoins(balance)}</span>
        </div>
        <button type="button" className="wallet-btn" onClick={onWallet} aria-label="Open wallet">
          <WalletIcon size={16} />
          <span>Wallet</span>
        </button>
      </div>
    </header>
  );
}

const PER_PAGE = 8;
// Every lobby page in order: one or more pages per category.
const PAGES = CATEGORIES.flatMap(cat => {
  const list = GAMES.filter(g => g.cat === cat.id);
  return Array.from({length: Math.ceil(list.length / PER_PAGE)}, (_, i) => ({
    cat: cat.id,
    index: i,
    of: Math.ceil(list.length / PER_PAGE),
    games: list.slice(i * PER_PAGE, (i + 1) * PER_PAGE),
  }));
});
let lobbyPage = 0; // remembered while the app is open

function Lobby({onOpen, onWallet}: {onOpen: (id: string) => void; onWallet: () => void}) {
  const w = useWallet();
  const ready = wallet.bonusReadyIn() <= 0;
  const [page, setPageState] = useState(lobbyPage);
  const [dir, setDir] = useState<1 | -1>(1);
  const pageRef = useRef(page);
  const setPage = (p: number, focus: 'first' | 'last' | null) => {
    if (p < 0 || p >= PAGES.length || p === pageRef.current) return false;
    setDir(p > pageRef.current ? 1 : -1);
    pageRef.current = p;
    lobbyPage = p;
    setPageState(p);
    if (focus)
      requestAnimationFrame(() => {
        const tiles = document.querySelectorAll<HTMLElement>('.tiles .tile');
        focusEl(focus === 'first' ? tiles[0] : tiles[tiles.length - 1]);
      });
    // A pager button that just became disabled drops focus; hand it to the other one.
    else requestAnimationFrame(() => focusIsLost() && focusEl(document.querySelector<HTMLElement>('.pager-btn:not(:disabled)')));
    return true;
  };

  // Running off the right/bottom edge of the grid flips to the next page; left flips back.
  useEffect(() => {
    setEdgeHandler((d, from) => {
      if (!from?.classList.contains('tile')) return false;
      if (d === 'right' || d === 'down') return setPage(pageRef.current + 1, 'first');
      if (d === 'left') return setPage(pageRef.current - 1, 'last');
      return false;
    });
    return () => setEdgeHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = PAGES[page];
  const catPages = PAGES.filter(p => p.cat === current.cat);

  return (
    <div className="lobby">
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-kicker">Daily bonus</span>
          <span className="hero-title">
            {ready ? (
              <>
                +{DAILY_BONUS.toLocaleString('en-US')} coins <em>ready</em>
              </>
            ) : (
              <>Come back tomorrow</>
            )}
          </span>
          <span className="hero-sub">
            {w.bets ? `${w.bets.toLocaleString('en-US')} bets · best ${fmtMult(w.bestMult)}` : `${GAMES.length} games · play money only`}
          </span>
        </div>
        <button type="button" className="hero-btn" onClick={onWallet} data-autofocus>
          <Gift size={16} />
          <span>{ready ? 'Claim' : 'Wallet'}</span>
        </button>
        <svg className="hero-deco" viewBox="0 0 120 80" aria-hidden="true">
          <circle cx="92" cy="46" r="30" fill="#f5b000" />
          <circle cx="92" cy="46" r="23" fill="#ffd34d" />
          <path d="M85 33v26M85 46l12-13M89 42l9 17" stroke="#9a5a00" strokeWidth="5" strokeLinecap="round" fill="none" />
          <circle cx="50" cy="60" r="14" fill="#f5b000" opacity=".8" />
          <circle cx="50" cy="60" r="10" fill="#ffd34d" opacity=".8" />
        </svg>
      </section>

      <div className="tabs" role="tablist" aria-label="Game categories">
        {CATEGORIES.map(cat => {
          const first = PAGES.findIndex(p => p.cat === cat.id);
          const count = GAMES.filter(g => g.cat === cat.id).length;
          const on = current.cat === cat.id;
          return (
            <button key={cat.id} type="button" role="tab" aria-selected={on} className={`tab${on ? ' is-on' : ''}`} onClick={() => setPage(first, null)}>
              <span>{cat.name}</span>
              <span className="tab-count">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="tiles" key={page} data-dir={dir} role="tabpanel" aria-label={`${CATEGORIES.find(c => c.id === current.cat)?.name} page ${current.index + 1}`}>
        {current.games.map(g => (
          <button
            key={g.id}
            type="button"
            className="tile"
            data-game={g.id}
            onClick={() => onOpen(g.id)}
            style={{background: `linear-gradient(160deg, ${g.from}, ${g.to})`}}
            aria-label={`Play ${g.name}`}
          >
            {g.tag && <span className={`tile-tag tag-${g.tag.toLowerCase()}`}>{g.tag}</span>}
            <GameArt id={g.id} />
            <span className="tile-name">{g.name}</span>
            <span className="tile-sub">{g.cat === 'originals' ? 'KMR Originals' : g.cat === 'table' ? 'Table' : 'Featured'}</span>
          </button>
        ))}
        {Array.from({length: PER_PAGE - current.games.length}, (_, i) => (
          <div key={`soon-${i}`} className="tile-ghost" aria-hidden="true">
            {i === 0 && <span>More games soon</span>}
          </div>
        ))}
      </div>

      <div className="pager">
        <span className="pager-dots" aria-hidden="true">
          {PAGES.map((p, i) => (
            <i key={i} className={`${i === page ? 'is-on' : ''}${p.cat !== current.cat ? ' is-other' : ''}`} />
          ))}
        </span>
        <span className="pager-btns">
          <button type="button" className="pager-btn" onClick={() => setPage(page - 1, null)} disabled={page === 0} aria-label="Previous page">
            ‹ Prev
          </button>
          <button type="button" className="pager-btn" onClick={() => setPage(page + 1, null)} disabled={page === PAGES.length - 1} aria-label="Next page">
            {page < PAGES.length - 1
              ? `${catPages.length > 1 && current.index < current.of - 1 ? 'More' : CATEGORIES.find(c => c.id === PAGES[page + 1].cat)?.name} ›`
              : 'Next ›'}
          </button>
        </span>
      </div>
    </div>
  );
}

function GameScreen({id}: {id: string}) {
  const Comp = gameComponent(id);
  if (!Comp) return <div className="loading">Game not found</div>;
  return (
    <Suspense
      fallback={
        <div className="loading" role="status">
          <span className="spinner" />
          <span>Loading {gameName(id)}…</span>
        </div>
      }
    >
      <FocusOnMount>
        <Comp />
      </FocusOnMount>
    </Suspense>
  );
}

function FocusOnMount({children}: {children: React.ReactNode}) {
  useEffect(() => {
    settleFocus(() => focusDefault());
  }, []);
  return <>{children}</>;
}

function WalletModal({onClose}: {onClose: () => void}) {
  const w = useWallet();
  const [armed, setArmed] = useState(false);
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force(x => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const wait = wallet.bonusReadyIn();
  const hrs = Math.floor(wait / 3_600_000);
  const mins = Math.ceil((wait % 3_600_000) / 60_000);
  const winRate = w.bets ? Math.round((w.wins / w.bets) * 100) : 0;

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Wallet" data-focus-scope="modal">
        <div className="modal-head">
          <WalletIcon size={18} />
          <span>Wallet</span>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close wallet">
            Done
          </button>
        </div>
        <div className="wallet-balance">
          <span className="wb-label">Balance</span>
          <span className="wb-value">
            <Coin size={22} />
            {fmtCoins(w.balance)}
          </span>
        </div>
        <div className="wallet-actions">
          <button
            type="button"
            className="wa-btn tone-green"
            disabled={wait > 0}
            data-autofocus
            onClick={() => {
              if (wallet.claimBonus()) toast(`+${DAILY_BONUS.toLocaleString('en-US')} coins added`, 'win');
            }}
          >
            <Gift size={16} />
            <span>{wait > 0 ? `Bonus in ${hrs}h ${mins}m` : `Claim +${DAILY_BONUS.toLocaleString('en-US')}`}</span>
          </button>
          <button
            type="button"
            className={`wa-btn ${armed ? 'tone-red' : ''}`}
            onClick={() => {
              if (!armed) {
                setArmed(true);
                setTimeout(() => setArmed(false), 3000);
                return;
              }
              wallet.reset();
              setArmed(false);
            }}
          >
            <Refresh size={16} />
            <span>{armed ? 'Press again to reset' : 'Reset to 10,000'}</span>
          </button>
        </div>
        <div className="stat-grid">
          <Stat icon={<Chart size={13} />} label="Bets" value={w.bets.toLocaleString('en-US')} />
          <Stat label="Wagered" value={fmtCoins(w.wagered)} />
          <Stat label="Profit" value={fmtCoins(w.profit)} tone={w.profit >= 0 ? 'green' : 'red'} />
          <Stat icon={<Trophy size={13} />} label="Biggest win" value={fmtCoins(w.bestWin)} />
          <Stat label="Best multi" value={w.bestMult ? fmtMult(w.bestMult) : '—'} />
          <Stat label="Win rate" value={`${winRate}%`} />
        </div>
        <div className="recent">
          <div className="recent-head">
            <span>Game</span>
            <span>Bet</span>
            <span>Multi</span>
            <span>Payout</span>
          </div>
          {w.recent.length === 0 && <div className="recent-empty">No bets yet — pick a game.</div>}
          {w.recent.slice(0, 5).map(r => (
            <div key={r.id} className="recent-row">
              <span>{gameName(r.game)}</span>
              <span>{fmtCoins(r.bet)}</span>
              <span>{fmtMult(r.mult)}</span>
              <span className={r.payout > r.bet ? 'tone-green' : 'tone-muted'}>{r.payout > r.bet ? '+' : ''}{fmtCoins(r.payout - r.bet)}</span>
            </div>
          ))}
        </div>
        <p className="modal-note">Entertainment only. KMR Coins are play money with no cash value and can't be bought, sold, or redeemed.</p>
      </div>
    </div>
  );
}

function Stat({label, value, icon, tone}: {label: string; value: string; icon?: React.ReactNode; tone?: 'green' | 'red'}) {
  return (
    <div className="stat">
      <span className="stat-label">
        {icon}
        {label}
      </span>
      <span className={`stat-value${tone ? ` tone-${tone}` : ''}`}>{value}</span>
    </div>
  );
}
