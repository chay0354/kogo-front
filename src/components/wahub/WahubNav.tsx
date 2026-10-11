'use client';

import { Bot, CalendarDays, MessagesSquare, Settings, Users } from 'lucide-react';
import { badgeText } from '@/lib/wahub/boxes';
import type { WahubTab } from '@/types/wahub';
import { cx } from './shared/tones';
import s from './wahub.module.css';

export const WAHUB_NAV: Array<{ key: WahubTab; label: string; icon: typeof Users }> = [
  { key: 'chats', label: 'שיחות', icon: MessagesSquare },
  { key: 'today', label: 'היום', icon: CalendarDays },
  { key: 'leads', label: 'לידים', icon: Users },
  { key: 'bot', label: 'הבוט', icon: Bot },
  { key: 'settings', label: 'הגדרות', icon: Settings },
];

interface WahubNavProps {
  active: WahubTab;
  /** People asking for a person — the one number worth a red mark (owner, 11.10). */
  needsHuman: number;
  onSelect: (tab: WahubTab) => void;
}

/**
 * The section's five tabs. On a desktop the segmented control under the title;
 * on a phone the same control pinned to the bottom of the screen, icon over
 * word, like a messaging app. The red mark on "שיחות" counts only who asks
 * for a person — the same rule as the mark on the menu.
 */
export default function WahubNav({ active, needsHuman, onSelect }: WahubNavProps) {
  const badge = badgeText(needsHuman);
  return (
    <div role="tablist" aria-label="לשוניות" className={cx(s.seg, s.segLg, s.nav, 'shrink-0')}>
      {WAHUB_NAV.map((tab) => {
        const on = active === tab.key;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`wahub-tab-${tab.key}`}
            aria-selected={on}
            aria-controls={`wahub-panel-${tab.key}`}
            onClick={() => onSelect(tab.key)}
            className={cx(on && s.on)}
          >
            <Icon aria-hidden="true" />
            <span>{tab.label}</span>
            {tab.key === 'chats' && badge && (
              <span className={cx(s.segBadge, s.num)} aria-label={`${needsHuman} מבקשים נציג`}>
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
