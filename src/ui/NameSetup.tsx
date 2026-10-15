// First-run screen: pick a player name with an on-screen keyboard (no typing on the glasses).
// Swipe between keys, pinch to press, exactly like every other control in the casino.
import {useEffect, useRef, useState} from 'react';
import {checkName, claimName, leaderboardEnabled, type NameStatus} from '../lib/leaderboard';
import {NAME_RE, profile, useProfile} from '../lib/profile';
import {sfx} from '../lib/sfx';
import {focusDefault} from '../lib/spatial';
import {pick, randInt} from '../lib/util';
import {toast} from '../lib/wallet';
import {Backspace, DiceIcon, LinkIcon, ShiftIcon} from './icons';
import {LinkEnter} from './Link';
import './NameSetup.css';

const ROWS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL'];
const LAST = 'ZXCVBNM';
const MAX = 12;

const ADJ = ['Lucky', 'Royal', 'Neon', 'Turbo', 'Golden', 'Wild', 'Cosmic', 'Rapid', 'Brave', 'Mega', 'Hyper', 'Ice', 'Night', 'Prime', 'Sly'];
const NOUN = ['Fox', 'Ace', 'Wolf', 'Hawk', 'Tiger', 'Shark', 'Comet', 'Viper', 'Bear', 'Raven', 'Lynx', 'King', 'Jet', 'Owl', 'Orca'];

function randomName(): string {
  const base = pick(ADJ) + pick(NOUN);
  const room = MAX - base.length;
  return room >= 2 ? base + String(10 + randInt(90)) : room === 1 ? base + randInt(10) : base.slice(0, MAX);
}

type Status = 'idle' | 'short' | 'checking' | NameStatus;

export default function NameSetup() {
  const p = useProfile();
  const [name, setName] = useState('');
  const [shift, setShift] = useState(true);
  const [status, setStatus] = useState<Status>('idle');
  const [saving, setSaving] = useState(false);
  const [shake, setShake] = useState(0);
  const checkSeq = useRef(0);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => focusDefault());
  }, []);

  // Live availability check (only when the global leaderboard is switched on).
  useEffect(() => {
    if (!name) return setStatus('idle');
    if (!NAME_RE.test(name)) return setStatus('short');
    if (!leaderboardEnabled()) return setStatus('free');
    setStatus('checking');
    const seq = ++checkSeq.current;
    const t = setTimeout(async () => {
      const s = await checkName(name);
      if (seq === checkSeq.current) setStatus(s);
    }, 450);
    return () => clearTimeout(t);
  }, [name]);

  const type = (ch: string) => {
    sfx('key');
    if (name.length >= MAX) {
      setShake(s => s + 1);
      return;
    }
    const isLetter = /[A-Z]/i.test(ch);
    setName(n => n + (isLetter ? (shift ? ch.toUpperCase() : ch.toLowerCase()) : ch));
    if (isLetter) setShift(false);
  };

  const back = () => {
    sfx('key');
    setName(n => {
      const next = n.slice(0, -1);
      if (!next) setShift(true);
      return next;
    });
  };

  const join = async () => {
    if (saving) return;
    if (!NAME_RE.test(name) || status === 'taken') {
      setShake(s => s + 1);
      sfx('lose');
      return;
    }
    setSaving(true);
    const res = leaderboardEnabled() ? await claimName(name) : 'offline';
    setSaving(false);
    if (res === 'taken') {
      setStatus('taken');
      setShake(s => s + 1);
      sfx('lose');
      return;
    }
    profile.setName(name, res === 'ok');
    sfx('win');
    toast(res === 'ok' || !leaderboardEnabled() ? `Welcome, ${name}!` : `Welcome, ${name}! You'll join the leaderboard once you're online.`, 'win');
  };

  const valid = NAME_RE.test(name);
  if (linking)
    return (
      <LinkEnter
        onDone={n => toast(`Welcome back, ${n}!`, 'win')}
        onCancel={() => {
          setLinking(false);
          requestAnimationFrame(() => focusDefault());
        }}
      />
    );
  const msg: Record<Status, string> = {
    idle: '3–12 letters, numbers or _',
    short: name.length < 3 ? `${3 - name.length} more to go` : 'Letters, numbers and _ only',
    checking: 'Checking…',
    free: leaderboardEnabled() ? 'Available' : 'Looks good',
    taken: "Taken. If it's yours, use Link name",
    offline: "Can't check right now — you can still join",
  };
  const tone = status === 'free' ? 'ok' : status === 'taken' ? 'bad' : '';

  return (
    <div className="ns" data-shift={shift}>
      <header className="ns-head">
        <span className="logo" aria-label="KMR Casino">
          KMR
        </span>
        <div className="ns-titles">
          <h1>{p.lostName ? 'Pick a new name' : 'Pick your player name'}</h1>
          <p>
            {p.lostName
              ? `Someone already took “${p.lostName}” on the leaderboard. Your coins and stats are safe.`
              : 'This is how you show up on the global leaderboard. It stays saved on these glasses.'}
          </p>
        </div>
      </header>

      <div className={`ns-field ${tone}`} key={shake} data-shake={shake > 0}>
        <span className="ns-name" aria-live="polite">
          {name || <span className="ns-placeholder">Your name</span>}
          <i className="ns-caret" aria-hidden="true" />
        </span>
        <span className="ns-count">
          {name.length}/{MAX}
        </span>
      </div>
      <div className={`ns-status ${tone}`} role="status">
        {msg[status]}
      </div>

      <div className="ns-keys" role="group" aria-label="Keyboard">
        {ROWS.map((row, r) => (
          <div key={row} className="ns-row">
            {row.split('').map((ch, i) => (
              <button
                key={ch}
                type="button"
                className="ns-key"
                onClick={() => type(ch)}
                data-autofocus={r === 1 && i === 0 ? '' : undefined}
                aria-label={/[A-Z]/.test(ch) ? (shift ? ch : ch.toLowerCase()) : ch}
              >
                {/[A-Z]/.test(ch) && !shift ? ch.toLowerCase() : ch}
              </button>
            ))}
            {r === 2 && (
              <button type="button" className="ns-key is-fn" onClick={back} aria-label="Delete">
                <Backspace />
              </button>
            )}
          </div>
        ))}
        <div className="ns-row">
          <button
            type="button"
            className={`ns-key is-fn is-wide${shift ? ' is-on' : ''}`}
            onClick={() => {
              sfx('key');
              setShift(s => !s);
            }}
            aria-label={shift ? 'Shift on' : 'Shift'}
            aria-pressed={shift}
          >
            <ShiftIcon filled={shift} />
          </button>
          {LAST.split('').map(ch => (
            <button key={ch} type="button" className="ns-key" onClick={() => type(ch)} aria-label={shift ? ch : ch.toLowerCase()}>
              {shift ? ch : ch.toLowerCase()}
            </button>
          ))}
          <button type="button" className="ns-key" onClick={() => type('_')} aria-label="Underscore">
            _
          </button>
        </div>
        <div className="ns-row ns-actions is-three">
          <button
            type="button"
            className="ns-random"
            onClick={() => {
              sfx('dice');
              setName(randomName());
              setShift(false);
            }}
          >
            <DiceIcon size={18} />
            Random
          </button>
          <button
            type="button"
            className="ns-random ns-link"
            onClick={() => {
              sfx('press');
              setLinking(true);
            }}
          >
            <LinkIcon size={18} />
            Link name
          </button>
          <button type="button" className="ns-join" onClick={() => void join()} aria-disabled={!valid || status === 'taken' || saving}>
            {saving ? 'Saving…' : 'Start playing'}
          </button>
        </div>
      </div>
    </div>
  );
}
