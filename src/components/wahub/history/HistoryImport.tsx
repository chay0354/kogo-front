'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { History } from 'lucide-react';
import { readableError } from '@/lib/apiError';
import {
  BRIDGE,
  MANYCHAT_INBOX,
  MANYCHAT_ORIGIN,
  NO_COUNTS,
  addCounts,
  progressLines,
  readBridgeMessage,
  type ImportCounts,
} from '@/lib/wahub/historyBridge';
import { fetchStillToCopy, sendHistoryBatch, type StillToCopy } from '@/lib/wahub/historyImportApi';
import { Spinner } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';

type Phase = 'loading' | 'error' | 'idle' | 'waiting' | 'reading' | 'done';

/**
 * "העתקת השיחות מ-ManyChat" — once, the conversations from before the switch (lib/wahub/historyBridge.ts).
 * Opens ManyChat's inbox in a window of its own; the office's session there reads the conversations Kogo asks
 * for and hands them back here, and this page sends them to Kogo a batch at a time. Nothing is sent to anybody.
 */
export default function HistoryImport() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [wanted, setWanted] = useState<StillToCopy | null>(null);
  const [counts, setCounts] = useState<ImportCounts>(NO_COUNTS);
  const [failed, setFailed] = useState(0);
  const [problem, setProblem] = useState('');
  const opened = useRef<Window | null>(null);
  // The batches go to Kogo one after the other, in the order ManyChat's window sent them.
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    fetchStillToCopy()
      .then((still) => {
        setWanted(still);
        setPhase('idle');
      })
      .catch((error) => {
        setProblem(readableError(error, 'לא הצלחנו לקרוא אילו שיחות להעתיק'));
        setPhase('error');
      });
  }, []);

  const onMessage = useCallback(
    (event: MessageEvent) => {
      const message = readBridgeMessage(event.origin, event.data);
      if (!message || !wanted || !event.source || event.source !== opened.current) return;
      const reply = (body: Record<string, unknown>) =>
        (event.source as Window).postMessage({ bridge: BRIDGE, ...body }, MANYCHAT_ORIGIN);
      if (message.kind === 'ready') {
        reply({ kind: 'want', subscribers: wanted.subscribers, switched_at: wanted.switchedAt });
        setPhase('reading');
        return;
      }
      if (message.kind === 'done') {
        queue.current = queue.current.then(() => setPhase('done'));
        return;
      }
      queue.current = queue.current.then(async () => {
        try {
          const kept = await sendHistoryBatch(message.conversations);
          setCounts((total) => addCounts(total, kept));
          reply({ kind: 'ack', seq: message.seq, ok: true, counts: kept });
        } catch (error) {
          setFailed((total) => total + message.conversations.length);
          reply({ kind: 'ack', seq: message.seq, ok: false, error: readableError(error, 'השמירה נכשלה') });
        }
      });
    },
    [wanted],
  );

  useEffect(() => {
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onMessage]);

  function openManyChat() {
    opened.current = window.open(MANYCHAT_INBOX, 'kogo-history');
    setPhase(opened.current ? 'waiting' : 'error');
    if (!opened.current) setProblem('הדפדפן לא פתח את החלון של ManyChat — צריך לאפשר חלונות קופצים לדף הזה');
  }

  const total = wanted?.subscribers.length ?? 0;
  const lines = progressLines(counts, total);

  return (
    <div className={cx(s.wahub, 'min-h-[100dvh] px-4 py-6')}>
      <div className={cx(s.card, 'mx-auto flex max-w-xl flex-col gap-3')}>
        <h1 className="flex items-center gap-2 text-xl font-extrabold">
          <History aria-hidden="true" className="h-5 w-5" />
          העתקת השיחות מ-ManyChat
        </h1>
        <p className={s.muted}>
          מה שהבוט הישן והמשרד כתבו לפני המעבר נכנס לשיחות ב-Kogo, כל הודעה במקומה. שום דבר לא נשלח ללקוחות.
        </p>

        {phase === 'loading' && <Spinner className="h-5 w-5" />}
        {phase === 'error' && (
          <p role="alert" className="font-bold">
            {problem}
          </p>
        )}

        {wanted && phase !== 'error' && (
          <>
            <p className="text-lg font-extrabold">
              {total.toLocaleString('he-IL')} שיחות התחילו לפני המעבר ועוד לא הועתקו
            </p>
            {phase === 'idle' && total > 0 && (
              <button type="button" onClick={openManyChat} className={cx(s.btn, s.btnP, 'self-start')}>
                פתח את ManyChat
              </button>
            )}
            {phase === 'waiting' && <p className={s.muted}>מחכה לחלון של ManyChat…</p>}
            {(phase === 'reading' || phase === 'done') && (
              <div role="status" className="flex flex-col gap-1">
                <p className="flex items-center gap-2 font-bold">
                  {phase === 'reading' && <Spinner className="h-4 w-4" />}
                  {phase === 'done' ? 'הסתיים — ' : ''}
                  {lines.main}
                </p>
                {lines.more && <p className={s.muted}>{lines.more}</p>}
                {failed > 0 && <p className="font-bold">{failed.toLocaleString('he-IL')} שיחות לא נשמרו — אפשר להריץ שוב</p>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
