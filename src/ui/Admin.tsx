// Admin panel (only for the player named "kmr"): change any player's coins and luck, including your own.
// Everything is D-pad driven: pick a player from the list or type their name on the on-screen keyboard.
import {useCallback, useEffect, useRef, useState} from 'react';
import {ADMIN, describe, fmtMins, pending, send, type Command} from '../lib/admin';
import {checkName, fetchBoard, type BoardEntry} from '../lib/leaderboard';
import {LUCK_LEVELS, luckInfo, useLuck} from '../lib/luck';
import {useProfile} from '../lib/profile';
import {sfx} from '../lib/sfx';
import {focusDefault, focusEl} from '../lib/spatial';
import {fmtCoins} from '../lib/util';
import {toast, useWallet} from '../lib/wallet';
import {Backspace, Clover, Coin, Crown, Gift, Keyboard, Refresh, Skull} from './icons';
import './Admin.css';

const AMOUNTS = [1_000, 10_000, 100_000, 1_000_000, 10_000_000];
const DURATIONS = [5, 15, 60, 360, 1440];
const short = (n: number) => (n >= 1e6 ? `${n / 1e6}M` : n >= 1e3 ? `${n / 1e3}K` : String(n));

type Overlay = null | 'name' | 'amount';

/** An overlay that lives in browser history, so the glasses' Back closes it. */
function useOverlay() {
  const [open, setOpen] = useState<Overlay>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const onPop = () => {
      const st = (history.state as {sheet?: string} | null)?.sheet;
      setOpen(prev => {
        if (prev && st !== 'admin') requestAnimationFrame(() => focusEl(opener.current) || focusDefault());
        return st === 'admin' ? prev : null;
      });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const show = useCallback((o: Overlay) => {
    opener.current = document.activeElement as HTMLElement | null;
    try {
      history.pushState({...(history.state ?? {}), sheet: 'admin'}, '');
    } catch {
      /* history unavailable: Done still closes it */
    }
    setOpen(o);
    requestAnimationFrame(() => focusDefault());
  }, []);
  const close = useCallback(() => {
    if ((history.state as {sheet?: string} | null)?.sheet === 'admin') history.back();
    else {
      setOpen(null);
      requestAnimationFrame(() => focusEl(opener.current) || focusDefault());
    }
  }, []);
  return {open, show, close};
}

export default function Admin() {
  const me = useProfile().name ?? ADMIN;
  const w = useWallet();
  const myLuck = useLuck();
  const [players, setPlayers] = useState<BoardEntry[] | null>(null);
  const [target, setTarget] = useState(me);
  const [amount, setAmount] = useState(10_000);
  const [level, setLevel] = useState(1);
  const [mins, setMins] = useState(15);
  const [waiting, setWaiting] = useState<{type: string; amount?: number; level?: number; mins?: number}[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const ov = useOverlay();

  const self = target.toLowerCase() === me.toLowerCase();
  const entry = players?.find(p => p.name.toLowerCase() === target.toLowerCase()) ?? null;

  const load = useCallback(async () => setPlayers(await fetchBoard()), []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setWaiting(null);
    if (self) return;
    let live = true;
    void pending(target).then(g => live && setWaiting(g));
    return () => {
      live = false;
    };
  }, [target, self]);

  const run = async (c: Command) => {
    if (busy) return;
    setBusy(true);
    const res = await send(target, c);
    setBusy(false);
    const what = describe(c);
    if (res === 'ok') {
      if (!self) {
        sfx('cash');
        toast(`Sent to ${target}: ${what}`, 'win');
        void pending(target).then(setWaiting);
      }
      setLast(`${self ? 'You' : target}: ${what}`);
      setTimeout(() => void load(), 1500);
    } else if (res === 'denied') {
      sfx('lose');
      toast('The database refused it: publish the new rules (see README)', 'error');
    } else {
      sfx('lose');
      toast("Couldn't reach the leaderboard. Try again", 'error');
    }
  };

  const others = (players ?? []).filter(p => p.name.toLowerCase() !== me.toLowerCase()).sort((a, b) => a.name.localeCompare(b.name));
  const balance = self ? w.balance : entry?.balance;
  const L = luckInfo(level);

  return (
    <div className="admin">
      <aside className="adm-players" aria-label="Players">
        <div className="adm-title">
          <Crown size={15} /> Admin
        </div>
        <button type="button" className="adm-typebtn" onClick={() => ov.show('name')}>
          <Keyboard size={16} /> Type a name
        </button>
        <div className="adm-list">
          <PlayerRow name={me} sub={`${fmtCoins(w.balance)} · you`} on={self} onPick={() => setTarget(me)} autoFocus />
          {players === null && <div className="adm-empty">Loading players…</div>}
          {others.map(p => (
            <PlayerRow key={p.name} name={p.name} sub={fmtCoins(p.balance)} on={p.name.toLowerCase() === target.toLowerCase()} onPick={() => setTarget(p.name)} />
          ))}
          {players && !others.length && <div className="adm-empty">No other players yet</div>}
        </div>
      </aside>

      <section className="adm-panel">
        <header className="adm-target">
          <div className="adm-who">
            <b>{target}</b>
            {self && <span className="adm-chip">You</span>}
            {!self && !entry && players && <span className="adm-chip is-warn">Not on the board</span>}
          </div>
          <div className="adm-meta">
            <span>
              <Coin size={13} /> {balance === undefined ? '—' : fmtCoins(balance)}
              {!self && entry && <em> · profit {fmtCoins(entry.profit)}</em>}
            </span>
            {self ? (
              myLuck.active ? (
                <span className={myLuck.active > 0 ? 'tone-green' : 'tone-red'}>
                  {luckInfo(myLuck.active).name} · {fmtMins(Math.max(1, Math.ceil((myLuck.until - Date.now()) / 60000)))} left
                </span>
              ) : (
                <span className="tone-muted">Normal luck</span>
              )
            ) : waiting && waiting.length ? (
              <span className="tone-gold">
                {waiting.length} waiting · applies when {target} opens the casino
              </span>
            ) : (
              <span className="tone-muted">Commands apply within seconds</span>
            )}
          </div>
        </header>

        <div className="adm-sec">
          <span className="adm-label">Coins</span>
          <div className="adm-chips" role="group" aria-label="Amount">
            {AMOUNTS.map(a => (
              <button key={a} type="button" className={`adm-chip-btn${amount === a ? ' is-on' : ''}`} onClick={() => setAmount(a)} aria-pressed={amount === a}>
                {short(a)}
              </button>
            ))}
            <button type="button" className={`adm-chip-btn${AMOUNTS.includes(amount) ? '' : ' is-on'}`} onClick={() => ov.show('amount')} aria-label={`Custom amount ${fmtCoins(amount)}`}>
              {AMOUNTS.includes(amount) ? '…' : short(amount)}
            </button>
          </div>
          <div className="adm-actions">
            <button type="button" className="adm-act is-green" disabled={busy} onClick={() => void run({type: 'add', amount})}>
              + Add {fmtCoins(amount)}
            </button>
            <button type="button" className="adm-act is-red" disabled={busy} onClick={() => void run({type: 'remove', amount})}>
              − Remove
            </button>
            <button type="button" className="adm-act" disabled={busy} onClick={() => void run({type: 'set', amount})}>
              = Set
            </button>
          </div>
        </div>

        <div className="adm-sec">
          <span className="adm-label">Luck</span>
          <div className="adm-chips adm-luck" role="group" aria-label="Luck level">
            {LUCK_LEVELS.map(l => (
              <button
                key={l.level}
                type="button"
                className={`adm-chip-btn luck-${l.level < 0 ? 'bad' : l.level > 0 ? 'good' : 'none'}${level === l.level ? ' is-on' : ''}`}
                onClick={() => setLevel(l.level)}
                aria-pressed={level === l.level}
              >
                {l.level > 0 ? <Clover size={12} /> : l.level < 0 ? <Skull size={12} /> : null}
                {l.name}
              </button>
            ))}
          </div>
          <div className="adm-chips" role="group" aria-label="Duration">
            {DURATIONS.map(m => (
              <button key={m} type="button" className={`adm-chip-btn${mins === m ? ' is-on' : ''}`} onClick={() => setMins(m)} aria-pressed={mins === m} disabled={level === 0}>
                {fmtMins(m)}
              </button>
            ))}
          </div>
          <button type="button" className={`adm-act adm-wide ${level > 0 ? 'is-green' : level < 0 ? 'is-red' : ''}`} disabled={busy} onClick={() => void run({type: 'luck', level, mins})}>
            {level === 0 ? 'Clear luck (back to normal)' : `Give ${L.name} for ${fmtMins(mins)}`}
          </button>
        </div>

        <div className="adm-actions">
          <button type="button" className="adm-act" disabled={busy} onClick={() => void run({type: 'reset'})}>
            <Refresh size={14} /> Give reset back
          </button>
          <button type="button" className="adm-act" disabled={busy} onClick={() => void run({type: 'bonus'})}>
            <Gift size={14} /> Bonus ready
          </button>
        </div>
        <p className="adm-last" aria-live="polite">
          {last ? `Last: ${last}` : 'Lucky players win more often in every game for as long as the luck lasts.'}
        </p>
      </section>

      {ov.open === 'name' && (
        <NameKeyboard
          players={players ?? []}
          onClose={ov.close}
          onPick={name => {
            setTarget(name);
            ov.close();
          }}
        />
      )}
      {ov.open === 'amount' && (
        <AmountPad
          start={amount}
          onClose={ov.close}
          onPick={a => {
            setAmount(a);
            ov.close();
          }}
        />
      )}
    </div>
  );
}

function PlayerRow({name, sub, on, onPick, autoFocus}: {name: string; sub: string; on: boolean; onPick: () => void; autoFocus?: boolean}) {
  return (
    <button type="button" className={`adm-row${on ? ' is-on' : ''}`} onClick={onPick} aria-pressed={on} data-autofocus={autoFocus ? '' : undefined}>
      <b>{name}</b>
      <small>{sub}</small>
    </button>
  );
}

const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm_'];

function NameKeyboard({players, onClose, onPick}: {players: BoardEntry[]; onClose: () => void; onPick: (name: string) => void}) {
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('Type the player name, then Find');
  const [checking, setChecking] = useState(false);
  const matches = name ? players.filter(p => p.name.toLowerCase().startsWith(name.toLowerCase())).slice(0, 3) : [];

  const find = async () => {
    if (name.length < 3 || checking) {
      sfx('lose');
      setMsg('Names are at least 3 characters');
      return;
    }
    const hit = players.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (hit) return onPick(hit.name);
    setChecking(true);
    const s = await checkName(name);
    setChecking(false);
    if (s === 'taken') onPick(name);
    else {
      sfx('lose');
      setMsg(s === 'offline' ? "Can't check right now" : `No player called “${name}”`);
    }
  };

  return (
    <div className="sheet-backdrop">
      <div className="sheet adm-kb" role="dialog" aria-modal="true" aria-label="Type a player name" data-focus-scope="modal">
        <div className="adm-kb-field">
          <span>{name || <i>player name</i>}</span>
          <small>{msg}</small>
        </div>
        {matches.length > 0 && (
          <div className="adm-kb-matches">
            {matches.map(m => (
              <button key={m.name} type="button" className="adm-chip-btn" onClick={() => onPick(m.name)}>
                {m.name}
              </button>
            ))}
          </div>
        )}
        <div className="adm-keys">
          {ROWS.map((row, r) => (
            <div key={row} className="adm-krow">
              {row.split('').map((ch, i) => (
                <button
                  key={ch}
                  type="button"
                  className="adm-key"
                  data-autofocus={r === 1 && i === 0 ? '' : undefined}
                  onClick={() => {
                    sfx('key');
                    setName(n => (n.length < 12 ? n + ch : n));
                  }}
                >
                  {ch}
                </button>
              ))}
              {r === 3 && (
                <button type="button" className="adm-key is-fn" aria-label="Delete" onClick={() => setName(n => n.slice(0, -1))}>
                  <Backspace size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="adm-actions">
          <button type="button" className="adm-act" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="adm-act is-green" onClick={() => void find()}>
            {checking ? 'Checking…' : 'Find player'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AmountPad({start, onClose, onPick}: {start: number; onClose: () => void; onPick: (n: number) => void}) {
  const [v, setV] = useState(AMOUNTS.includes(start) ? '' : String(start));
  const n = Math.min(1e12, Number(v || 0));
  const press = (k: string) => {
    sfx('key');
    setV(x => (k === 'del' ? x.slice(0, -1) : (x + k).replace(/^0+/, '').slice(0, 13)));
  };
  return (
    <div className="sheet-backdrop">
      <div className="sheet adm-pad" role="dialog" aria-modal="true" aria-label="Type an amount" data-focus-scope="modal">
        <div className="adm-kb-field">
          <span>
            <Coin size={18} /> {v ? fmtCoins(n) : <i>amount</i>}
          </span>
        </div>
        <div className="adm-padkeys">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'del'].map((k, i) => (
            <button key={k} type="button" className={`adm-key${k === 'del' ? ' is-fn' : ''}`} data-autofocus={i === 0 ? '' : undefined} onClick={() => press(k)} aria-label={k === 'del' ? 'Delete' : k}>
              {k === 'del' ? <Backspace size={16} /> : k}
            </button>
          ))}
        </div>
        <div className="adm-actions">
          <button type="button" className="adm-act" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="adm-act is-green" disabled={n <= 0} onClick={() => onPick(n)}>
            Use {n > 0 ? fmtCoins(n) : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
