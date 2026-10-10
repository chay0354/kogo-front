'use client';

import { BOT_SUBS } from '@/lib/wahub/bot';
import type { WahubBotSub, WahubStatus } from '@/types/wahub';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import DemoTab from './demo/DemoTab';
import HoursTab from './hours/HoursTab';
import KnowledgeTab from './knowledge/KnowledgeTab';
import ReviewTab from './review/ReviewTab';
import ShadowTab from './shadow/ShadowTab';
import TryTab from './try/TryTab';

interface BotTabProps {
  sub: WahubBotSub;
  status: WahubStatus | undefined;
  /** The knowledge item named in the address. */
  openItemId: number | null;
  /** A question handed to "נסה שאלה". */
  tryQuestion: string;
  onSub: (sub: WahubBotSub) => void;
  onOpenItem: (id: number | null) => void;
  onTryQuestion: (question: string) => void;
  onOpenChat: (contactId: number) => void;
  /** Demo contacts were made or removed: the lists read themselves again. */
  onDemoChanged: () => void;
}

/**
 * "הבוט": what the new bot knows and how it would answer. Six sub-tabs; the
 * one in front is in the address (?tab=bot&sub=…), so a link opens it.
 */
export default function BotTab({ sub, status, openItemId, tryQuestion, onSub, onOpenItem, onTryQuestion, onOpenChat, onDemoChanged }: BotTabProps) {
  const openItem = (id: number) => onOpenItem(id);
  return (
    <div className={cx(s.pg, 'flex flex-col gap-3.5')}>
      <div role="tablist" aria-label="חלקי הבוט" className={cx(s.seg, 'max-sm:!w-full')}>
        {BOT_SUBS.map((def) => {
          const active = sub === def.key;
          return (
            <button
              key={def.key}
              type="button"
              role="tab"
              id={`wahub-bot-tab-${def.key}`}
              aria-selected={active}
              aria-controls={`wahub-bot-panel-${def.key}`}
              title={def.hint}
              onClick={() => onSub(def.key)}
              className={cx(active && s.on, 'max-sm:flex-1 max-sm:!px-2')}
            >
              {def.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`wahub-bot-panel-${sub}`} aria-labelledby={`wahub-bot-tab-${sub}`}>
        {sub === 'knowledge' && <KnowledgeTab openItemId={openItemId} onOpenItem={onOpenItem} onTryQuestion={onTryQuestion} />}
        {sub === 'hours' && <HoursTab />}
        {sub === 'try' && <TryTab status={status} initialQuestion={tryQuestion} onOpenItem={openItem} />}
        {sub === 'shadow' && <ShadowTab status={status} onOpenChat={onOpenChat} onOpenItem={openItem} />}
        {sub === 'review' && <ReviewTab onOpenChat={onOpenChat} onOpenItem={openItem} />}
        {sub === 'demo' && <DemoTab onOpenChat={onOpenChat} onDemoChanged={onDemoChanged} />}
      </div>
    </div>
  );
}
