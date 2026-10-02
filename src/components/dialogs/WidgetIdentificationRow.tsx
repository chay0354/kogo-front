'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatSignedAt, formatSignedDate } from '@/lib/signatureUtils';
import {
  fetchIdentificationSwitch,
  identificationSwitchLine,
  setIdentificationSwitch,
  type IdentificationSwitch,
} from '@/lib/widgetIdentificationApi';

/**
 * The family card's line for the registration form's identification, with the
 * office's switch. Switching it off or back on asks for a reason, and the
 * history of every switch is one press away.
 *
 * Shows nothing at all when the server has no such switch (an older server).
 */
export default function WidgetIdentificationRow({ familyId }: { familyId: string }) {
  const [state, setState] = useState<IdentificationSwitch | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    const current = ++request.current;
    setLoading(true);
    setMissing(false);
    fetchIdentificationSwitch(familyId)
      .then((next) => {
        if (current !== request.current) return;
        setState(next);
        setMissing(next === null);
      })
      .catch(() => {
        if (current === request.current) setMissing(true);
      })
      .finally(() => {
        if (current === request.current) setLoading(false);
      });
  }, [familyId]);

  if (missing) return null;

  const save = async () => {
    if (!state || reason.trim().length < 2) {
      setError('יש לכתוב סיבה');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const next = await setIdentificationSwitch(familyId, !state.blocked, reason);
      request.current += 1;
      if (next) setState(next);
      setAsking(false);
      setReason('');
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'השמירה נכשלה. נסו שוב.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex justify-between gap-4 items-center">
        <span className="text-muted-foreground text-sm">זיהוי אוטומטי בטופס ההרשמה</span>
        {loading ? (
          <Skeleton className="h-5 w-32" />
        ) : state ? (
          <span className="flex items-center gap-2 flex-wrap justify-end">
            <span className="font-medium">{identificationSwitchLine(state, formatSignedDate)}</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => { setReason(''); setError(''); setAsking(true); }}
            >
              {state.blocked ? 'הפעל' : 'כבה'}
            </Button>
            {state.history.length > 0 ? (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setShowHistory((open) => !open)}>
                {showHistory ? 'הסתר היסטוריה' : 'היסטוריה'}
              </Button>
            ) : null}
          </span>
        ) : (
          <span className="font-medium">-</span>
        )}
      </div>
      {showHistory && state ? (
        <ul className="text-xs text-muted-foreground space-y-1 pr-2 border-r-2 border-muted">
          {state.history.map((row, index) => (
            <li key={`${row.changed_at}-${index}`}>
              {formatSignedAt(row.changed_at)} · {row.blocked ? 'כובה' : 'הופעל'} · {row.reason}
              {row.changed_by_name ? ` · ${row.changed_by_name}` : ''}
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog open={asking} onOpenChange={(open) => { if (!saving) setAsking(open); }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {state?.blocked ? 'להפעיל מחדש את הזיהוי למשפחה?' : 'לכבות את הזיהוי למשפחה?'}
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 pt-2 space-y-4">
            <p className="text-sm text-muted-foreground">
              {state?.blocked
                ? 'טופס ההרשמה יחזור לזהות את המשפחה לפי תעודת זהות וטלפון, ולהציג את השמות הפרטיים של הילדים.'
                : 'טופס ההרשמה לא יזהה את המשפחה, וייפתח לה ריק כמו להורה חדש. מתאים לסכסוך בין הורים, לצו הרחקה או לבקשת ההורה.'}
            </p>
            <div>
              <label htmlFor="identification-reason" className="block text-sm font-medium mb-2">
                סיבה <span className="text-destructive">*</span>
              </label>
              <textarea
                id="identification-reason"
                className="input w-full"
                rows={3}
                required
                aria-required="true"
                placeholder="הסיבה נשמרת בהיסטוריה, עם מי ששינה ומתי"
                value={reason}
                onChange={(event) => { setReason(event.target.value); setError(''); }}
              />
            </div>
            {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" disabled={saving} onClick={() => setAsking(false)}>ביטול</button>
              <button className="btn-primary" disabled={saving || reason.trim().length < 2} onClick={save}>
                {saving ? 'שומר...' : state?.blocked ? 'הפעל' : 'כבה'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
