'use client';

import { formatShortDate } from '@/lib/wahub/format';
import { TEACH_TEXT, teachRowCanUndo, teachRowTone, undoQuestion } from '@/lib/wahub/teach';
import type { WahubTeachRow } from '@/types/wahubTeach';
import { Pill, Spinner } from '../../shared/bits';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';
import t from './teach.module.css';

export interface TeachHistoryProps {
  rows: ReadonlyArray<WahubTeachRow>;
  count: number;
  /** The thread open in the card above. */
  openId: number | null;
  /** The row "בטל" was pressed on: the question stands under it. */
  askingId: number | null;
  /** The row being taken back now. */
  undoingId: number | null;
  /** Why a row could not be taken back. */
  rowError: { id: number; text: string } | null;
  more: boolean;
  loadingMore: boolean;
  now: Date;
  onOpen: (id: number) => void;
  onAskUndo: (id: number | null) => void;
  onUndo: (id: number) => void;
  onMore: () => void;
}

/**
 * "מה לימדת עד היום": a quiet list — the date, what the bot understood, and
 * where it stands. A press opens the card above; "בטל" stands on every row that
 * has something to take back, and asks before it acts.
 */
export default function TeachHistory({
  rows,
  count,
  openId,
  askingId,
  undoingId,
  rowError,
  more,
  loadingMore,
  now,
  onOpen,
  onAskUndo,
  onUndo,
  onMore,
}: TeachHistoryProps) {
  return (
    <section className={t.history} aria-label={TEACH_TEXT.historyTitle}>
      <h3 className={t.historyTitle}>
        {TEACH_TEXT.historyTitle}
        {count > 0 && <span className={s.num}>{count}</span>}
      </h3>
      {rows.length === 0 ? (
        <p className={t.historyEmpty}>{TEACH_TEXT.historyEmpty}</p>
      ) : (
        <ul className={t.rows}>
          {rows.map((row) => {
            const open = row.thread === openId;
            const gone = row.state === 'undone' || row.state === 'nothing';
            return (
              <li key={row.thread}>
                <div className={cx(t.row, open && t.rowOpen, gone && t.rowGone)}>
                  <button
                    type="button"
                    onClick={() => onOpen(row.thread)}
                    aria-expanded={open}
                    title={row.understood}
                    className={t.rowMain}
                  >
                    <span className={cx(t.rowDate, s.num)}>{formatShortDate(row.at, now)}</span>
                    <span className={t.rowText} dir="auto">
                      {row.understood}
                    </span>
                    <Pill tone={teachRowTone(row.state)} className={t.rowState}>
                      {row.state_label}
                    </Pill>
                  </button>
                  {teachRowCanUndo(row) && (
                    <button
                      type="button"
                      onClick={() => onAskUndo(askingId === row.thread ? null : row.thread)}
                      disabled={undoingId !== null}
                      aria-expanded={askingId === row.thread}
                      aria-label={`${TEACH_TEXT.undo}: ${row.understood}`}
                      className={t.rowUndo}
                    >
                      {undoingId === row.thread ? <Spinner className="h-3.5 w-3.5" /> : TEACH_TEXT.undo}
                    </button>
                  )}
                </div>
                {askingId === row.thread && (
                  <div className={t.rowAsk} role="group" aria-label="אישור ביטול">
                    <p className={cx(t.text, 'm-0')}>{undoQuestion(row.state)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => onUndo(row.thread)} disabled={undoingId !== null} className={cx(s.btn, s.btnSm, s.btnP)}>
                        {undoingId === row.thread && <Spinner className="h-3.5 w-3.5" />}
                        {TEACH_TEXT.undoChange}
                      </button>
                      <button type="button" onClick={() => onAskUndo(null)} disabled={undoingId !== null} className={cx(s.btn, s.btnSm)}>
                        {TEACH_TEXT.keep}
                      </button>
                    </div>
                  </div>
                )}
                {rowError?.id === row.thread && (
                  <p className={t.rowNote} role="alert">
                    {rowError.text}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {more && (
        <button type="button" onClick={onMore} disabled={loadingMore} className={cx(s.btn, s.btnSm, t.moreRows)}>
          {loadingMore && <Spinner className="h-3.5 w-3.5" />}
          {TEACH_TEXT.more}
        </button>
      )}
    </section>
  );
}
