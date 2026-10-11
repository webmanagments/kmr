import type {ReactNode} from 'react';
import {useWallet, wallet} from '../lib/wallet';
import {fmtCoins, money} from '../lib/util';
import {Coin, Minus, Plus} from './icons';

const LADDER = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

export function Field({label, aside, children}: {label: string; aside?: ReactNode; children: ReactNode}) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        {aside != null && <span className="field-aside">{aside}</span>}
      </div>
      {children}
    </div>
  );
}

/** Stake-style bet amount box with ½ / 2× plus step buttons. */
export function BetAmount({locked = false, label = 'Bet Amount'}: {locked?: boolean; label?: string}) {
  const {betAmount} = useWallet();
  const step = (dir: 1 | -1) => {
    const idx = LADDER.findIndex(v => v >= betAmount - 1e-9);
    let next: number;
    if (dir > 0) next = LADDER.find(v => v > betAmount + 1e-9) ?? LADDER[LADDER.length - 1];
    else next = [...LADDER].reverse().find(v => v < betAmount - 1e-9) ?? LADDER[0];
    void idx;
    wallet.setBet(next);
  };
  return (
    <Field label={label}>
      <div className={`amount${locked ? ' is-locked' : ''}`}>
        <Coin size={16} />
        <span className="amount-value">{fmtCoins(betAmount)}</span>
        <button type="button" className="amount-btn" disabled={locked} onClick={() => wallet.setBet(money(betAmount / 2))} aria-label="Halve bet">
          ½
        </button>
        <span className="amount-sep" />
        <button type="button" className="amount-btn" disabled={locked} onClick={() => wallet.setBet(money(betAmount * 2))} aria-label="Double bet">
          2×
        </button>
      </div>
      <div className="ladder">
        <button type="button" className="chip-btn" disabled={locked} onClick={() => step(-1)} aria-label="Lower bet">
          <Minus />
        </button>
        <button type="button" className="chip-btn" disabled={locked} onClick={() => wallet.setBet(0.1)} aria-label="Minimum bet">
          Min
        </button>
        <button
          type="button"
          className="chip-btn"
          disabled={locked}
          onClick={() => wallet.setBet(Math.max(0.1, Math.floor(wallet.get().balance * 100) / 100))}
          aria-label="Maximum bet"
        >
          Max
        </button>
        <button type="button" className="chip-btn" disabled={locked} onClick={() => step(1)} aria-label="Raise bet">
          <Plus />
        </button>
      </div>
    </Field>
  );
}

export function Stepper({
  label,
  value,
  onPrev,
  onNext,
  disabled = false,
  canPrev = true,
  canNext = true,
  aside,
  tone,
}: {
  label: string;
  value: ReactNode;
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
  canPrev?: boolean;
  canNext?: boolean;
  aside?: ReactNode;
  tone?: 'green' | 'red';
}) {
  return (
    <Field label={label} aside={aside}>
      <div className="stepper">
        <button type="button" className="step-btn" disabled={disabled || !canPrev} onClick={onPrev} aria-label={`Decrease ${label}`}>
          <Minus />
        </button>
        <span className={`step-value${tone ? ` tone-${tone}` : ''}`}>{value}</span>
        <button type="button" className="step-btn" disabled={disabled || !canNext} onClick={onNext} aria-label={`Increase ${label}`}>
          <Plus />
        </button>
      </div>
    </Field>
  );
}

/** Step through a fixed list of values. */
export function ListStepper<T>({
  label,
  values,
  value,
  onChange,
  render,
  disabled,
  aside,
  tone,
}: {
  label: string;
  values: readonly T[];
  value: T;
  onChange: (v: T) => void;
  render?: (v: T) => ReactNode;
  disabled?: boolean;
  aside?: ReactNode;
  tone?: 'green' | 'red';
}) {
  const i = Math.max(0, values.indexOf(value));
  return (
    <Stepper
      label={label}
      value={render ? render(value) : String(value)}
      disabled={disabled}
      canPrev={i > 0}
      canNext={i < values.length - 1}
      onPrev={() => onChange(values[Math.max(0, i - 1)])}
      onNext={() => onChange(values[Math.min(values.length - 1, i + 1)])}
      aside={aside}
      tone={tone}
    />
  );
}

export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: readonly {value: T; label: ReactNode; aria?: string}[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map(o => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            aria-label={o.aria}
            className={`seg${o.value === value ? ' is-on' : ''}`}
            disabled={disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

export function Readout({label, value, tone}: {label: string; value: ReactNode; tone?: 'green' | 'red' | 'gold'}) {
  return (
    <Field label={label}>
      <div className={`readout${tone ? ` tone-${tone}` : ''}`}>{value}</div>
    </Field>
  );
}

export function ProfitOnWin({mult, label = 'Profit on Win'}: {mult: number; label?: string}) {
  const {betAmount} = useWallet();
  const profit = Math.max(0, betAmount * mult - betAmount);
  return (
    <Readout
      label={label}
      value={
        <>
          <Coin size={14} />
          <span>{fmtCoins(profit)}</span>
        </>
      }
    />
  );
}

export function PlayButton({
  children,
  onClick,
  disabled,
  tone = 'green',
  autoFocus = true,
  sub,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'green' | 'blue' | 'gold';
  autoFocus?: boolean;
  sub?: ReactNode;
}) {
  return (
    <button type="button" className={`play-btn tone-${tone}`} onClick={onClick} disabled={disabled} data-autofocus={autoFocus ? '' : undefined}>
      <span className="play-label">{children}</span>
      {sub != null && <span className="play-sub">{sub}</span>}
    </button>
  );
}
