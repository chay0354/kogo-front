'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import dialogMotion from '@/components/ui/motion.module.css';
import { useDialogExit } from '@/components/ui/motion';
import { EXTERNAL_BROADCAST_CHUNK, broadcastToExternalStudents } from '@/lib/externalStudents';
import type { ExternalBroadcastResult, ExternalStudent } from '@/types/externalStudent';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  students: ExternalStudent[];
}

/**
 * Send one ManyChat flow to the selected municipality parents.
 *
 * Preview first, always. The preview is a real server round trip — it applies
 * the same phone rules the send does — so what it lists is exactly who would
 * receive a message, not an optimistic guess made in the browser.
 */
export default function ExternalBroadcastDialog({ isOpen, onClose: dismiss, students }: Props) {
  const { closing, requestClose: onClose } = useDialogExit(dismiss);
  const [automationId, setAutomationId] = useState('');
  const [preview, setPreview] = useState<ExternalBroadcastResult | null>(null);
  const [sent, setSent] = useState<ExternalBroadcastResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPreview(null);
    setSent(null);
    setError(null);
  }, [isOpen]);

  const withPhone = students.filter((s) => (s.phone || '').trim());
  const tooMany = students.length > EXTERNAL_BROADCAST_CHUNK;

  const run = async (dryRun: boolean) => {
    if (!automationId.trim()) {
      setError('יש להזין מזהה אוטומציה');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await broadcastToExternalStudents({
        student_ids: students.slice(0, EXTERNAL_BROADCAST_CHUNK).map((s) => s.id),
        automation_id: automationId.trim(),
        dry_run: dryRun,
      });
      if (dryRun) setPreview(result);
      else setSent(result);
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: string } } }).response?.data;
      setError(data?.error || 'שגיאה בשליחה');
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 ${dialogMotion.overlay} ${closing ? dialogMotion.overlayClosing : ''}`}
      dir="rtl"
    >
      <div className={`bg-background rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto ${dialogMotion.panel} ${closing ? dialogMotion.panelClosing : ''}`}>
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-background">
          <h2 className="text-xl font-bold">שליחת וואטסאפ לתלמידים חיצוניים</h2>
          <button onClick={onClose} className="p-2 hover:bg-accent rounded-lg transition-colors" aria-label="סגירה">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">{error}</div>}

          <p className="text-sm text-muted-foreground">
            נבחרו {students.length} תלמידים, מתוכם {withPhone.length} עם טלפון.
            {tooMany && ` יישלחו ${EXTERNAL_BROADCAST_CHUNK} הראשונים בבקשה זו.`}
          </p>

          <div>
            <label className="block text-sm font-medium mb-2">מזהה אוטומציה (Flow)</label>
            <input
              value={automationId}
              onChange={(e) => setAutomationId(e.target.value)}
              placeholder="content20250101000000_000000"
              className="w-full px-3 py-2 border border-border rounded-lg bg-background"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              רק אוטומציה חופשית. תבניות ההרשמה של Kogo בנויות סביב חוג ומועד של הרשמה משלמת.
            </p>
          </div>

          {preview && !sent && (
            <div className="rounded-lg border border-border p-3 text-sm space-y-1">
              <div className="font-medium">תצוגה מקדימה — לא נשלח דבר</div>
              <div>יישלח ל־{preview.preview_count} נמענים · ידולגו {preview.skipped}</div>
              <ul className="max-h-40 overflow-y-auto text-xs text-muted-foreground">
                {preview.results.map((row) => (
                  <li key={row.student_id}>
                    {row.student_name} — {row.status === 'preview' ? row.phone : `דילוג (${row.reason})`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sent && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
              נשלחו {sent.sent} · נכשלו {sent.failed} · דולגו {sent.skipped}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(true)}
              className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              {busy ? 'רגע…' : 'תצוגה מקדימה'}
            </button>
            <button
              type="button"
              disabled={busy || !preview || Boolean(sent)}
              onClick={() => void run(false)}
              className="flex-1 rounded-md px-4 py-2 text-sm font-medium text-white bg-primary disabled:opacity-50"
            >
              שליחה בפועל
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            שליחה נפתחת רק אחרי תצוגה מקדימה.
          </p>
        </div>
      </div>
    </div>
  );
}
