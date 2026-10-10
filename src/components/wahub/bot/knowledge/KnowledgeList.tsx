'use client';

import type { ReactNode } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import type { KnowledgeGroup } from '@/lib/wahub/bot';
import type { WahubKnowledgeItem, WahubKnowledgeKind } from '@/types/wahub';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';
import { ItemPills } from './KnowledgeCard';

interface KnowledgeListProps {
  groups: KnowledgeGroup[];
  openId: number | null;
  today: string;
  now: Date;
  onOpen: (id: number | null) => void;
  onAdd: (kind: WahubKnowledgeKind) => void;
  /** What stands under the open row: its card, or its editor. */
  renderOpen: (item: WahubKnowledgeItem) => ReactNode;
}

/** The title line of one item. The whole line is the button that opens it. */
function ItemRow({
  item,
  open,
  today,
  now,
  onToggle,
}: {
  item: WahubKnowledgeItem;
  open: boolean;
  today: string;
  now: Date;
  onToggle: () => void;
}) {
  const title =
    item.title || (item.kind === 'alias' ? `${item.what_customer_writes ?? ''} ← ${item.means ?? ''}` : item.body?.split('\n')[0]) || `רשומה ${item.id}`;
  return (
    <button
      type="button"
      id={`wahub-knowledge-${item.id}`}
      aria-expanded={open}
      aria-controls={`wahub-knowledge-body-${item.id}`}
      onClick={onToggle}
      className={cx(s.kRow, !item.is_active && s.kRowOff)}
    >
      <span className="min-w-0 flex-1">
        <span className={cx(s.t1, 'block truncate')} dir="auto">
          {title}
        </span>
        {!open && item.body && item.title && (
          <span className={cx(s.t2, 'mt-0.5 block truncate')} dir="auto">
            {item.body.replace(/\s+/g, ' ')}
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        <ItemPills item={item} today={today} now={now} />
        <ChevronDown className={cx('h-4 w-4 text-[var(--muted)] transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </span>
    </button>
  );
}

/**
 * The knowledge, grouped by kind. Each group is a card: its name and a line
 * on what belongs in it, then a title per item; the item's body on a press.
 */
export default function KnowledgeList({ groups, openId, today, now, onOpen, onAdd, renderOpen }: KnowledgeListProps) {
  return (
    <div className="flex flex-col gap-3.5">
      {groups.map((group) => (
        <section key={group.kind} className={cx(s.card, s.cardFlush)} aria-label={group.label}>
          <div className={s.kindHead}>
            <div className="min-w-0 flex-1">
              <h3>
                {group.label} <span className={cx(s.num, s.muted, 'font-bold')}>({group.items.length})</span>
              </h3>
              {group.hint && <p>{group.hint}</p>}
            </div>
            <button type="button" onClick={() => onAdd(group.kind)} className={cx(s.btn, s.btnSm)}>
              <Plus aria-hidden="true" />
              הוסף
            </button>
          </div>
          {group.items.length === 0 ? (
            <p className={cx(s.t2, 'm-0 px-4 py-3')}>עוד אין כאן רשומות.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {group.items.map((item) => {
                const open = openId === item.id;
                return (
                  <li key={item.id}>
                    <ItemRow item={item} open={open} today={today} now={now} onToggle={() => onOpen(open ? null : item.id)} />
                    {open && <div id={`wahub-knowledge-body-${item.id}`}>{renderOpen(item)}</div>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
