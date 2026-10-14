import {lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {CATEGORIES, GAMES, gameComponent, gameName, type Category, type GameDef} from './games/registry';
import {GameArt} from './games/art';
import {isAdmin, startGrants} from './lib/admin';
import {leaderboardEnabled, startSync} from './lib/leaderboard';
import {luckInfo, useLuck} from './lib/luck';
import {profile, useProfile} from './lib/profile';
import {sfx, unlockAudio} from './lib/sfx';
import {focusDefault, focusEl, focusIsLost, installSpatialNav, setEdgeHandler} from './lib/spatial';
import {DAILY_BONUS, setToaster, START_BALANCE, toast, useWallet, wallet} from './lib/wallet';
import {fmtCoins, fmtMult} from './lib/util';
import {Chart, Clover, Coin, Crown, Gift, Refresh, Skull, Speaker, Star, Trophy, WalletIcon} from './ui/icons';
import NameSetup from './ui/NameSetup';

const Leaderboard = lazy(() => import('./ui/Leaderboard'));
const Admin = lazy(() => import('./ui/Admin'));
const PlayerModal = lazy(() => import('./ui/Leaderboard').then(m => ({default: m.PlayerModal})));

interface Nav {
  screen: 'lobby' | 'game' | 'leaders' | 'admin';
  id?: string;
  modal?: 'wallet' | 'player';
  player?: string;
}

const HOME: Nav = {screen: 'lobby'};

startSync();
startGrants();

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

function fmtWait(ms: number) {
  const total = Math.ceil(ms / 60_000);
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  return hrs ? `${hrs}h ${mins}m` : `${mins}m`;
}

interface Toast {
  id: number;
  msg: string;
  tone: 'info' | 'error' | 'win';
}

export default function App() {
  const p = useProfile();
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
      if ((history.state as {sheet?: string} | null)?.sheet) {
        // A game's settings sheet is open: Back just closes it (the sheet restores focus).
        history.back();
      } else if (n.modal) {
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

    // Sound: unlock on the first press, and a soft tick for every swipe.
    const onKey = (e: KeyboardEvent) => {
      unlockAudio();
      if (/^Arrow/.test(e.key)) sfx('move');
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', unlockAudio, true);
    document.addEventListener('click', unlockAudio, true);
    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', unlockAudio, true);
      document.removeEventListener('click', unlockAudio, true);
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
    profile.notePlayed(id);
    const next: Nav = {screen: 'game', id};
    safeHistory('push', next);
    setNav(next);
  }, []);

  const openLeaders = useCallback(() => {
    if (navRef.current.screen === 'leaders' || navRef.current.modal) return;
    const next: Nav = {screen: 'leaders'};
    // From a game, swap the game for the board so Back still lands in the lobby.
    safeHistory(navRef.current.screen === 'game' ? 'replace' : 'push', next);
    setNav(next);
  }, []);

  const openAdmin = useCallback(() => {
    if (navRef.current.screen === 'admin' || navRef.current.modal || !isAdmin()) return;
    const next: Nav = {screen: 'admin'};
    safeHistory(navRef.current.screen === 'lobby' ? 'push' : 'replace', next);
    setNav(next);
  }, []);

  const openModal = useCallback((modal: 'wallet' | 'player', player?: string) => {
    if (navRef.current.modal) return;
    modalOpener.current = document.activeElement as HTMLElement | null;
    const next: Nav = {...navRef.current, modal, player};
    safeHistory('push', next);
    setNav(next);
  }, []);
  const openWallet = useCallback(() => openModal('wallet'), [openModal]);

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
    } else if (nav.screen === 'lobby' && before.screen === 'leaders') {
      settleFocus(() => {
        if (!focusEl(document.querySelector<HTMLElement>('.lb-btn'))) focusDefault();
      });
    } else if (nav.screen === 'lobby' && before.screen === 'admin') {
      settleFocus(() => {
        if (!focusEl(document.querySelector<HTMLElement>('.admin-btn'))) focusDefault();
      });
    } else if ((nav.screen === 'leaders' || nav.screen === 'admin') && before.screen !== nav.screen) {
      settleFocus(() => focusDefault());
    }
  }, [nav]);

  // First launch and after picking a name: land on the screen's main control.
  useEffect(() => {
    settleFocus(() => focusDefault());
  }, [p.name]);

  const inGame = nav.screen === 'game' && nav.id;

  const toastLayer = (
    <div className="toasts" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast tone-${t.tone}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );

  if (!p.name)
    return (
      <>
        <NameSetup />
        {toastLayer}
      </>
    );

  return (
    <div className="app">
      <TopBar
        title={inGame ? gameName(nav.id!) : nav.screen === 'leaders' ? 'Leaderboard' : nav.screen === 'admin' ? 'Admin' : null}
        gameId={inGame ? nav.id! : null}
        onWallet={openWallet}
        onLeaders={openLeaders}
        onAdmin={openAdmin}
      />
      <main className="view" inert={nav.modal ? true : undefined}>
        {inGame ? (
          <GameScreen key={nav.id} id={nav.id!} />
        ) : nav.screen === 'admin' && isAdmin(p) ? (
          <Suspense fallback={<Loading label="Loading admin…" />}>
            <FocusOnMount>
              <Admin />
            </FocusOnMount>
          </Suspense>
        ) : nav.screen === 'leaders' ? (
          <Suspense fallback={<Loading label="Loading leaderboard…" />}>
            <FocusOnMount>
              <Leaderboard onPlayer={key => openModal('player', key)} />
            </FocusOnMount>
          </Suspense>
        ) : (
          <Lobby onOpen={openGame} onWallet={openWallet} />
        )}
      </main>
      {nav.modal === 'wallet' && <WalletModal onClose={() => history.back()} />}
      {nav.modal === 'player' && nav.player && (
        <Suspense fallback={null}>
          <PlayerModal playerKey={nav.player} onClose={() => history.back()} />
        </Suspense>
      )}
      {toastLayer}
    </div>
  );
}

function TopBar({title, gameId, onWallet, onLeaders, onAdmin}: {title: string | null; gameId: string | null; onWallet: () => void; onLeaders: () => void; onAdmin: () => void}) {
  const {balance} = useWallet();
  const p = useProfile();
  const lk = useLuck();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!lk.active) return;
    const t = setInterval(() => tick(x => x + 1), 30_000);
    return () => clearInterval(t);
  }, [lk.active]);
  const luckLeft = lk.active ? Math.max(1, Math.ceil((lk.until - Date.now()) / 60_000)) : 0;
  const [bump, setBump] = useState<'up' | 'down' | null>(null);
  const last = useRef(balance);
  useEffect(() => {
    if (balance === last.current) return;
    setBump(balance > last.current ? 'up' : 'down');
    last.current = balance;
    const t = setTimeout(() => setBump(null), 450);
    return () => clearTimeout(t);
  }, [balance]);
  const fav = gameId ? p.favorites.includes(gameId) : false;
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
        {gameId && (
          <button
            type="button"
            className={`icon-btn fav-btn${fav ? ' is-on' : ''}`}
            onClick={() => {
              const on = profile.toggleFavorite(gameId);
              sfx(on ? 'gem' : 'press');
              toast(on ? `${gameName(gameId)} added to My Games` : `${gameName(gameId)} removed from My Games`, on ? 'win' : 'info');
            }}
            aria-label={fav ? `Remove ${title} from favorites` : `Add ${title} to favorites`}
            aria-pressed={fav}
          >
            <Star size={17} filled={fav} />
          </button>
        )}
      </div>
      <div className="topbar-right">
        {lk.active !== 0 && (
          <span className={`luck-badge ${lk.active > 0 ? 'is-good' : 'is-bad'}`} aria-label={`${luckInfo(lk.active).name}, ${luckLeft} minutes left`}>
            {lk.active > 0 ? <Clover size={13} /> : <Skull size={13} />}
            {luckLeft >= 60 ? `${Math.round(luckLeft / 60)}h` : `${luckLeft}m`}
          </span>
        )}
        {isAdmin(p) && (
          <button type="button" className="icon-btn admin-btn is-admin" onClick={onAdmin} aria-label="Admin panel">
            <Crown size={17} />
          </button>
        )}
        <button type="button" className="icon-btn is-gold lb-btn" onClick={onLeaders} aria-label="Leaderboard">
          <Trophy size={17} />
        </button>
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
      </div>
    </header>
  );
}

const PER_PAGE = 8;
type LobbyCat = Category | 'mine';
interface LobbyPage {
  key: string;
  cat: LobbyCat;
  name: string;
  index: number;
  of: number;
  count: number;
  games: GameDef[];
}

function buildPages(mine: string[]): LobbyPage[] {
  const cats: {id: LobbyCat; name: string; games: GameDef[]}[] = [];
  const mineGames = mine.map(id => GAMES.find(g => g.id === id)).filter((g): g is GameDef => !!g);
  if (mineGames.length) cats.push({id: 'mine', name: 'My Games', games: mineGames});
  for (const c of CATEGORIES) cats.push({id: c.id, name: c.name, games: GAMES.filter(g => g.cat === c.id)});
  return cats.flatMap(c => {
    const of = Math.ceil(c.games.length / PER_PAGE);
    return Array.from({length: of}, (_, i) => ({
      key: `${c.id}:${i}`,
      cat: c.id,
      name: c.name,
      index: i,
      of,
      count: c.games.length,
      games: c.games.slice(i * PER_PAGE, (i + 1) * PER_PAGE),
    }));
  });
}

let lobbyKey = ''; // remembered while the app is open

function Lobby({onOpen, onWallet}: {onOpen: (id: string) => void; onWallet: () => void}) {
  const w = useWallet();
  const p = useProfile();
  const ready = wallet.bonusReadyIn() <= 0;
  const mine = useMemo(() => [...p.favorites, ...p.recentGames.filter(g => !p.favorites.includes(g))].slice(0, PER_PAGE), [p.favorites, p.recentGames]);
  const pages = useMemo(() => buildPages(mine), [mine]);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const [page, setPageState] = useState(() => {
    const found = pages.findIndex(pg => pg.key === lobbyKey);
    if (found >= 0) return found;
    // First visit: start on the main game list, not My Games.
    const main = pages.findIndex(pg => pg.cat === 'originals');
    return main >= 0 ? main : 0;
  });
  const [dir, setDir] = useState<1 | -1>(1);
  const pageRef = useRef(page);
  pageRef.current = page;
  const setPage = (pIdx: number, focus: 'first' | 'last' | null) => {
    const list = pagesRef.current;
    if (pIdx < 0 || pIdx >= list.length || pIdx === pageRef.current) return false;
    setDir(pIdx > pageRef.current ? 1 : -1);
    pageRef.current = pIdx;
    lobbyKey = list[pIdx].key;
    setPageState(pIdx);
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

  const pg = Math.min(page, pages.length - 1);
  const current = pages[pg];
  const tabs = pages.filter(x => x.index === 0);

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
            {p.name}
            {w.bets ? ` · ${w.bets.toLocaleString('en-US')} bet${w.bets === 1 ? '' : 's'}${w.bestMult > 0 ? ` · best ${fmtMult(w.bestMult)}` : ''}` : ` · ${GAMES.length} games · play money only`}
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
        {tabs.map(t => {
          const on = current.cat === t.cat;
          return (
            <button
              key={t.cat}
              type="button"
              role="tab"
              aria-selected={on}
              className={`tab${on ? ' is-on' : ''}${t.cat === 'mine' ? ' is-mine' : ''}`}
              onClick={() => setPage(pages.indexOf(t), null)}
            >
              {t.cat === 'mine' && <Star size={13} filled />}
              <span>{t.name}</span>
              <span className="tab-count">{t.count}</span>
            </button>
          );
        })}
      </div>

      <div className="tiles" key={current.key} data-dir={dir} role="tabpanel" aria-label={`${current.name} page ${current.index + 1}`}>
        {current.games.map(g => {
          const fav = p.favorites.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              className="tile"
              data-game={g.id}
              onClick={() => onOpen(g.id)}
              style={{background: `linear-gradient(160deg, ${g.from}, ${g.to})`}}
              aria-label={`Play ${g.name}`}
            >
              {g.tag && current.cat !== 'mine' && <span className={`tile-tag tag-${g.tag.toLowerCase()}`}>{g.tag}</span>}
              {current.cat === 'mine' && <span className={`tile-tag ${fav ? 'tag-fav' : 'tag-recent'}`}>{fav ? '★ Favorite' : 'Recent'}</span>}
              <GameArt id={g.id} />
              <span className="tile-name">{g.name}</span>
              <span className="tile-sub">{g.cat === 'originals' ? 'KMR Originals' : g.cat === 'table' ? 'Table' : 'Featured'}</span>
            </button>
          );
        })}
        {Array.from({length: PER_PAGE - current.games.length}, (_, i) => (
          <div key={`soon-${i}`} className="tile-ghost" aria-hidden="true">
            {i === 0 && <span>{current.cat === 'mine' ? 'Press ★ in any game to pin it here' : 'More games soon'}</span>}
          </div>
        ))}
      </div>

      <div className="pager">
        <span className="pager-dots" aria-hidden="true">
          {pages.map((x, i) => (
            <i key={x.key} className={`${i === pg ? 'is-on' : ''}${x.cat !== current.cat ? ' is-other' : ''}`} />
          ))}
        </span>
        <span className="pager-btns">
          <button type="button" className="pager-btn" onClick={() => setPage(pg - 1, null)} disabled={pg === 0} aria-label="Previous page">
            ‹ Prev
          </button>
          <button type="button" className="pager-btn" onClick={() => setPage(pg + 1, null)} disabled={pg === pages.length - 1} aria-label="Next page">
            {pg < pages.length - 1 ? `${current.index < current.of - 1 ? 'More' : pages[pg + 1].name} ›` : 'Next ›'}
          </button>
        </span>
      </div>
    </div>
  );
}

function Loading({label}: {label: string}) {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}

function GameScreen({id}: {id: string}) {
  const Comp = gameComponent(id);
  if (!Comp) return <div className="loading">Game not found</div>;
  return (
    <Suspense fallback={<Loading label={`Loading ${gameName(id)}…`} />}>
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
  const p = useProfile();
  const [armed, setArmed] = useState(false);
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force(x => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const wait = wallet.bonusReadyIn();
  const resetWait = profile.resetReadyIn();
  const winRate = w.bets ? Math.round((w.wins / w.bets) * 100) : 0;

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Wallet" data-focus-scope="modal">
        <div className="modal-head">
          <WalletIcon size={18} />
          <span>Wallet</span>
          <span className="modal-who">{p.name}</span>
          <button
            type="button"
            className={`modal-sound${p.sound ? '' : ' is-off'}`}
            onClick={() => {
              profile.setSound(!p.sound);
              if (!p.sound) requestAnimationFrame(() => sfx('win'));
            }}
            aria-label={p.sound ? 'Sound on' : 'Sound off'}
            aria-pressed={p.sound}
          >
            <Speaker size={16} off={!p.sound} />
            {p.sound ? 'Sound on' : 'Muted'}
          </button>
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
              if (wallet.claimBonus()) {
                sfx('cash');
                toast(`+${DAILY_BONUS.toLocaleString('en-US')} coins added`, 'win');
              }
            }}
          >
            <Gift size={16} />
            <span>{wait > 0 ? `Bonus in ${fmtWait(wait)}` : `Claim +${DAILY_BONUS.toLocaleString('en-US')}`}</span>
          </button>
          <button
            type="button"
            className={`wa-btn ${armed ? 'tone-red' : ''}`}
            disabled={resetWait > 0}
            onClick={() => {
              if (!armed) {
                setArmed(true);
                setTimeout(() => setArmed(false), 3000);
                return;
              }
              wallet.reset();
              profile.noteReset();
              setArmed(false);
              toast(`Balance reset to ${START_BALANCE.toLocaleString('en-US')}. Next reset in 24h.`, 'info');
            }}
          >
            <Refresh size={16} />
            <span>{resetWait > 0 ? `Next reset in ${fmtWait(resetWait)}` : armed ? 'Press again to reset' : `Reset to ${START_BALANCE.toLocaleString('en-US')} · 1 a day`}</span>
          </button>
        </div>
        <div className="stat-grid">
          <Stat icon={<Chart size={13} />} label="Bets" value={w.bets.toLocaleString('en-US')} />
          <Stat label="Wagered" value={fmtCoins(w.wagered)} />
          <Stat label="Profit" value={fmtCoins(w.profit)} tone={w.profit >= 0 ? 'green' : 'red'} />
          <Stat icon={<Trophy size={13} />} label="Biggest win" value={fmtCoins(w.bestWin)} />
          <Stat label="Best multi" value={w.bestMult ? fmtMult(w.bestMult) : '—'} />
          <Stat label={`Win rate · ${p.resets} reset${p.resets === 1 ? '' : 's'}`} value={`${winRate}%`} />
        </div>
        <div className="recent">
          <div className="recent-head">
            <span>Game</span>
            <span>Bet</span>
            <span>Multi</span>
            <span>Payout</span>
          </div>
          {w.recent.length === 0 && <div className="recent-empty">No bets yet — pick a game.</div>}
          {w.recent.slice(0, 4).map(r => (
            <div key={r.id} className="recent-row">
              <span>{gameName(r.game)}</span>
              <span>{fmtCoins(r.bet)}</span>
              <span>{fmtMult(r.mult)}</span>
              <span className={r.payout > r.bet ? 'tone-green' : 'tone-muted'}>
                {r.payout > r.bet ? '+' : ''}
                {fmtCoins(r.payout - r.bet)}
              </span>
            </div>
          ))}
        </div>
        <p className="modal-note">
          {leaderboardEnabled() ? 'Your stats update on the global leaderboard. ' : ''}Entertainment only. KMR Coins are play money with no cash value.
        </p>
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
