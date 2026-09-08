'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Copy, MessageCircle, Send, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogCloseButton } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  automationDisplayLabel,
  automationOptionValue,
  broadcastChunkSize,
  broadcastToChildren,
  chunkIds,
  fetchWhatsAppAutomations,
  fetchWhatsAppStatus,
  parseAutomationValue,
  type BroadcastRow,
  type WhatsAppAutomation,
} from '@/lib/whatsappApi';

type Step = 'pick' | 'preview' | 'sending' | 'done';

type ChunkOutcome = { index: number; state: 'ok' | 'unknown' };

interface BroadcastWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Selected child ids, in the order the office picked them. */
  childIds: string[];
  /** Names for the ids we know (the list page has them); missing ones show the id's row from the preview. */
  childNames: Record<string, string>;
  /** Called after a real send finished (fully or partially) so the page can clear the selection. */
  onSent?: () => void;
  /** The lesson / weekday the list was filtered by, so a child in several slots gets that lesson's details. */
  lessonHint?: string | null;
  dayHint?: number | null;
}

/**
 * The Kogo templates the server knows (apps/core/manychat_service.py
 * AUTOMATION_LABELS). Offered when ManyChat's own flow list is empty or
 * unreachable, so the office can still preview; a real send to an
 * unconfigured ManyChat is refused by the server.
 */
const KOGO_KIND_FALLBACK: WhatsAppAutomation[] = [
  ['subscription', 'הרשמה למנוי'],
  ['trial', 'רישום לשיעור ניסיון'],
  ['trial_10am', 'תזכורת שיעור ניסיון (10:00)'],
  ['trial_after_test', 'אחרי שיעור ניסיון'],
  ['payment_failed', 'תשלום נכשל'],
  ['didnt_arrive', 'לא הגיע (3 פעמים)'],
].map(([id, label]) => ({
  automation_type: 'kind' as const,
  automation_id: id,
  flow_ns: '',
  label,
  kogo_label: label,
  needs_enrollment_context: true,
}));

const REASON_LABELS: Record<string, string> = {
  no_parent_phone: 'ללא טלפון',
  duplicate_phone: 'כפול (אותו טלפון)',
  no_active_lesson: 'ללא שיעור פעיל',
};

function rowStatusLabel(row: BroadcastRow) {
  if (row.status === 'sent') return row.method === 'flow' ? 'נשלח' : 'נשלח (טקסט חופשי)';
  if (row.status === 'failed') return `נכשל${row.error ? ` · ${row.error}` : ''}`;
  if (row.status === 'preview') return 'יישלח';
  return `ידולג · ${REASON_LABELS[row.reason || ''] || row.reason || ''}`;
}

/**
 * Three steps: choose the automation → preview (dry run over every chunk,
 * nothing sent) → confirm and send chunk by chunk with progress.
 * Preview and Production share the ManyChat account, so a real send is
 * never implicit: the server defaults to dry_run and the checkbox here is
 * the only way to turn it off.
 */
export default function BroadcastWhatsAppDialog({
  open,
  onOpenChange,
  childIds,
  childNames,
  onSent,
  lessonHint,
  dayHint,
}: BroadcastWhatsAppDialogProps) {
  const [step, setStep] = useState<Step>('pick');
  // The selection is snapshotted when the dialog opens: the page clears it
  // after a send, and the title and the chunks must not follow that.
  const [ids, setIds] = useState<string[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [automations, setAutomations] = useState<WhatsAppAutomation[]>([]);
  const [loadingAutomations, setLoadingAutomations] = useState(false);
  const [automationValue, setAutomationValue] = useState('');

  const [previewRows, setPreviewRows] = useState<BroadcastRow[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const [sentRows, setSentRows] = useState<BroadcastRow[]>([]);
  const [chunkProgress, setChunkProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [paused, setPaused] = useState<ChunkOutcome | null>(null);
  const [error, setError] = useState('');
  const sendStateRef = useRef<{ skipPhones: string[]; chunks: string[][] } | null>(null);
  const hintBody = {
    ...(lessonHint ? { lesson_id: lessonHint } : {}),
    ...(dayHint !== null && dayHint !== undefined ? { day_of_week: dayHint } : {}),
  };

  const selectedAutomation = useMemo(() => {
    const parsed = parseAutomationValue(automationValue);
    if (!parsed) return null;
    return (
      automations.find(
        (a) => a.automation_type === parsed.automation_type && a.automation_id === parsed.automation_id,
      ) ?? null
    );
  }, [automationValue, automations]);

  // Reset whenever the dialog opens with a new selection.
  useEffect(() => {
    if (!open) return;
    setIds(childIds);
    setStep('pick');
    setPreviewRows([]);
    setSentRows([]);
    setConfirmed(false);
    setPaused(null);
    setError('');
    setChunkProgress({ done: 0, total: 0 });
    sendStateRef.current = null;
    let cancelled = false;
    (async () => {
      setLoadingAutomations(true);
      try {
        const [status, data] = await Promise.all([fetchWhatsAppStatus(), fetchWhatsAppAutomations()]);
        if (cancelled) return;
        setConfigured(status.configured);
        const list = data.automations?.length ? data.automations : KOGO_KIND_FALLBACK;
        setAutomations(list);
        setAutomationValue((prev) => prev || (list[0] ? automationOptionValue(list[0]) : ''));
      } catch {
        if (cancelled) return;
        setConfigured(false);
        setAutomations(KOGO_KIND_FALLBACK);
        setError('לא ניתן לטעון את רשימת האוטומציות מ-ManyChat — מוצגות תבניות המערכת בלבד');
      } finally {
        if (!cancelled) setLoadingAutomations(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const runPreview = useCallback(async () => {
    if (!selectedAutomation) {
      toast.error('בחרו אוטומציה');
      return;
    }
    setPreviewing(true);
    setError('');
    const chunks = chunkIds(ids, broadcastChunkSize(selectedAutomation.automation_type));
    const rows: BroadcastRow[] = [];
    let skipPhones: string[] = [];
    try {
      for (const chunk of chunks) {
        const res = await broadcastToChildren({
          child_ids: chunk,
          automation_type: selectedAutomation.automation_type,
          automation_id: selectedAutomation.automation_id,
          dry_run: true,
          skip_phones: skipPhones,
          ...hintBody,
        });
        rows.push(...res.results);
        skipPhones = skipPhones.concat(res.phones);
      }
      setPreviewRows(rows);
      setStep('preview');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'התצוגה המקדימה נכשלה';
      setError(msg);
    } finally {
      setPreviewing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, selectedAutomation, lessonHint, dayHint]);

  const previewSummary = useMemo(() => {
    const willSend = previewRows.filter((r) => r.status === 'preview').length;
    const reasons: Record<string, number> = {};
    for (const r of previewRows) {
      if (r.status === 'skipped') reasons[r.reason || 'other'] = (reasons[r.reason || 'other'] || 0) + 1;
    }
    return { willSend, skipped: previewRows.length - willSend, reasons };
  }, [previewRows]);

  const sendChunksFrom = useCallback(
    async (startIndex: number) => {
      const state = sendStateRef.current;
      if (!state || !selectedAutomation) return;
      setStep('sending');
      setPaused(null);
      for (let i = startIndex; i < state.chunks.length; i += 1) {
        try {
          const res = await broadcastToChildren({
            child_ids: state.chunks[i],
            automation_type: selectedAutomation.automation_type,
            automation_id: selectedAutomation.automation_id,
            dry_run: false,
            skip_phones: state.skipPhones,
            ...hintBody,
          });
          state.skipPhones = state.skipPhones.concat(res.phones);
          setSentRows((prev) => prev.concat(res.results));
          setChunkProgress({ done: i + 1, total: state.chunks.length });
        } catch {
          // A timed-out chunk may well have gone out on the server (the client
          // timeout is longer than the function's). Never retry it by itself,
          // and treat its phones as used so a sibling in a later chunk does
          // not get a second message when the office continues.
          const chunk = new Set(state.chunks[i]);
          const usedPhones = previewRows
            .filter((r) => chunk.has(r.child_id) && r.status === 'preview' && r.phone)
            .map((r) => r.phone);
          state.skipPhones = state.skipPhones.concat(usedPhones);
          setChunkProgress({ done: i, total: state.chunks.length });
          setPaused({ index: i, state: 'unknown' });
          return;
        }
      }
      setStep('done');
      onSent?.();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onSent, selectedAutomation, previewRows, lessonHint, dayHint],
  );

  const startSending = useCallback(() => {
    if (!selectedAutomation || !confirmed) return;
    const chunks = chunkIds(ids, broadcastChunkSize(selectedAutomation.automation_type));
    sendStateRef.current = { skipPhones: [], chunks };
    setSentRows([]);
    setChunkProgress({ done: 0, total: chunks.length });
    void sendChunksFrom(0);
  }, [ids, confirmed, selectedAutomation, sendChunksFrom]);

  const sentSummary = useMemo(() => {
    const sent = sentRows.filter((r) => r.status === 'sent').length;
    const failed = sentRows.filter((r) => r.status === 'failed').length;
    const skipped = sentRows.filter((r) => r.status === 'skipped').length;
    return { sent, failed, skipped };
  }, [sentRows]);

  const copyFailures = async () => {
    const lines = sentRows
      .filter((r) => r.status === 'failed')
      .map((r) => `${r.child_name} · ${r.parent_name} · ${r.phone} · ${r.error || ''}`);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast.success('הרשימה הועתקה');
    } catch {
      toast.error('ההעתקה נכשלה');
    }
  };

  const nameFor = (row: BroadcastRow) => childNames[row.child_id] || row.child_name;
  const busy = previewing || step === 'sending';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && step === 'sending' && !paused) return; // do not close mid-send
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            שליחת WhatsApp ל-{ids.length} ילדים שנבחרו
          </DialogTitle>
        </DialogHeader>
        {step !== 'sending' && <DialogCloseButton />}

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {step === 'pick' && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">1. בחרו אוטומציה</h3>
            </div>
            {loadingAutomations ? (
              <div className="space-y-2" aria-busy="true" aria-label="טוען אוטומציות">
                <Skeleton className="h-3 w-56" />
                <Skeleton className="h-11 rounded-md" />
              </div>
            ) : automations.length === 0 ? (
              <p className="text-sm text-muted-foreground">לא נמצאו אוטומציות.</p>
            ) : (
              <>
                <select
                  className="input w-full"
                  value={automationValue}
                  onChange={(e) => setAutomationValue(e.target.value)}
                  aria-label="אוטומציה"
                >
                  {automations.map((a) => (
                    <option key={automationOptionValue(a)} value={automationOptionValue(a)}>
                      {automationDisplayLabel(a)}
                    </option>
                  ))}
                </select>
                {selectedAutomation?.needs_enrollment_context ? (
                  <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                    תבנית של המערכת: כל הורה יקבל את פרטי החוג, היום והשעה של הילד שלו. ילד ללא שיעור פעיל ידולג.
                  </p>
                ) : selectedAutomation ? (
                  <p className="text-xs text-muted-foreground bg-muted/40 border rounded-md px-3 py-2">
                    אוטומציה כללית של ManyChat: תישלח לכל הורה עם השם שלו; ללא פרטי חוג.
                  </p>
                ) : null}
              </>
            )}
            {configured === false && (
              <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                ManyChat אינו מוגדר בשרת הזה — אפשר לבנות תצוגה מקדימה, אבל שליחה אמיתית תידחה.
              </p>
            )}
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                השלב הבא הוא תצוגה מקדימה בלבד — שום הודעה לא יוצאת עד שתאשרו במפורש. שני ילדים עם אותו טלפון
                (אחים) מקבלים הודעה אחת.
              </span>
            </p>
            <div className="flex justify-start gap-2 pt-2">
              <Button type="button" onClick={runPreview} disabled={busy || !selectedAutomation}>
                {previewing ? 'בונה תצוגה מקדימה…' : 'המשך לתצוגה מקדימה'}
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                ביטול
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4 py-2">
            <h3 className="font-semibold">2. תצוגה מקדימה — {selectedAutomation ? automationDisplayLabel(selectedAutomation) : ''}</h3>
            <div className="flex flex-wrap gap-2 text-sm" aria-live="polite">
              <span className="rounded-full bg-emerald-100 text-emerald-900 px-3 py-1 font-medium">
                יישלחו {previewSummary.willSend}
              </span>
              <span className="rounded-full bg-muted px-3 py-1">ידולגו {previewSummary.skipped}</span>
              {Object.entries(previewSummary.reasons).map(([reason, n]) => (
                <span key={reason} className="rounded-full border px-3 py-1 text-muted-foreground">
                  {REASON_LABELS[reason] || reason} {n}
                </span>
              ))}
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border divide-y text-sm">
              {previewRows.map((row) => (
                <div key={row.child_id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <span className="font-medium">{nameFor(row)}</span>
                    {row.parent_name && <span className="text-muted-foreground"> · {row.parent_name}</span>}
                    {row.phone && <span className="text-muted-foreground tabular-nums" dir="ltr"> {row.phone}</span>}
                  </div>
                  <span className={row.status === 'preview' ? 'text-emerald-700' : 'text-muted-foreground'}>
                    {rowStatusLabel(row)}
                  </span>
                </div>
              ))}
            </div>
            <label className="flex items-start gap-2 text-sm rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={previewSummary.willSend === 0}
              />
              <span>
                אני מאשר/ת שליחה אמיתית ל-<strong>{previewSummary.willSend}</strong> הורים ב-WhatsApp. לא ניתן לבטל
                אחרי השליחה.
              </span>
            </label>
            <div className="flex justify-start gap-2">
              <Button type="button" onClick={startSending} disabled={!confirmed || previewSummary.willSend === 0}>
                <Send className="h-4 w-4 ml-1" />
                שליחה ל-{previewSummary.willSend} הורים
              </Button>
              <Button type="button" variant="outline" onClick={() => { setConfirmed(false); setStep('pick'); }}>
                חזרה
              </Button>
            </div>
          </div>
        )}

        {(step === 'sending' || step === 'done') && (
          <div className="space-y-4 py-2">
            <h3 className="font-semibold">{step === 'done' ? '3. הסתיים' : '3. שולח…'}</h3>
            <div className="flex flex-wrap gap-2 text-sm" aria-live="polite">
              <span className="rounded-full bg-emerald-100 text-emerald-900 px-3 py-1 font-medium">נשלחו {sentSummary.sent}</span>
              <span className={`rounded-full px-3 py-1 ${sentSummary.failed ? 'bg-red-100 text-red-900' : 'bg-muted'}`}>
                נכשלו {sentSummary.failed}
              </span>
              <span className="rounded-full bg-muted px-3 py-1">דולגו {sentSummary.skipped}</span>
              <span className="rounded-full border px-3 py-1 text-muted-foreground">
                קבוצה {chunkProgress.done}/{chunkProgress.total}
              </span>
            </div>
            {step === 'sending' && !paused && (
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden" role="progressbar"
                aria-valuemin={0} aria-valuemax={chunkProgress.total} aria-valuenow={chunkProgress.done}>
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${chunkProgress.total ? (chunkProgress.done / chunkProgress.total) * 100 : 0}%` }}
                />
              </div>
            )}
            {paused && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm space-y-2">
                <p className="font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  קבוצה {paused.index + 1} לא ענתה בזמן — לא ידוע, ייתכן שנשלח חלקית.
                </p>
                <p className="text-muted-foreground">
                  אפשר להמשיך לקבוצות הבאות (הקבוצה הזו לא תישלח שוב) או לעצור כאן.
                </p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => void sendChunksFrom(paused.index + 1)}>
                    המשך לקבוצה הבאה
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => { setStep('done'); onSent?.(); }}>
                    עצור
                  </Button>
                </div>
              </div>
            )}
            {sentRows.length > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-lg border divide-y text-sm">
                {sentRows.map((row) => (
                  <div key={row.child_id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <span className="font-medium">{nameFor(row)}</span>
                      {row.parent_name && <span className="text-muted-foreground"> · {row.parent_name}</span>}
                    </div>
                    <span
                      className={
                        row.status === 'sent'
                          ? 'text-emerald-700'
                          : row.status === 'failed'
                            ? 'text-red-700'
                            : 'text-muted-foreground'
                      }
                    >
                      {rowStatusLabel(row)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {step === 'done' && (
              <div className="flex justify-start gap-2">
                {sentSummary.failed > 0 && (
                  <Button type="button" variant="outline" onClick={copyFailures}>
                    <Copy className="h-4 w-4 ml-1" />
                    העתק את הכשלונות
                  </Button>
                )}
                <Button type="button" onClick={() => onOpenChange(false)}>סגור</Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
