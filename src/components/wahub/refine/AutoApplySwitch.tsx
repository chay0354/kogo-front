'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { readableError } from '@/lib/apiError';
import { fetchWahubReviewSettings, isNotBuiltYet, patchWahubReviewSettings } from '@/lib/wahub/refineApi';
import type { WahubReviewSettings } from '@/types/wahubRefine';
import { botKeys } from '../hooks/useBotQueries';
import { Spinner } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import { refineKeys } from './useRefineChat';

export const AUTO_APPLY_TITLE = 'אישור אוטומטי של תיקונים';
export const AUTO_APPLY_LINE =
  'דולק: תיקון שהמערכת בטוחה בו נכנס לידע של הבוט מיד, ומופיע ב"ביקורת" עם "בטל". כבוי: כל תיקון מחכה לאישור שלך.';

export type AutoApplyState = 'loading' | 'ready' | 'error' | 'unavailable';

interface AutoApplyViewProps {
  on: boolean;
  state: AutoApplyState;
  /** The press is on its way to the server. */
  busy: boolean;
  onToggle: (on: boolean) => void;
  onRetry: () => void;
}

/** The card as it is drawn: one switch, one line saying what it does. */
export function AutoApplyView({ on, state, busy, onToggle, onRetry }: AutoApplyViewProps) {
  return (
    <section className={s.card} aria-label={AUTO_APPLY_TITLE}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={s.iconBox}>
          <Wand2 className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-extrabold">{AUTO_APPLY_TITLE}</h3>
          <p className={cx(s.t2, 'm-0 !text-[12.5px]')}>{AUTO_APPLY_LINE}</p>
        </div>
        {state === 'ready' && (
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={AUTO_APPLY_TITLE}
            disabled={busy}
            onClick={() => onToggle(!on)}
            className={cx(s.switchRow, 'shrink-0 !p-0')}
          >
            {busy ? <Spinner /> : <span className={s.switch} aria-hidden="true" />}
          </button>
        )}
        {state === 'loading' && <Spinner className="mt-1 h-4 w-4 shrink-0" />}
      </div>
      {state === 'unavailable' && (
        <p className={cx(s.muted, 'm-0 mt-2 text-[13px]')} role="status">
          עוד לא זמין: השרת עוד לא עודכן. עד אז כל תיקון מחכה לאישור שלך.
        </p>
      )}
      {state === 'error' && (
        <p className={cx(s.badText, 'm-0 mt-2 text-[13px] font-bold')} role="alert">
          לא הצלחנו לטעון את המתג.{' '}
          <button type="button" onClick={onRetry} className={s.link}>
            נסה שוב
          </button>
        </p>
      )}
    </section>
  );
}

/**
 * "אישור אוטומטי של תיקונים" in the settings (GET / PATCH settings/review/).
 * The switch moves only once the server has kept the press.
 */
export default function AutoApplySection() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: refineKeys.settings,
    queryFn: fetchWahubReviewSettings,
    staleTime: 30_000,
    retry: false,
  });
  const [busy, setBusy] = useState(false);

  async function toggle(on: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const saved = await patchWahubReviewSettings(on);
      queryClient.setQueryData<WahubReviewSettings>(refineKeys.settings, saved);
      // The review tab says where the switch stands, from its own figures.
      void queryClient.invalidateQueries({ queryKey: botKeys.reviewSummary });
      toast.success(saved.auto_apply ? 'אישור אוטומטי דולק.' : 'אישור אוטומטי כבוי. מעכשיו כל תיקון מחכה לאישור שלך.');
    } catch (error) {
      toast.error(readableError(error, 'המתג לא נשמר'));
    } finally {
      setBusy(false);
    }
  }

  const state: AutoApplyState = settings.isSuccess
    ? 'ready'
    : settings.isError
      ? isNotBuiltYet(settings.error)
        ? 'unavailable'
        : 'error'
      : 'loading';

  return (
    <AutoApplyView
      on={settings.data?.auto_apply ?? false}
      state={state}
      busy={busy}
      onToggle={(on) => void toggle(on)}
      onRetry={() => void settings.refetch()}
    />
  );
}
