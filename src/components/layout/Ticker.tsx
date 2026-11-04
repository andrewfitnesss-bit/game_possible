import { useMemo } from 'react';
import { useT, type TKey } from '../../i18n/prefs';

// Коды клиентов игры как «акции» — изменение псевдослучайное, но стабильное для каждого кода.
const CODES = ['G1', 'G2', 'G3', 'B1', 'B2', 'B3', 'T1', 'T2', 'E1', 'E2', 'E3', 'H1', 'R1', 'R2', 'C1', 'A1', 'F1', 'D1', 'Z1', 'Z2'];
const SLOGANS: TKey[] = ['ticker.s1', 'ticker.s2', 'ticker.s3', 'ticker.s4', 'ticker.s5'];

function change(code: string): number {
  let h = 7;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return ((h % 240) - 80) / 10;
}

// Бегущая строка котировок оформления «Уолл-стрит».
export function Ticker() {
  const t = useT();
  const items = useMemo(() => {
    const out: { key: string; text: string; up?: boolean }[] = [];
    CODES.forEach((code, i) => {
      const c = change(code);
      out.push({ key: code, text: `${code} ${c >= 0 ? '▲' : '▼'} ${Math.abs(c).toFixed(1)}%`, up: c >= 0 });
      if (i % 4 === 3) out.push({ key: `s${i}`, text: t(SLOGANS[(i / 4) % SLOGANS.length | 0]) });
    });
    return out;
  }, [t]);

  const row = items.map((x) => (
    <span key={x.key} className={x.up === undefined ? 'tick slogan' : x.up ? 'tick up' : 'tick down'}>
      {x.text}
    </span>
  ));
  return (
    <div className="ticker" aria-hidden>
      <div className="ticker-track">
        {row}
        {row}
      </div>
    </div>
  );
}
