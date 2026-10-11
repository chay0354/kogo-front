'use client';

import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { changeHeading, type PlainChange } from '@/lib/wahub/plain';
import type { WahubProposalEvidence } from '@/types/wahub';
import { WhoMark } from '../bot/shared';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import r from './refine.module.css';

export type PlainStands = 'waiting' | 'applied' | 'undone' | 'rejected';

interface PlainCardProps {
  model: PlainChange;
  /** Where the change stands: it will happen, it did, it was taken back, it was turned down. */
  stands: PlainStands;
  /** Beside the headline: where it stands, where it came from, when. */
  pills?: ReactNode;
  /**
   * Folded to its headline. Left out, the card is always open and its headline
   * is not a button.
   */
  open?: boolean;
  onToggle?: () => void;
  /** "לשיחה", beside the reason. */
  onOpenChat?: () => void;
  /** "פתח את הרשומה", among the technical details. */
  onOpenItem?: () => void;
  /** The lines of the conversation that led here: a folded piece of their own, after the other two. */
  evidence?: ReadonlyArray<WahubProposalEvidence>;
  /** Said under the change: who decided and when, or why it still waits. */
  note?: ReactNode;
  /** The buttons. Beside the headline while the card is folded; at its end when it is open. */
  actions?: ReactNode;
  className?: string;
}

/**
 * A change to the bot's knowledge, as a person reads it
 * (docs/WAHUB-CONTRACT-REFINE.md, ג) — the one card of the floating panel, the
 * review tab and the small chat of "דיוק":
 *
 * 1. what the bot will do from now on;
 * 2. why, with the way to the conversation;
 * 3. what changes — one paragraph; for an update, "היה" above "יהיה", and only
 *    for what really changed. A new item shows no "before" and nothing in red;
 * 4. "דוגמאות", folded;
 * 5. "פרטים טכניים", folded — the only place a code name is written;
 * 6. the buttons.
 */
export default function PlainCard({
  model,
  stands,
  pills,
  open = true,
  onToggle,
  onOpenChat,
  onOpenItem,
  evidence,
  note,
  actions,
  className,
}: PlainCardProps) {
  const heading = changeHeading(stands);
  const headline = (
    <>
      <span className={r.plainTitle} dir="auto">
        {model.headline}
      </span>
      {pills && <span className={r.plainPills}>{pills}</span>}
    </>
  );
  const hasExamples = Boolean(model.exampleBad || model.exampleGood);
  const item = model.tech.find((row) => row.key === 'item');

  return (
    <article className={cx(r.plain, stands === 'undone' && r.plainUndone, className)} aria-label={model.headline}>
      <div className={r.plainTop}>
        {onToggle ? (
          <button type="button" aria-expanded={open} onClick={onToggle} className={r.plainHeadline} title={open ? undefined : 'לחיצה פותחת את הפרטים'}>
            {headline}
          </button>
        ) : (
          <div className={r.plainHeadline}>{headline}</div>
        )}
        {!open && actions && <div className={r.plainActions}>{actions}</div>}
      </div>

      {open && (
        <>
          {(model.why || onOpenChat) && (
            <p className={r.plainWhy} dir="auto">
              {model.why && (
                <>
                  <strong>למה:</strong> {model.why}{' '}
                </>
              )}
              {onOpenChat && (
                <button type="button" onClick={onOpenChat} className={cx(s.link, '!text-[12.5px]')}>
                  לשיחה
                </button>
              )}
            </p>
          )}

          <section aria-label={heading}>
            <h4 className={r.plainLabel}>{heading}</h4>
            {model.rows.length > 0 ? (
              model.rows.map((row) => (
                <div key={row.key} className={r.swap}>
                  {model.rows.length > 1 && <span className={r.swapField}>{row.label}</span>}
                  <p className={r.was} dir="auto">
                    <span>היה</span>
                    <span>{row.before}</span>
                  </p>
                  <p className={r.willBe} dir="auto">
                    <span>{stands === 'applied' ? 'עכשיו' : 'יהיה'}</span>
                    <span>{row.after}</span>
                  </p>
                </div>
              ))
            ) : (
              <p className={r.plainRule} dir="auto">
                {model.rule || 'אין פירוט לשינוי הזה.'}
              </p>
            )}
          </section>

          {hasExamples && (
            <details className={r.more}>
              <summary>
                דוגמאות
                <ChevronDown aria-hidden="true" />
              </summary>
              <div className={r.moreBody}>
                {model.exampleBad && (
                  <p className={cx(r.example, r.exampleBad)} dir="auto">
                    <span>דוגמה רעה</span>
                    {model.exampleBad}
                  </p>
                )}
                {model.exampleGood && (
                  <p className={cx(r.example, r.exampleGood)} dir="auto">
                    <span>דוגמה טובה</span>
                    {model.exampleGood}
                  </p>
                )}
              </div>
            </details>
          )}

          {model.tech.length > 0 && (
            <details className={r.more}>
              <summary>
                פרטים טכניים
                <ChevronDown aria-hidden="true" />
              </summary>
              <div className={r.moreBody}>
                <dl className={r.tech}>
                  {model.tech.map((row) => (
                    <div key={row.key} className="contents">
                      <dt>{row.label}</dt>
                      <dd>
                        {row.value}
                        {row.value && row.code ? ' ' : ''}
                        {row.code && <code className={r.code}>{row.code}</code>}
                      </dd>
                    </div>
                  ))}
                </dl>
                {item && onOpenItem && (
                  <button type="button" onClick={onOpenItem} className={cx(s.link, 'self-start !text-[12.5px]')}>
                    פתח את הרשומה
                  </button>
                )}
              </div>
            </details>
          )}

          {evidence && evidence.length > 0 && (
            <details className={r.more}>
              <summary>
                מה נאמר בשיחה <span className={s.num}>({evidence.length})</span>
                <ChevronDown aria-hidden="true" />
              </summary>
              <ul className={cx(r.moreBody, 'm-0 list-none p-0')}>
                {evidence.map((line, index) => (
                  <li key={`${line.message_id ?? 'x'}-${index}`} className={s.evLine}>
                    <WhoMark who={line.who} />
                    <p dir="auto">{line.text}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {note}
          {actions && <div className={r.plainActions}>{actions}</div>}
        </>
      )}
    </article>
  );
}
