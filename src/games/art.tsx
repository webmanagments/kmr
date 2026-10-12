// Original tile illustrations for every game. Pure SVG, 100×100 art box.
import type {ReactNode} from 'react';

const W = '#ffffff';
const INK = 'rgba(0,0,0,.28)';

function Card({x, y, r = 0, label, red = false}: {x: number; y: number; r?: number; label: string; red?: boolean}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <rect x="-15" y="-21" width="30" height="42" rx="4.5" fill={INK} transform="translate(2 3)" />
      <rect x="-15" y="-21" width="30" height="42" rx="4.5" fill={W} />
      <text x="-10" y="-8" fontSize="11" fontWeight="900" fill={red ? '#e11d48' : '#0f172a'} fontFamily="system-ui,Arial">
        {label}
      </text>
      <text x="0" y="13" fontSize="17" textAnchor="middle" fill={red ? '#e11d48' : '#0f172a'} fontFamily="system-ui,Arial">
        {red ? '♥' : '♠'}
      </text>
    </g>
  );
}

function Gem({x, y, s = 1, c1, c2, c3}: {x: number; y: number; s?: number; c1: string; c2: string; c3: string}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-14 -12h28l10 13-24 27-24-27z" fill={INK} transform="translate(2 3)" />
      <path d="M-14 -12h28l10 13-24 27-24-27z" fill={c1} />
      <path d="M-14 -12l7 13h14l7-13zM-24 1h48L0 28z" fill={c2} />
      <path d="M-7 1h14L0 28z" fill={c3} />
      <path d="M-14 -12l7 13h-17z" fill="#fff" opacity=".55" />
    </g>
  );
}

const ART: Record<string, ReactNode> = {
  skyrun: (
    <>
      <circle cx="80" cy="18" r="9" fill="#fff6c8" opacity=".9" />
      <path d="M0 84h100v16H0z" fill="#0b4a85" opacity=".55" />
      <path d="M8 82h48l-5 7H13z" fill="#e9eef3" opacity=".9" />
      <rect x="40" y="72" width="9" height="10" fill="#e9eef3" opacity=".9" />
      <circle cx="76" cy="40" r="10" fill="#ffc531" stroke="#fff" strokeWidth="2" />
      <text x="76" y="44" textAnchor="middle" fontSize="10" fontWeight="900" fill="#4a2b00" fontFamily="system-ui,Arial">
        ×5
      </text>
      <circle cx="20" cy="30" r="9" fill="#2fe35a" stroke="#fff" strokeWidth="2" />
      <text x="20" y="34" textAnchor="middle" fontSize="9" fontWeight="900" fill="#03270d" fontFamily="system-ui,Arial">
        +2
      </text>
      <g transform="translate(48 56) rotate(-12)">
        <path d="M-22 -3l-8-15h9l7 13z" fill="#d62845" />
        <path d="M-2 -3h14l-9-10h-10z" fill="#9b1830" />
        <path d="M26 -6c5 6 0 13 0 13h-36c-10 0-18-4-20-7 2-4 10-7 20-7z" fill="#e0283f" />
        <path d="M24 1h-50l2 3h48z" fill="#fff" />
        <ellipse cx="3" cy="-7" rx="8" ry="6" fill="#bff1ff" />
        <path d="M-6 3h18l-10 13h-12z" fill="#c81f38" />
        <ellipse cx="30" cy="0" rx="2.5" ry="12" fill="#fff" opacity=".6" />
      </g>
    </>
  ),
  snakes: (
    <>
      {[0, 1, 2, 3].map(i => (
        <g key={i}>
          <rect x={8 + i * 22} y="10" width="18" height="18" rx="4" fill="#fff" opacity=".22" />
          <rect x={8 + i * 22} y="72" width="18" height="18" rx="4" fill="#fff" opacity=".22" />
        </g>
      ))}
      <rect x="8" y="32" width="18" height="18" rx="4" fill="#fff" opacity=".22" />
      <rect x="74" y="50" width="18" height="18" rx="4" fill="#fff" opacity=".22" />
      <path d="M22 62c-10-6-2-18 10-14s20 6 24-4-10-12-4-20 20-2 18 8" fill="none" stroke="#1fa64a" strokeWidth="9" strokeLinecap="round" />
      <path d="M22 62c-10-6-2-18 10-14s20 6 24-4-10-12-4-20 20-2 18 8" fill="none" stroke="#6bf08e" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 7" />
      <ellipse cx="70" cy="40" rx="8" ry="6.5" fill="#1fa64a" />
      <circle cx="72" cy="38" r="2" fill="#fff6c8" />
      <g transform="translate(36 60) rotate(-12)">
        <rect x="0" y="0" width="22" height="22" rx="5" fill="#fff" />
        <circle cx="6" cy="6" r="2.4" fill="#0b1822" />
        <circle cx="16" cy="16" r="2.4" fill="#0b1822" />
        <circle cx="11" cy="11" r="2.4" fill="#0b1822" />
      </g>
    </>
  ),
  drill: (
    <>
      <path d="M0 40h100v60H0z" fill="#6b4a2b" opacity=".75" />
      <path d="M0 64h100v36H0z" fill="#474f58" opacity=".8" />
      <path d="M0 40h100" stroke="#3fae52" strokeWidth="4" />
      <circle cx="20" cy="76" r="3" fill="#c48cff" />
      <circle cx="80" cy="86" r="3" fill="#78dcff" />
      <path d="M38 40L48 6h4l10 34" fill="none" stroke="#ffc531" strokeWidth="4" strokeLinejoin="round" />
      <path d="M41 28h18M45 16h10" stroke="#ffc531" strokeWidth="3" />
      <rect x="47" y="40" width="6" height="28" fill="#1a1410" />
      <path d="M41 68h18L50 92z" fill="#e9eef3" />
      <path d="M43 73l14 2M45 79l10 2M47 85l6 1" stroke="#6f8290" strokeWidth="2" />
      <path d="M30 88l6-4M70 88l-6-4M36 94l4-6M64 94l-4-6" stroke="#ffd34d" strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  scratch: (
    <>
      <g transform="translate(50 52) rotate(-6)">
        <rect x="-34" y="-40" width="68" height="80" rx="8" fill="#3b0764" stroke="#ffc531" strokeWidth="3" />
        {[0, 1, 2].map(r =>
          [0, 1, 2].map(c => (
            <rect key={`${r}${c}`} x={-26 + c * 18} y={-30 + r * 20} width="16" height="18" rx="3" fill={r === 1 && c > 0 ? '#fffaf0' : '#c5cfd8'} />
          )),
        )}
        <path d="M-8 -12l18 -6" stroke="#fff" strokeWidth="2" opacity=".6" />
        <text x="1" y="5" textAnchor="middle" fontSize="11" fill="#e8173d" fontFamily="system-ui,Arial">
          ♦
        </text>
        <text x="19" y="5" textAnchor="middle" fontSize="11" fill="#e8173d" fontFamily="system-ui,Arial">
          ♦
        </text>
      </g>
      <circle cx="80" cy="76" r="11" fill="#ffd34d" stroke="#c27c00" strokeWidth="2.5" />
      <path d="M76 72v8M76 76l6-5M78 75l5 6" stroke="#9a5a00" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  chicken: (
    <>
      {[0, 1, 2].map(i => (
        <rect key={i} x={10 + i * 30} y="10" width="2" height="80" fill="#fff" opacity=".35" />
      ))}
      <g transform="translate(18 0)">
        <ellipse cx="34" cy="62" rx="20" ry="18" fill="#fff" />
        <circle cx="44" cy="40" r="12" fill="#fff" />
        <path d="M40 28c2-6 6-6 7-1 2-4 6-3 6 1" fill="#ff3b5c" />
        <path d="M56 40l8 3-8 3z" fill="#ff9f1c" />
        <circle cx="47" cy="38" r="2.4" fill="#0b1822" />
        <path d="M28 80l-3 10M40 80l3 10" stroke="#ff9f1c" strokeWidth="3.5" strokeLinecap="round" />
      </g>
      <rect x="66" y="8" width="22" height="34" rx="6" fill="#3d8bff" />
      <rect x="70" y="14" width="14" height="8" rx="2" fill="#0b1822" opacity=".6" />
    </>
  ),
  tarot: (
    <>
      <g transform="translate(50 52) rotate(-8)">
        <rect x="-24" y="-38" width="48" height="76" rx="6" fill="#1a0d33" stroke="#ffd34d" strokeWidth="3" />
        <circle cy="-6" r="13" fill="#ffd34d" />
        {Array.from({length: 8}, (_, k) => {
          const a = (k / 8) * Math.PI * 2;
          return <path key={k} d={`M${Math.cos(a) * 17} ${-6 + Math.sin(a) * 17}L${Math.cos(a) * 22} ${-6 + Math.sin(a) * 22}`} stroke="#ffd34d" strokeWidth="2.5" strokeLinecap="round" />;
        })}
        <text y="28" textAnchor="middle" fontSize="11" fontWeight="900" fill="#ffd34d" fontFamily="system-ui,Arial">
          50×
        </text>
      </g>
    </>
  ),
  penalty: (
    <>
      <path d="M12 70V22h76v48" fill="none" stroke="#fff" strokeWidth="5" strokeLinejoin="round" />
      <path d="M16 26h68v44H16z" fill="none" stroke="#fff" strokeOpacity=".25" strokeWidth="1" strokeDasharray="3 4" />
      <g transform="translate(64 40)">
        <circle r="13" fill="#fff" />
        <path d="M0-7l6 4-2 7h-8l-2-7z" fill="#0b1822" />
      </g>
      <path d="M30 44l-8-10M42 44l8-10" stroke="#ffd34d" strokeWidth="5" strokeLinecap="round" />
      <rect x="28" y="42" width="16" height="18" rx="5" fill="#ffd34d" />
      <circle cx="36" cy="36" r="6" fill="#d9a77c" />
      <path d="M8 88h84" stroke="#fff" strokeOpacity=".4" strokeWidth="2" />
    </>
  ),
  crash: (
    <>
      <path d="M8 88 Q48 84 74 34" stroke="#fff" strokeOpacity=".35" strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d="M8 88 Q48 84 74 34" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" />
      <g transform="translate(74 30) rotate(32)">
        <path d="M-4 16 0 30 4 16z" fill="#ffd34d" />
        <path d="M-7 8-14 18-6 15zM7 8l7 10-8-3z" fill="#ffd34d" />
        <path d="M0-20C9-11 9 8 0 16-9 8-9-11 0-20z" fill="#fff" />
        <circle cy="-3" r="4" fill="#d4145a" />
      </g>
    </>
  ),
  plinko: (
    <>
      {[0, 1, 2, 3, 4].map(r =>
        Array.from({length: r + 3}, (_, i) => (
          <circle key={`${r}-${i}`} cx={50 - (r + 2) * 7 + i * 14} cy={20 + r * 12} r="2.6" fill="#fff" opacity=".9" />
        )),
      )}
      <circle cx="57" cy="38" r="6" fill="#ffd34d" />
      <circle cx="55.5" cy="36.5" r="2" fill="#fff" />
      {['#ff3b5c', '#ff7a3d', '#ffb02e', '#ffd34d', '#ffb02e', '#ff7a3d', '#ff3b5c'].map((c, i) => (
        <rect key={i} x={10 + i * 11.6} y="82" width="10" height="8" rx="2" fill={c} />
      ))}
    </>
  ),
  mines: (
    <>
      <Gem x={46} y={46} s={1.35} c1="#00e701" c2="#00b801" c3="#5dff60" />
      <g transform="translate(74 74)">
        <circle r="11" fill="#ff3b5c" />
        <circle r="11" fill="#000" opacity=".15" />
        <rect x="4" y="-15" width="6" height="6" rx="1.5" transform="rotate(40 7 -12)" fill="#c4163a" />
        <circle cx="-4" cy="-4" r="3" fill="#ffb3c0" />
      </g>
    </>
  ),
  dice: (
    <>
      <g transform="translate(38 56) rotate(-14)">
        <rect x="-20" y="-20" width="40" height="40" rx="9" fill={INK} transform="translate(3 4)" />
        <rect x="-20" y="-20" width="40" height="40" rx="9" fill="#fff" />
        {[[-9, -9], [9, -9], [0, 0], [-9, 9], [9, 9]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3.6" fill="#0b7f8f" />
        ))}
      </g>
      <g transform="translate(70 34) rotate(16)">
        <rect x="-15" y="-15" width="30" height="30" rx="7" fill={INK} transform="translate(3 4)" />
        <rect x="-15" y="-15" width="30" height="30" rx="7" fill="#fff" />
        {[[-6, -6], [6, 6]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill="#ff3b5c" />
        ))}
      </g>
    </>
  ),
  limbo: (
    <>
      <circle cx="50" cy="50" r="32" fill="none" stroke="#fff" strokeOpacity=".25" strokeWidth="6" />
      <circle cx="50" cy="50" r="20" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="6" />
      <circle cx="50" cy="50" r="8" fill="#fff" />
      <path d="M50 50 82 18" stroke="#ffd34d" strokeWidth="5" strokeLinecap="round" />
      <path d="M70 16h14v14" stroke="#ffd34d" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  towers: (
    <>
      {[0, 1, 2, 3].map(r =>
        [0, 1, 2].map(c => (
          <rect key={`${r}${c}`} x={22 + c * 19} y={78 - r * 16} width="16" height="12" rx="3" fill="#fff" opacity={r === 3 ? 0.35 : 0.85} />
        )),
      )}
      <ellipse cx="50" cy="20" rx="10" ry="13" fill="#ffd34d" />
      <ellipse cx="46" cy="15" rx="3" ry="4" fill="#fff" opacity=".7" />
      <path d="M41 27c3 3 15 3 18 0" stroke="#c2410c" strokeWidth="3" fill="none" />
    </>
  ),
  hilo: (
    <>
      <Card x={38} y={54} r={-12} label="Q" />
      <Card x={62} y={50} r={10} label="7" red />
      <path d="M84 30l-8-10-8 10" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 70l8 10 8-10" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  keno: (
    <>
      {Array.from({length: 16}, (_, i) => {
        const hot = [1, 6, 9, 14].includes(i);
        const gold = [3, 12].includes(i);
        return (
          <circle
            key={i}
            cx={20 + (i % 4) * 20}
            cy={20 + Math.floor(i / 4) * 20}
            r="8"
            fill={gold ? '#ffd34d' : hot ? '#fff' : '#fff'}
            opacity={gold || hot ? 1 : 0.28}
          />
        );
      })}
    </>
  ),
  wheel: (
    <>
      <circle cx="50" cy="54" r="34" fill={INK} transform="translate(2 3)" />
      {Array.from({length: 10}, (_, i) => {
        const a0 = (i / 10) * Math.PI * 2;
        const a1 = ((i + 1) / 10) * Math.PI * 2;
        const p = (a: number) => `${50 + Math.sin(a) * 34} ${54 - Math.cos(a) * 34}`;
        const colors = ['#00e701', '#fff', '#1475e1', '#fff', '#ff3b5c', '#fff', '#a855f7', '#fff', '#ffd34d', '#fff'];
        return <path key={i} d={`M50 54L${p(a0)}A34 34 0 0 1 ${p(a1)}Z`} fill={colors[i]} opacity={i % 2 ? 0.3 : 1} />;
      })}
      <circle cx="50" cy="54" r="12" fill="#f77f00" />
      <circle cx="50" cy="54" r="5" fill="#fff" />
      <path d="M43 12h14L50 26z" fill="#fff" />
    </>
  ),
  pump: (
    <>
      <path d="M50 70c-2 8 4 12 0 20" stroke="#fff" strokeWidth="2.5" fill="none" />
      <ellipse cx="50" cy="42" rx="26" ry="30" fill={INK} transform="translate(3 3)" />
      <ellipse cx="50" cy="42" rx="26" ry="30" fill="#fff" />
      <ellipse cx="50" cy="42" rx="26" ry="30" fill="#c026d3" opacity=".25" />
      <ellipse cx="40" cy="28" rx="7" ry="10" fill="#fff" />
      <path d="M45 71h10l-5 6z" fill="#fff" />
    </>
  ),
  diamonds: (
    <>
      <Gem x={28} y={56} s={0.8} c1="#ff3b5c" c2="#d4143a" c3="#ff8aa0" />
      <Gem x={72} y={56} s={0.8} c1="#00e701" c2="#00b801" c3="#7dff7f" />
      <Gem x={50} y={40} s={1.05} c1="#ffd34d" c2="#f5a700" c3="#fff0a8" />
    </>
  ),
  coinflip: (
    <>
      <ellipse cx="52" cy="55" rx="33" ry="33" fill={INK} />
      <circle cx="50" cy="51" r="33" fill="#f5b000" />
      <circle cx="50" cy="51" r="26" fill="#ffd34d" />
      <path d="M41 36v30M41 51l15-15M46 46l11 20" stroke="#9a5a00" strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M26 30a32 32 0 0 1 20-11" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".8" />
    </>
  ),
  cases: (
    <>
      <path d="M50 8l6 14 15 1-12 9 4 15-13-8-13 8 4-15-12-9 15-1z" fill="#ffd34d" opacity=".9" />
      <rect x="20" y="46" width="60" height="40" rx="5" fill={INK} transform="translate(3 3)" />
      <rect x="20" y="46" width="60" height="40" rx="5" fill="#fff" />
      <rect x="16" y="40" width="68" height="12" rx="4" fill="#fff" />
      <rect x="20" y="52" width="60" height="5" fill="#6d28d9" opacity=".35" />
      <rect x="44" y="48" width="12" height="16" rx="3" fill="#ffd34d" />
    </>
  ),
  slide: (
    <>
      {[0, 1, 2, 3, 4].map(i => (
        <rect
          key={i}
          x={6 + i * 18.5}
          y="34"
          width="15"
          height="32"
          rx="3.5"
          fill={['#fff', '#ffd34d', '#00e701', '#ff3b5c', '#fff'][i]}
          opacity={i === 2 ? 1 : 0.55}
        />
      ))}
      <path d="M50 20v60" stroke="#fff" strokeWidth="3" />
      <path d="M43 14h14L50 24zM43 86h14L50 76z" fill="#fff" />
    </>
  ),
  blackjack: (
    <>
      <Card x={40} y={52} r={-10} label="A" />
      <Card x={60} y={50} r={10} label="K" red />
      <text x="50" y="92" fontSize="13" fontWeight="900" fill="#fff" textAnchor="middle" fontFamily="system-ui,Arial">
        21
      </text>
    </>
  ),
  roulette: (
    <>
      <circle cx="50" cy="50" r="38" fill="#3b0d0d" />
      {Array.from({length: 18}, (_, i) => {
        const a0 = (i / 18) * Math.PI * 2;
        const a1 = ((i + 1) / 18) * Math.PI * 2;
        const p = (a: number, r: number) => `${50 + Math.sin(a) * r} ${50 - Math.cos(a) * r}`;
        return (
          <path
            key={i}
            d={`M${p(a0, 36)}A36 36 0 0 1 ${p(a1, 36)}L${p(a1, 24)}A24 24 0 0 0 ${p(a0, 24)}Z`}
            fill={i === 0 ? '#00c853' : i % 2 ? '#111' : '#ef4444'}
          />
        );
      })}
      <circle cx="50" cy="50" r="22" fill="#c98a00" />
      <circle cx="50" cy="50" r="8" fill="#ffd34d" />
      <circle cx="68" cy="26" r="4.5" fill="#fff" />
    </>
  ),
  baccarat: (
    <>
      <Card x={36} y={46} r={-8} label="9" />
      {[0, 1, 2].map(i => (
        <g key={i} transform={`translate(70 ${78 - i * 7})`}>
          <ellipse rx="16" ry="6" fill="#0f766e" />
          <ellipse rx="16" ry="6" fill="none" stroke="#fff" strokeWidth="2.5" strokeDasharray="5 4" />
        </g>
      ))}
      <ellipse cx="70" cy="64" rx="16" ry="6" fill="#ffd34d" />
    </>
  ),
  videopoker: (
    <>
      {[-2, -1, 0, 1, 2].map(i => (
        <Card key={i} x={50 + i * 11} y={56 + Math.abs(i) * 3} r={i * 9} label={['10', 'J', 'Q', 'K', 'A'][i + 2]} red={i % 2 === 0} />
      ))}
    </>
  ),
  dragontiger: (
    <>
      <path d="M14 22h30v26c0 14-15 22-15 22S14 62 14 48z" fill="#fff" />
      <path d="M56 22h30v26c0 14-15 22-15 22S56 62 56 48z" fill="#fff" opacity=".85" />
      <path d="M29 30c-6 7 4 10 0 20 9-4 8-13 0-20z" fill="#f97316" />
      <path d="M71 30l-7 18h14z" fill="#1d4ed8" />
      <text x="50" y="92" fontSize="15" fontWeight="900" fill="#fff" textAnchor="middle" fontFamily="system-ui,Arial" fontStyle="italic">
        VS
      </text>
    </>
  ),
  slots: (
    <>
      <rect x="10" y="26" width="80" height="48" rx="8" fill={INK} transform="translate(2 3)" />
      <rect x="10" y="26" width="80" height="48" rx="8" fill="#fff" />
      {[0, 1, 2].map(i => (
        <text key={i} x={24 + i * 26} y="63" fontSize="30" fontWeight="900" fill="#e11d48" textAnchor="middle" fontFamily="system-ui,Arial" fontStyle="italic">
          7
        </text>
      ))}
      <path d="M36 30v40M62 30v40" stroke="#7e22ce" strokeOpacity=".25" strokeWidth="2" />
      <circle cx="92" cy="22" r="5" fill="#ffd34d" />
      <path d="M92 26v14" stroke="#fff" strokeWidth="3" />
    </>
  ),
  horses: (
    <>
      <path
        d="M30 24c-10 10-12 30-4 46l8-2c-6-14-5-28 2-38 7 10 8 24 2 38l8 2c8-16 6-36-4-46z"
        fill="#fff"
        transform="translate(14 0) scale(.9)"
      />
      <path
        d="M30 24c-10 10-12 30-4 46l8-2c-6-14-5-28 2-38 7 10 8 24 2 38l8 2c8-16 6-36-4-46z"
        fill="none"
        stroke="#3f6212"
        strokeOpacity=".4"
        strokeWidth="2"
        strokeDasharray="1 6"
        strokeLinecap="round"
        transform="translate(14 0) scale(.9)"
      />
      <g transform="translate(64 20)">
        <path d="M0 0v52" stroke="#fff" strokeWidth="3" />
        {[0, 1, 2, 3].map(r =>
          [0, 1, 2].map(c => (
            <rect key={`${r}${c}`} x={2 + c * 7} y={r * 6} width="7" height="6" fill={(r + c) % 2 ? '#0f172a' : '#fff'} />
          )),
        )}
      </g>
    </>
  ),
};

export function GameArt({id}: {id: string}) {
  return (
    <svg viewBox="0 0 100 100" className="tile-art" aria-hidden="true" focusable="false">
      {ART[id]}
    </svg>
  );
}
