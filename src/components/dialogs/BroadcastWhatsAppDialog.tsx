'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Copy, Minimize2, MessageCircle, Send, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogCloseButton } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import BroadcastProgress from '@/components/broadcast/BroadcastProgress';
import type { BroadcastDraft } from '@/components/broadcast/BroadcastRunProvider';
import {
  previewCounts,
  sentCounts,
  type BroadcastRun,
  type RunSnapshot,
} from '@/lib/broadcastRun';
import {
  automationDisplayLabel,
  automationOptionValue,
  fetchWhatsAppAutomations,
  fetchWhatsAppStatus,
  parseAutomationValue,
  type BroadcastRow,
  type WhatsAppAutomation,
} from '@/lib/whatsappApi';

interface BroadcastWhatsAppDialogProps {
  open: boolean;
  /** The selection the office opened the broadcast with. */
  draft: BroadcastDraft | null;
  /** The run once a check has started; it outlives this dialog being closed. */
  run: BroadcastRun | null;
  snapshot: RunSnapshot | null;
  /** The X, Escape or a click outside: minimises a run under way, ends anything else. */
  onClose: () => void;
  onMinimize: () => void;
  onCheck: (automation: WhatsAppAutomation) => void;
  onBack: () => void;
  onCancel: () => void;
  onStart: () => void;
  onDismiss: () => void;
}

/**
 * There used to be a hand-written copy of the Kogo templates here, shown
 * whenever ManyChat's list came back empty. It had drifted — no card update, no
 * card link — so the office saw six templates where the server knew ten, with
 * nothing on screen to say a list had been substituted. The server now returns
 * every template it knows and says whether ManyChat answered, so there is one
 * list and it explains itself.
 */

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
 *
 * The run itself lives in BroadcastRunProvider. This dialog only draws it, so
 * closing it mid-run tucks the run into the corner, and opening it again shows
 * the same run where it has got to.
 */
export default function BroadcastWhatsAppDialog({
  open,
  draft,
  run,
  snapshot,
  onClose,
  onMinimize,
  onCheck,
  onBack,
  onCancel,
  onStart,
  onDismiss,
}: BroadcastWhatsAppDialogProps) {
  const phase = snapshot?.phase ?? null;
  // A dry run that failed goes back to choosing, with the reason on top.
  const picking = !run || phase === 'failed';

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [automations, setAutomations] = useState<WhatsAppAutomation[]>([]);
  const [manychatOk, setManychatOk] = useState(true);
  const [manychatCount, setManychatCount] = useState<number | null>(null);
  const [loadingAutomations, setLoadingAutomations] = useState(false);
  const [automationValue, setAutomationValue] = useState('');
  const [loadError, setLoadError] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const selectedAutomation = useMemo(() => {
    const parsed = parseAutomationValue(automationValue);
    if (!parsed) return null;
    return (
      automations.find(
        (a) => a.automation_type === parsed.automation_type && a.automation_id === parsed.automation_id,
      ) ?? null
    );
  }, [automationValue, automations]);

  // The confirmation belongs to one preview: a new run starts unticked.
  useEffect(() => {
    setConfirmed(false);
  }, [run]);

  // The automation list is fetched once per selection, the first time the
  // choosing step is shown for it — going back from a preview keeps it.
  const loadedFor = useRef<BroadcastDraft | null>(null);
  useEffect(() => {
    if (!open || !picking || !draft || loadedFor.current === draft) return;
    loadedFor.current = draft;
    setLoadError('');
    let cancelled = false;
    let settled = false;
    (async () => {
      setLoadingAutomations(true);
      try {
        const status = await fetchWhatsAppStatus();
        if (cancelled) return;
        setConfigured(status.configured);
        try {
          const data = await fetchWhatsAppAutomations();
          if (cancelled) return;
          const list = data.automations ?? [];
          setAutomations(list);
          setManychatOk(data.manychat_ok !== false);
          setManychatCount(typeof data.manychat_count === 'number' ? data.manychat_count : null);
          setAutomationValue((prev) =>
            list.some((automation) => automationOptionValue(automation) === prev)
              ? prev
              : (list[0] ? automationOptionValue(list[0]) : ''),
          );
          if (data.manychat_error) {
            setLoadError(`ManyChat: ${data.manychat_error}`);
          }
        } catch {
          if (cancelled) return;
          setAutomations([]);
          setManychatOk(false);
          setLoadError('לא ניתן לטעון את רשימת האוטומציות מ-ManyChat');
        }
      } catch {
        if (cancelled) return;
        setConfigured(false);
        setAutomations([]);
        setManychatOk(false);
        setLoadError('לא ניתן לטעון את רשימת האוטומציות מ-ManyChat');
      } finally {
        settled = true;
        if (!cancelled) setLoadingAutomations(false);
      }
    })();
    return () => {
      cancelled = true;
      // Closed before the list came back: fetch it again next time.
      if (!settled) {
        setLoadingAutomations(false);
        if (loadedFor.current === draft) loadedFor.current = null;
      }
    };
  }, [open, picking, draft]);

  const runPreview = () => {
    if (!selectedAutomation) {
      toast.error('בחרו אוטומציה');
      return;
    }
    onCheck(selectedAutomation);
  };

  const previewRows = snapshot?.previewRows ?? [];
  const sentRows = snapshot?.sentRows ?? [];

  const previewSummary = useMemo(() => {
    const { willSend, skipped } = previewCounts(previewRows);
    const reasons: Record<string, number> = {};
    for (const r of previewRows) {
      if (r.status === 'skipped') reasons[r.reason || 'other'] = (reasons[r.reason || 'other'] || 0) + 1;
    }
    return { willSend, skipped, reasons };
  }, [previewRows]);

  const sentSummary = useMemo(() => sentCounts(sentRows), [sentRows]);

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

  const names = run?.names ?? draft?.childNames ?? {};
  const nameFor = (row: BroadcastRow) => names[row.child_id] || row.child_name;
  const total = run?.ids.length ?? draft?.childIds.length ?? 0;
  const error = phase === 'failed' ? snapshot?.error ?? '' : loadError;
  const paused = phase === 'paused' ? snapshot?.pausedAt ?? null : null;

  const minimizeHint = (
    <div className="flex flex-col items-center gap-1 pb-1">
      <Button type="button" variant="outline" size="sm" onClick={onMinimize}>
        <Minimize2 className="h-4 w-4 ml-1" />
        מזער והמשך לעבוד
      </Button>
      <p className="text-xs text-muted-foreground">ההתקדמות ממשיכה בכפתור בפינה השמאלית התחתונה</p>
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            שליחת WhatsApp ל-{total} ילדים שנבחרו
          </DialogTitle>
        </DialogHeader>
        <DialogCloseButton />

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {phase === 'checking' && (
          <div className="space-y-2">
            <BroadcastProgress
              phase="check"
              done={previewRows.length}
              total={total}
              finished={total > 0 && previewRows.length >= total}
              counts={[
                { label: 'יישלחו', value: previewSummary.willSend, tone: 'will' },
                { label: 'ידולגו', value: previewSummary.skipped, tone: 'skip' },
              ]}
            />
            {minimizeHint}
          </div>
        )}

        {picking && (
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
                {/*
                  The count is here so "only some of my templates" can be
                  checked instead of argued about: it is how many automations
                  ManyChat itself returned, next to how many are on offer.
                */}
                {manychatOk && manychatCount !== null ? (
                  <p className="text-xs text-muted-foreground">
                    {automations.length} תבניות לבחירה · {manychatCount} אוטומציות הגיעו מ-ManyChat. תבנית ווטסאפ
                    נשלחת רק אם היא יושבת בתוך אוטומציה — תבנית שאינה בתוך אוטומציה לא תופיע כאן.
                  </p>
                ) : null}
                {!manychatOk ? (
                  <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    ManyChat לא החזיר את רשימת האוטומציות שלו. מוצגות תבניות המערכת בלבד, ושליחה אמיתית תיכשל עד שהחיבור חוזר.
                  </p>
                ) : selectedAutomation?.in_manychat === false ? (
                  <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    אין ב-ManyChat אוטומציה בשם הזה, ולכן ההודעה תצא כטקסט חופשי — שמגיע רק ללקוח שכתב לנו ב-24 השעות
                    האחרונות. צרו אוטומציה בשם הזה והעלו אותה ל-Live כדי שתישלח כתבנית מאושרת.
                  </p>
                ) : null}
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
              <Button type="button" onClick={runPreview} disabled={loadingAutomations || !selectedAutomation}>
                המשך לתצוגה מקדימה
              </Button>
              <Button type="button" variant="outline" onClick={onCancel}>
                ביטול
              </Button>
            </div>
          </div>
        )}

        {phase === 'preview' && run && (
          <div className="space-y-4 py-2">
            <h3 className="font-semibold">2. תצוגה מקדימה — {run.automation.label}</h3>
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
              <Button type="button" onClick={onStart} disabled={!confirmed || previewSummary.willSend === 0}>
                <Send className="h-4 w-4 ml-1" />
                שליחה ל-{previewSummary.willSend} הורים
              </Button>
              <Button type="button" variant="outline" onClick={() => { setConfirmed(false); onBack(); }}>
                חזרה
              </Button>
              <Button type="button" variant="ghost" onClick={onCancel}>
                ביטול
              </Button>
            </div>
          </div>
        )}

        {run && (phase === 'sending' || phase === 'paused' || phase === 'done') && (
          <div className="space-y-4 py-2">
            {/* While paused the ring gives way to the decision below, so the
                counts it carried are shown here instead. */}
            {paused !== null && (
              <div className="flex flex-wrap gap-2 text-sm" aria-live="polite">
                <span className="rounded-full bg-emerald-100 text-emerald-900 px-3 py-1 font-medium">נשלחו {sentSummary.sent}</span>
                <span className={`rounded-full px-3 py-1 ${sentSummary.failed ? 'bg-red-100 text-red-900' : 'bg-muted'}`}>
                  נכשלו {sentSummary.failed}
                </span>
                <span className="rounded-full bg-muted px-3 py-1">דולגו {sentSummary.skipped}</span>
                <span className="rounded-full border px-3 py-1 text-muted-foreground">
                  טופלו {sentRows.length} מתוך {total}
                </span>
              </div>
            )}
            {paused === null && (
              <BroadcastProgress
                phase="send"
                done={sentRows.length}
                total={total}
                finished={phase === 'done'}
                counts={[
                  { label: 'נשלחו', value: sentSummary.sent, tone: 'sent' },
                  { label: 'נכשלו', value: sentSummary.failed, tone: 'fail' },
                  { label: 'דולגו', value: sentSummary.skipped, tone: 'skip' },
                ]}
              />
            )}
            {paused !== null && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm space-y-2">
                <p className="font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  קבוצה {paused + 1} לא ענתה בזמן — לא ידוע, ייתכן שנשלח חלקית.
                </p>
                <p className="text-muted-foreground">
                  אפשר להמשיך לקבוצות הבאות (הקבוצה הזו לא תישלח שוב) או לעצור כאן.
                </p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => void run.resume()}>
                    המשך לקבוצה הבאה
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => run.stop()}>
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
            {phase === 'sending' && minimizeHint}
            {phase === 'done' && (
              <div className="flex justify-start gap-2">
                {sentSummary.failed > 0 && (
                  <Button type="button" variant="outline" onClick={copyFailures}>
                    <Copy className="h-4 w-4 ml-1" />
                    העתק את הכשלונות
                  </Button>
                )}
                <Button type="button" onClick={onDismiss}>סגור</Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
