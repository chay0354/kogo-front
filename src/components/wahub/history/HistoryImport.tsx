'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Check, Copy, History } from 'lucide-react';
import { readableError } from '@/lib/apiError';
import {
  NO_COUNTS,
  addCounts,
  batches,
  many,
  progressLines,
  readHistoryFile,
  type HistoryFile,
  type ImportCounts,
} from '@/lib/wahub/historyFile';
import { fetchCopiedCount, sendHistoryBatch } from '@/lib/wahub/historyImportApi';
import { HISTORY_FILE_NAME, MANYCHAT_SCRIPT } from '@/lib/wahub/historyScript';
import { Spinner } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';

type Phase = 'idle' | 'sending' | 'done';

const MANYCHAT_INBOX = 'https://app.manychat.com/fb5259597/inbox';

/**
 * "העתקת השיחות מ-ManyChat" — once, every conversation from before the switch (the owner, 14.10.2026: "אני צריך
 * את כל השיחות שהיו שיהיה לי אותם"). A few lines pasted in ManyChat make one file of them
 * (lib/wahub/historyScript.ts); picked here, it goes to Kogo a few conversations at a time. Nothing is sent to
 * anybody.
 */
export default function HistoryImport() {
  const [copied, setCopied] = useState<number | null>(null);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [file, setFile] = useState<HistoryFile | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [counts, setCounts] = useState<ImportCounts>(NO_COUNTS);
  const [failed, setFailed] = useState(0);
  const [problem, setProblem] = useState('');
  const codeBox = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    fetchCopiedCount()
      .then(setCopied)
      .catch(() => setCopied(null));
  }, []);

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(MANYCHAT_SCRIPT);
      setScriptCopied(true);
    } catch {
      // No clipboard here: the code is selected in its box, to copy by hand.
      codeBox.current?.closest('details')?.setAttribute('open', '');
      codeBox.current?.select();
    }
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (!picked || phase === 'sending') return;
    setProblem('');
    let read: HistoryFile | null = null;
    try {
      read = readHistoryFile(JSON.parse(await picked.text()));
    } catch {
      read = null;
    }
    if (!read) {
      setProblem(`זה לא הקובץ שירד מ-ManyChat. צריך לבחור את ${HISTORY_FILE_NAME}`);
      return;
    }
    setFile(read);
    setCounts(NO_COUNTS);
    setFailed(0);
    setPhase('sending');
    for (const batch of batches(read.conversations)) {
      let kept: ImportCounts | null = null;
      for (let attempt = 0; attempt < 2 && !kept; attempt++) {
        try {
          kept = await sendHistoryBatch(batch);
        } catch (error) {
          if (attempt === 1) setProblem(readableError(error, 'השמירה נכשלה'));
        }
      }
      if (kept) {
        const add = kept;
        setCounts((total) => addCounts(total, add));
      } else {
        setFailed((total) => total + batch.length);
      }
    }
    setPhase('done');
    fetchCopiedCount()
      .then(setCopied)
      .catch(() => undefined);
  }

  const lines = file ? progressLines(counts, file.conversations.length) : null;

  return (
    <div className={cx(s.wahub, 'min-h-[100dvh] px-4 py-6')}>
      <div className={cx(s.card, 'mx-auto flex max-w-xl flex-col gap-4')}>
        <h1 className="flex items-center gap-2 text-xl font-extrabold">
          <History aria-hidden="true" className="h-5 w-5" />
          העתקת השיחות מ-ManyChat
        </h1>
        <p className={s.muted}>
          כל השיחות שהיו ב-ManyChat לפני המעבר נכנסות לשיחות ב-Kogo, כל הודעה במקומה. מי שלא היה ב-Kogo נוסף כאיש קשר.
          שום דבר לא נשלח ללקוחות.
        </p>
        {copied !== null && copied > 0 && <p className="font-bold">עד עכשיו הועתקו {many(copied, 'שיחה אחת', 'שיחות')}</p>}

        <ol className="flex list-decimal flex-col gap-3 ps-5">
          <li>
            ב-Chrome, בלשונית אחרת:{' '}
            <a href={MANYCHAT_INBOX} target="_blank" rel="noopener noreferrer" className="font-bold underline">
              פותחים את ManyChat ↗
            </a>
          </li>
          <li>
            {/* A step stays a numbered item: the button sits inside it, never as the item itself. */}
            <button type="button" onClick={() => void copyScript()} className={cx(s.btn, s.btnP, 'align-middle')}>
              {scriptCopied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
              {scriptCopied ? 'הקוד הועתק' : 'העתק את הקוד'}
            </button>
          </li>
          <li>
            ב-ManyChat: <b>Cmd+Option+J</b>, מדביקים, <b>Enter</b>. בפעם הראשונה Chrome מבקש להקליד <code>allow pasting</code>.
            אחרי כמה דקות יורד קובץ.
          </li>
          <li>
            <label className={cx(s.btn, 'align-middle', phase === 'sending' && 'pointer-events-none opacity-60')}>
              בחר את הקובץ שירד
              <input type="file" accept="application/json,.json" onChange={(event) => void onFile(event)} className="sr-only" />
            </label>
          </li>
        </ol>

        {problem && (
          <p role="alert" className="font-bold">
            {problem}
          </p>
        )}

        {file && lines && (
          <div role="status" className="flex flex-col gap-1">
            <p className="flex items-center gap-2 text-lg font-extrabold">
              {phase === 'sending' && <Spinner className="h-4 w-4" />}
              {phase === 'done' ? 'הסתיים — ' : ''}
              {lines.main}
            </p>
            {lines.more && <p className={s.muted}>{lines.more}</p>}
            {failed > 0 && <p className="font-bold">{many(failed, 'שיחה אחת לא נשמרה', 'שיחות לא נשמרו')} — אפשר לבחור את הקובץ שוב, מה שכבר נשמר לא יוכפל</p>}
            {phase === 'done' && <p className={s.muted}>אפשר למחוק את הקובץ מההורדות.</p>}
          </div>
        )}

        <details className={s.muted}>
          <summary className="cursor-pointer">מה הקוד עושה</summary>
          <p className="mt-2">
            קורא ב-ManyChat, דרך החיבור שלך, את רשימת שיחות הוואטסאפ ואת ההודעות בכל אחת — אותן קריאות שהמסך של ManyChat עושה —
            ושומר אותן בקובץ אחד במחשב שלך. הוא לא שולח, לא משנה ולא מוחק כלום ב-ManyChat.
          </p>
          <textarea
            ref={codeBox}
            readOnly
            value={MANYCHAT_SCRIPT}
            dir="ltr"
            rows={8}
            className="mt-2 w-full rounded-lg border p-2 font-mono text-xs"
          />
        </details>
      </div>
    </div>
  );
}
