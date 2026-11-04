import { useEffect, useState, type CSSProperties } from 'react';
import { usePrefs } from '../i18n/prefs';

/** Событие «деньги посыпались»: вызывается после успешной покупки. */
export const CHA_CHING = 'nal:cha-ching';

export function chaChing() {
  window.dispatchEvent(new Event(CHA_CHING));
}

const BILLS = ['💵', '💸', '💰', '$', '💵', '🤑'];

interface Drop {
  id: number;
  left: number;
  delay: number;
  duration: number;
  size: number;
  spin: number;
  glyph: string;
}

function makeDrops(count: number, from: number): Drop[] {
  return Array.from({ length: count }, (_, i) => ({
    id: from + i,
    left: Math.random() * 100,
    delay: Math.random() * 1.2,
    duration: 2.4 + Math.random() * 2.2,
    size: 18 + Math.random() * 26,
    spin: Math.random() * 720 - 360,
    glyph: BILLS[Math.floor(Math.random() * BILLS.length)],
  }));
}

// Денежный дождь оформления «Уолл-стрит»: постоянный на экране входа и залп после каждой покупки.
export function MoneyRain({ ambient = false }: { ambient?: boolean }) {
  const { theme } = usePrefs();
  const [drops, setDrops] = useState<Drop[]>(() => (ambient ? makeDrops(18, 0) : []));

  useEffect(() => {
    if (theme !== 'wallst' || ambient) return;
    let seq = 1000;
    const burst = () => {
      const fresh = makeDrops(36, seq);
      seq += 36;
      setDrops((d) => [...d, ...fresh]);
      setTimeout(() => setDrops((d) => d.filter((x) => !fresh.includes(x))), 5200);
    };
    window.addEventListener(CHA_CHING, burst);
    return () => window.removeEventListener(CHA_CHING, burst);
  }, [theme, ambient]);

  if (theme !== 'wallst' || drops.length === 0) return null;
  return (
    <div className={ambient ? 'money-rain ambient' : 'money-rain'} aria-hidden>
      {drops.map((d) => (
        <span
          key={d.id}
          style={
            {
              left: `${d.left}%`,
              fontSize: d.size,
              animationDelay: `${d.delay}s`,
              animationDuration: `${d.duration}s`,
              '--spin': `${d.spin}deg`,
            } as CSSProperties
          }
        >
          {d.glyph}
        </span>
      ))}
    </div>
  );
}
