'use client';

import { useEffect, useRef, useState } from 'react';
import { Home, Wallet, Building2, Users, BookOpen, GraduationCap, ShoppingBag } from 'lucide-react';
import styles from './FloatingIsland.module.css';

export type DashTab = 'main' | 'financial' | 'branches' | 'students' | 'courses' | 'instructors' | 'store';

export const DASH_TABS: { key: DashTab; label: string; Icon: typeof Home }[] = [
  { key: 'main', label: 'ראשי', Icon: Home },
  { key: 'financial', label: 'כספים', Icon: Wallet },
  { key: 'branches', label: 'סניפים', Icon: Building2 },
  { key: 'students', label: 'תלמידים', Icon: Users },
  { key: 'courses', label: 'חוגים', Icon: BookOpen },
  { key: 'instructors', label: 'מדריכים', Icon: GraduationCap },
  { key: 'store', label: 'חנות', Icon: ShoppingBag },
];

interface Props {
  value: DashTab;
  onChange: (t: DashTab) => void;
  /** Compact form used once the page has been scrolled. */
  compact?: boolean;
}

export default function FloatingIsland({ value, onChange, compact = false }: Props) {
  const railRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [glide, setGlide] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  const moveGlide = () => {
    const el = btnRefs.current[value];
    const rail = railRef.current;
    if (!el || !rail) return;
    setGlide({ left: el.offsetLeft, width: el.offsetWidth });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  useEffect(() => {
    moveGlide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // The compact form changes tab padding, so the pill has to be re-measured
  // after that transition or it ends up under the wrong tab.
  useEffect(() => {
    moveGlide();
    const t = setTimeout(moveGlide, 260);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact]);

  useEffect(() => {
    const t = setTimeout(moveGlide, 350);
    window.addEventListener('resize', moveGlide);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', moveGlide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`${styles.glass} ${compact ? styles.compact : ''}`}>
      <div className={styles.rail} ref={railRef} role="tablist" aria-label="ניווט לוח בקרה">
        <div className={styles.glide} style={{ left: glide.left, width: glide.width }} aria-hidden />
        {DASH_TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            ref={(el) => {
              btnRefs.current[key] = el;
            }}
            className={styles.tab}
            role="tab"
            aria-selected={value === key}
            onClick={() => onChange(key)}
          >
            <Icon className={styles.icon} aria-hidden />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
