import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {GameArt} from '../games/art';
import {gameName} from '../games/registry';
import {fetchBoard, leaderboardEnabled, type BoardEntry} from '../lib/leaderboard';
import {profile, useProfile} from '../lib/profile';
import {focusDefault, focusEl, focusIsLost} from '../lib/spatial';
import {fmtCoins, fmtMult} from '../lib/util';
import {useWallet, wallet} from '../lib/wallet';
import {Coin, Refresh, Trophy} from './icons';
import './Leaderboard.css';

type Tab = 'profit' | 'wins' | 'wagered' | 'live';
const TABS: {id: Tab; label: string}[] = [
  {id: 'profit', label: 'Profit'},
  {id: 'wins', label: 'Biggest win'},
  {id: 'wagered', label: 'Wagered'},
  {id: 'live', label: 'Recent bets'},
];
const PER_PAGE = 6;

// Last board we loaded, shared with the player card.
let cache: {list: BoardEntry[]; at: number} | null = null;
let tabMemo: Tab = 'profit';

function myEntry(): BoardEntry | null {
  const p = profile.get();
  if (!p.name) return null;
  const w = wallet.get();
  return {
    name: p.name,
    profit: w.profit,
    balance: w.balance,
    wagered: w.wagered,
    bets: w.bets,
    wins: w.wins,
    bestWin: w.bestWin,
    bestMult: w.bestMult,
    resets: p.resets,
    joined: p.joined,
    updated: Date.now(),
    recent: w.recent.slice(0, 10).map(r => ({g: r.game, b: r.bet, m: r.mult, p: r.payout, t: r.at})),
  };
}

/** Board with this player's live numbers merged in (they're always fresher locally). */
export function boardWithMe(list: BoardEntry[]): BoardEntry[] {
  const me = myEntry();
  if (!me) return list;
  const key = me.name.toLowerCase();
  return [...list.filter(e => e.name.toLowerCase() !== key), me];
}

export function ago(t: number): string {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const signed = (x: number) => `${x > 0 ? '+' : ''}${fmtCoins(x)}`;

function sortFor(tab: Tab) {
  if (tab === 'wins') return (a: BoardEntry, b: BoardEntry) => b.bestWin - a.bestWin || b.profit - a.profit;
  if (tab === 'wagered') return (a: BoardEntry, b: BoardEntry) => b.wagered - a.wagered || b.profit - a.profit;
  return (a: BoardEntry, b: BoardEntry) => b.profit - a.profit || b.wagered - a.wagered;
}

export default function Leaderboard({onPlayer}: {onPlayer: (key: string) => void}) {
  const p = useProfile();
  useWallet(); // re-render when this player's numbers change
  const enabled = leaderboardEnabled();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>(cache ? 'ok' : 'loading');
  const [list, setList] = useState<BoardEntry[]>(cache?.list ?? []);
  const [at, setAt] = useState(cache?.at ?? 0);
  const [tab, setTabState] = useState<Tab>(tabMemo);
  const [page, setPage] = useState(0);
  const [, tick] = useState(0);
  const loading = useRef(false);

  const load = useCallback(async () => {
    if (!enabled || loading.current) return;
    loading.current = true;
    const data = await fetchBoard();
    loading.current = false;
    if (data) {
      cache = {list: data, at: Date.now()};
      setList(data);
      setAt(cache.at);
      setState('ok');
    } else setState(s => (s === 'ok' ? 'ok' : 'error'));
  }, [enabled]);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      void load();
      tick(x => x + 1);
    }, 20_000);
    return () => clearInterval(t);
  }, [load]);

  const setTab = (t: Tab) => {
    tabMemo = t;
    setTabState(t);
    setPage(0);
  };

  // While the first load is in flight, show nothing rather than a list that reshuffles.
  const waiting = enabled && state === 'loading' && list.length === 0;
  const all = useMemo(() => (waiting ? [] : boardWithMe(list)), [waiting, list, p.name, p.resets]); // eslint-disable-line react-hooks/exhaustive-deps
  const myKey = p.name?.toLowerCase() ?? '';
  const ranked = useMemo(() => [...all].sort(sortFor(tab === 'live' ? 'profit' : tab)), [all, tab]);
  const live = useMemo(
    () =>
      all
        .flatMap(e => (e.recent ?? []).map(r => ({...r, who: e.name, key: e.name.toLowerCase()})))
        .sort((a, b) => b.t - a.t)
        .slice(0, 36),
    [all],
  );

  const rows = tab === 'live' ? live : ranked;
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const pg = Math.min(page, pages - 1);
  const slice = rows.slice(pg * PER_PAGE, (pg + 1) * PER_PAGE);
  const myRank = ranked.findIndex(e => e.name.toLowerCase() === myKey);
  const meVisible = tab !== 'live' && slice.some(e => 'name' in e && e.name.toLowerCase() === myKey);

  // Keep focus inside the list when a page flips under it.
  const flip = (d: number) => {
    setPage(Math.max(0, Math.min(pages - 1, pg + d)));
    requestAnimationFrame(() => focusIsLost() && focusEl(document.querySelector<HTMLElement>('.lb-pager button:not(:disabled)')));
  };

  // When the list first fills in, move focus from the top bar/tabs onto the top row.
  const placed = useRef(false);
  useEffect(() => {
    requestAnimationFrame(() => {
      if (document.querySelector('[data-focus-scope="modal"]')) return;
      const a = document.activeElement;
      const row = document.querySelector<HTMLElement>('.lb-row');
      if (focusIsLost() || (!placed.current && row && !a?.closest('.lb-row'))) {
        if (row) placed.current = true;
        focusDefault();
      }
    });
  }, [state, list.length]);

  const valueOf = (e: BoardEntry) => (tab === 'wins' ? fmtCoins(e.bestWin) : tab === 'wagered' ? fmtCoins(e.wagered) : signed(e.profit));
  const toneOf = (e: BoardEntry) => (tab === 'profit' ? (e.profit > 0 ? 'tone-green' : e.profit < 0 ? 'tone-red' : '') : '');

  return (
    <div className="lb">
      <div className="lb-head">
        <span className="lb-trophy">
          <Trophy size={22} />
        </span>
        <div className="lb-titles">
          <h2>Leaderboard</h2>
          <span>
            {!enabled
              ? 'Your stats on these glasses'
              : state === 'ok'
                ? `${all.length} player${all.length === 1 ? '' : 's'} · updated ${ago(at)}`
                : state === 'loading'
                  ? 'Loading players…'
                  : 'Offline'}
          </span>
        </div>
        {enabled && (
          <button type="button" className="lb-refresh" onClick={() => void load()} aria-label="Refresh leaderboard">
            <Refresh size={15} />
            Refresh
          </button>
        )}
      </div>

      <div className="lb-tabs" role="tablist" aria-label="Leaderboard type">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`lb-tab${tab === t.id ? ' is-on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {enabled && state === 'error' && list.length === 0 ? (
        <div className="lb-empty">
          <b>Couldn't load the leaderboard</b>
          <span>Check that the glasses are online, then try again.</span>
          <button type="button" className="lb-retry" onClick={() => void load()} data-autofocus>
            Try again
          </button>
        </div>
      ) : (
        <div className="lb-list" key={`${tab}-${pg}`}>
          {!enabled && (
            <div className="lb-note">The global leaderboard isn't switched on yet. Your name and stats are saved and will appear for everyone once it is.</div>
          )}
          {enabled && state === 'loading' && list.length === 0 && <div className="lb-note">Loading players…</div>}
          {tab !== 'live'
            ? (slice as BoardEntry[]).map((e, i) => {
                const rank = pg * PER_PAGE + i + 1;
                const key = e.name.toLowerCase();
                return (
                  <button
                    key={key}
                    type="button"
                    className={`lb-row${key === myKey ? ' is-me' : ''}`}
                    onClick={() => onPlayer(key)}
                    data-autofocus={i === 0 ? '' : undefined}
                    aria-label={`#${rank} ${e.name}, ${valueOf(e)}`}
                  >
                    <span className={`lb-rank r${Math.min(rank, 4)}`}>{rank}</span>
                    <span className="lb-who">
                      <b>
                        {e.name}
                        {key === myKey && <i className="lb-you">You</i>}
                      </b>
                      <small>
                        {e.bets.toLocaleString('en-US')} bet{e.bets === 1 ? '' : 's'}{e.bestMult > 0 ? ` · best ${fmtMult(e.bestMult)}` : ''}
                        {e.resets > 0 && (
                          <span className="lb-resets">
                            {e.resets} reset{e.resets === 1 ? '' : 's'}
                          </span>
                        )}
                      </small>
                    </span>
                    <span className={`lb-value ${toneOf(e)}`}>
                      <Coin size={13} />
                      {valueOf(e)}
                    </span>
                  </button>
                );
              })
            : (slice as typeof live).map((r, i) => {
                const won = r.p > r.b;
                return (
                  <button
                    key={`${r.key}-${r.t}-${i}`}
                    type="button"
                    className={`lb-row is-bet${r.key === myKey ? ' is-me' : ''}`}
                    onClick={() => onPlayer(r.key)}
                    data-autofocus={i === 0 ? '' : undefined}
                    aria-label={`${r.who} ${won ? 'won' : 'lost'} on ${gameName(r.g)}`}
                  >
                    <span className="lb-game">
                      <GameArt id={r.g} />
                    </span>
                    <span className="lb-who">
                      <b>{r.who}</b>
                      <small>
                        {gameName(r.g)} · {ago(r.t)}
                      </small>
                    </span>
                    <span className="lb-bet">
                      <small>{fmtMult(r.m)}</small>
                      <b className={won ? 'tone-green' : 'tone-muted'}>{signed(r.p - r.b)}</b>
                    </span>
                  </button>
                );
              })}
          {tab === 'live' && live.length === 0 && state !== 'loading' && <div className="lb-note">No bets yet. Play a game and yours shows up here.</div>}
        </div>
      )}

      <div className="lb-foot">
        {tab !== 'live' && myRank >= 0 && !meVisible ? (
          <div className="lb-mine">
            <span className="lb-rank">{myRank + 1}</span>
            <b>{p.name}</b>
            <span className={toneOf(ranked[myRank])}>{valueOf(ranked[myRank])}</span>
          </div>
        ) : (
          <span className="lb-pageinfo">
            Page {pg + 1} of {pages}
          </span>
        )}
        <span className="lb-pager">
          <button type="button" className="pager-btn" onClick={() => flip(-1)} disabled={pg === 0} aria-label="Previous page">
            ‹ Prev
          </button>
          <button type="button" className="pager-btn" onClick={() => flip(1)} disabled={pg >= pages - 1} aria-label="Next page">
            Next ›
          </button>
        </span>
      </div>
    </div>
  );
}

export function PlayerModal({playerKey, onClose}: {playerKey: string; onClose: () => void}) {
  useWallet();
  const list = boardWithMe(cache?.list ?? []);
  const e = list.find(x => x.name.toLowerCase() === playerKey);
  const rank = [...list].sort(sortFor('profit')).findIndex(x => x.name.toLowerCase() === playerKey) + 1;
  const isMe = profile.get().name?.toLowerCase() === playerKey;
  return (
    <div className="modal-backdrop">
      <div className="modal lb-card" role="dialog" aria-modal="true" aria-label={e ? `${e.name} stats` : 'Player'} data-focus-scope="modal">
        <div className="modal-head">
          <span className={`lb-rank r${Math.min(rank || 4, 4)}`}>{rank || '–'}</span>
          <span className="lb-card-name">{e?.name ?? playerKey}</span>
          {isMe && <i className="lb-you">You</i>}
          <button type="button" className="modal-close" onClick={onClose} data-autofocus>
            Done
          </button>
        </div>
        {!e ? (
          <div className="recent-empty">This player isn't on the board right now.</div>
        ) : (
          <>
            <div className="stat-grid lb-stats">
              <S label="Balance" value={fmtCoins(e.balance)} />
              <S label="Profit" value={signed(e.profit)} tone={e.profit > 0 ? 'green' : e.profit < 0 ? 'red' : undefined} />
              <S label="Wagered" value={fmtCoins(e.wagered)} />
              <S label="Bets" value={e.bets.toLocaleString('en-US')} />
              <S label="Win rate" value={`${e.bets ? Math.round((e.wins / e.bets) * 100) : 0}%`} />
              <S label="Biggest win" value={fmtCoins(e.bestWin)} />
              <S label="Best multi" value={e.bestMult ? fmtMult(e.bestMult) : '—'} />
              <S label="Daily resets used" value={String(e.resets)} />
              <S label={isMe ? 'Joined' : 'Last played'} value={isMe ? new Date(e.joined || Date.now()).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : ago(e.updated)} />
            </div>
            <div className="recent">
              <div className="recent-head">
                <span>Game</span>
                <span>Bet</span>
                <span>Multi</span>
                <span>Profit</span>
              </div>
              {(e.recent ?? []).length === 0 && <div className="recent-empty">No bets yet.</div>}
              {(e.recent ?? []).slice(0, 5).map((r, i) => (
                <div key={`${r.t}-${i}`} className="recent-row">
                  <span>{gameName(r.g)}</span>
                  <span>{fmtCoins(r.b)}</span>
                  <span>{fmtMult(r.m)}</span>
                  <span className={r.p > r.b ? 'tone-green' : 'tone-muted'}>{signed(r.p - r.b)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function S({label, value, tone}: {label: string; value: string; tone?: 'green' | 'red'}) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value${tone ? ` tone-${tone}` : ''}`}>{value}</span>
    </div>
  );
}
