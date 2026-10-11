'use client';

import type { WahubTab } from '@/types/wahub';
import { cx } from './shared/tones';
import s from './wahub.module.css';
import WahubNav from './WahubNav';

interface WahubHeadProps {
  active: WahubTab;
  /** A poll has answered, and they keep answering: the screen updates by itself. */
  live: boolean;
  /** People asking for a person — the number on "שיחות". */
  needsHuman: number;
  onSelect: (tab: WahubTab) => void;
}

/**
 * The section's title row: the title, "חי", and the five tabs — nothing else
 * (docs/WAHUB-CONTRACT-POLISH-1.md, ג). How the connection and the automatic
 * summary stand is read in the settings, under "מצב המערכת". One compact row on
 * a desktop; on a phone the tabs are the bar at the bottom of the screen (the
 * stylesheet moves them).
 */
export default function WahubHead({ active, live, needsHuman, onSelect }: WahubHeadProps) {
  return (
    <header className={cx(s.head, 'flex shrink-0 flex-wrap items-center')}>
      <h1 className={s.h1}>וואטסאפ ולידים</h1>
      {/* The pulsing dot of the sketch: shown once a poll has answered, and while they keep answering. */}
      {live && (
        <span className={s.subT} title="המסך מתעדכן לבד">
          <span className={s.dot} aria-hidden="true" />
          <span className={s.liveWord}>חי</span>
        </span>
      )}
      <WahubNav active={active} needsHuman={needsHuman} onSelect={onSelect} />
    </header>
  );
}
