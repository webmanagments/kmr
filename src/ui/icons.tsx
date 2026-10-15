// Small UI glyphs. All inline SVG: no icon fonts, no network requests.
import type {SVGProps} from 'react';

type P = SVGProps<SVGSVGElement> & {size?: number};

function base(size = 16, p: P) {
  const {size: _s, ...rest} = p;
  return {width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false, ...rest} as const;
}

export function Coin({size = 16, ...p}: P) {
  return (
    <svg {...base(size, p)}>
      <circle cx="12" cy="12" r="11" fill="#f5b000" />
      <circle cx="12" cy="12" r="8.6" fill="#ffd34d" />
      <circle cx="12" cy="12" r="8.6" fill="none" stroke="#e39b00" strokeWidth="1.2" />
      <path d="M9.2 7.2v9.6M9.2 12l4.6-4.8M10.8 10.6l3.3 6.2" stroke="#9a5a00" strokeWidth="2.1" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function WalletIcon({size = 16, ...p}: P) {
  return (
    <svg {...base(size, p)}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="3" y="7.5" width="18" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="16.5" cy="13.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function Minus({size = 14, ...p}: P) {
  return (
    <svg {...base(size, p)}>
      <path d="M5 12h14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Plus({size = 14, ...p}: P) {
  return (
    <svg {...base(size, p)}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function GemIcon({size = 24, ...p}: P) {
  return (
    <svg {...base(size, p)} viewBox="0 0 48 48">
      <path d="M12 6h24l9 12-21 25L3 18z" fill="#00e701" />
      <path d="M12 6l6 12h12l6-12zM3 18h42L24 43z" fill="#00c201" />
      <path d="M18 18h12L24 43z" fill="#3cff3f" />
      <path d="M12 6l6 12H3z" fill="#7dff7f" />
    </svg>
  );
}

export function BombIcon({size = 24, ...p}: P) {
  return (
    <svg {...base(size, p)} viewBox="0 0 48 48">
      <circle cx="22" cy="28" r="15" fill="#ff3b5c" />
      <circle cx="22" cy="28" r="15" fill="url(#bombShade)" />
      <rect x="27" y="9" width="8" height="8" rx="2" transform="rotate(40 31 13)" fill="#c4163a" />
      <path d="M34 8c2-4 6-4 8-2" stroke="#ffd34d" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="16" cy="22" r="4" fill="#ff9aac" />
      <defs>
        <radialGradient id="bombShade" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0.5" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function Trophy({size = 16, ...p}: P) {
  return (
    <svg {...base(size, p)}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="currentColor" />
      <path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M10 14h4v3h3v3H7v-3h3z" fill="currentColor" />
    </svg>
  );
}

export function Gift({size = 16, ...p}: P) {
  return (
    <svg {...base(size, p)}>
      <rect x="3" y="9" width="18" height="4" rx="1" fill="currentColor" />
      <rect x="5" y="13" width="14" height="8" rx="1" fill="currentColor" opacity=".8" />
      <path d="M12 9v12" stroke="#071119" strokeWidth="2" />
      <path d="M12 9C9 9 6.5 7.5 7.5 5.5S11 6 12 9c1-3 3.5-5.5 4.5-3.5S15 9 12 9z" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function Refresh({size = 16, ...p}: P) {
  return (
    <svg {...base(size, p)}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M20 4v7h-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Chart({size = 16, ...p}: P) {
  return (
    <svg {...base(size, p)}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Shuffle({size = 16, ...p}: P) {
  return (
    <svg {...base(size, p)}>
      <path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Undo({size = 16, ...p}: P) {
  return (
    <svg {...base(size, p)}>
      <path d="M9 14L4 9l5-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Star({size = 16, filled = false, ...p}: P & {filled?: boolean}) {
  return (
    <svg {...base(size, p)}>
      <path
        d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Speaker({size = 16, off = false, ...p}: P & {off?: boolean}) {
  return (
    <svg {...base(size, p)}>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
      {off ? (
        <path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      ) : (
        <path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function Backspace({size = 18, ...p}: P) {
  return (
    <svg {...base(size, p)}>
      <path d="M8.5 5H20a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H8.5L2.5 12z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M11 9l6 6M17 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ShiftIcon({size = 18, filled = false, ...p}: P & {filled?: boolean}) {
  return (
    <svg {...base(size, p)}>
      <path d="M12 3.5l8 8.5h-4.5v8h-7v-8H4z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function DiceIcon({size = 16, ...p}: P) {
  return (
    <svg {...base(size, p)}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="8.5" cy="8.5" r="1.6" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function Crown({size = 16, ...p}: P) {
  return (
    <svg {...base(size, p)}>
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z" fill="currentColor" />
      <rect x="5" y="19" width="14" height="2.4" rx="1" fill="currentColor" />
    </svg>
  );
}

export function Clover({size = 16, ...p}: P) {
  return (
    <svg {...base(size, p)}>
      <g fill="currentColor">
        <path d="M11.2 11.2C7.4 11 4.2 9.6 4.4 6.6 4.6 4.3 7.2 3.8 8.6 5.4c-.2-2.4 3-3.6 4.1-1.3 1 2.2-.3 4.9-1.5 7.1z" />
        <path d="M12.8 11.2c3.8-.2 7-1.6 6.8-4.6-.2-2.3-2.8-2.8-4.2-1.2.2-2.4-3-3.6-4.1-1.3-1 2.2.3 4.9 1.5 7.1z" opacity=".9" />
        <path d="M11.2 12.8c-3.8.2-7 1.6-6.8 4.6.2 2.3 2.8 2.8 4.2 1.2-.2 2.4 3 3.6 4.1 1.3 1-2.2-.3-4.9-1.5-7.1z" opacity=".9" />
        <path d="M12.8 12.8c3.8.2 7 1.6 6.8 4.6-.2 2.3-2.8 2.8-4.2 1.2.2 2.4-3 3.6-4.1 1.3-1-2.2.3-4.9 1.5-7.1z" />
      </g>
    </svg>
  );
}

export function Skull({size = 16, ...p}: P) {
  return (
    <svg {...base(size, p)}>
      <path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.2 4.4 3 5.6V20h10v-3.4c1.8-1.2 3-3 3-5.6a8 8 0 0 0-8-8z" fill="currentColor" />
      <circle cx="9" cy="11.5" r="2" fill="#071119" />
      <circle cx="15" cy="11.5" r="2" fill="#071119" />
      <path d="M10 20v-2.4M14 20v-2.4" stroke="#071119" strokeWidth="1.4" />
    </svg>
  );
}

export function Keyboard({size = 16, ...p}: P) {
  return (
    <svg {...base(size, p)}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M6 10h1M9.5 10h1M13 10h1M16.5 10h1M7.5 14h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Globe({size = 16, ...p}: P) {
  return (
    <svg {...base(size, p)}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function Megaphone({size = 16, ...p}: P) {
  return (
    <svg {...base(size, p)}>
      <path d="M3 10v4h3l8 5V5L6 10z" fill="currentColor" />
      <path d="M17.5 9a4 4 0 0 1 0 6M7 14.5l1.4 5h2.6l-1.2-4.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function LinkIcon({size = 16, ...p}: P) {
  return (
    <svg {...base(size, p)}>
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
