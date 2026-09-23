'use client';

/**
 * The weekly audit: seven days, seven areas, the whole system every week.
 *
 * One tile a day, coloured by what that day's audit found. A click opens it:
 * every screen that failed, the ones that were slow, and the area's own checks.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBriefRun } from '@/components/brief/BriefRunProvider';
import { readableError } from '@/lib/apiError';
import { fetchSystemAudit, hebrewWeekday, type AuditDay } from '@/lib/dailyBriefApi';
import styles from './brief.module.css';

const VERDICT = {
  green: { className: styles.tileGreen, Icon: CheckCircle2, label: 'תקין' },
  yellow: { className: styles.tileYellow, Icon: AlertTriangle, label: 'לבדוק' },
  red: { className: styles.tileRed, Icon: AlertTriangle, label: 'נמצאו תקלות' },
  running: { className: styles.tileRunning, Icon: Loader2, label: 'רצה' },
  none: { className: styles.tileNone, Icon: Circle, label: 'לא רצה' },
} as const;

export default function WeeklyAudit() {
  const run = useBriefRun();
  const [week, setWeek] = useState<AuditDay[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetchSystemAudit();
      setWeek(data.week);
      setSelected((prev) => prev || data.week[data.week.length - 1]?.day || '');
    } catch (err) {
      setError(readableError(err, 'טעינת בדיקת העומק נכשלה'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A run that just finished changes today's tile.
  useEffect(() => {
    if (!run.running && run.mode === 'audit' && run.audit) void load();
  }, [run.running, run.mode, run.audit, load]);

  const today = week[week.length - 1];
  const day = week.find((d) => d.day === selected) ?? today;
  const auditRunning = run.running && run.mode === 'audit';

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className={styles.sectionTitle}>בדיקת עומק שבועית</h3>
          <p className="text-sm text-muted-foreground">
            כל יום נבדק אזור אחר: כל המסכים שבו, והבדיקות המיוחדות שלו. אחרי שבוע כל המערכת עברה בדיקה.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void run.startAudit()} disabled={run.running}>
          <ShieldCheck className="h-4 w-4 ml-1" />
          {auditRunning ? 'בודק…' : `הרץ עכשיו${today ? ` · ${today.title}` : ''}`}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className={styles.weekGrid}>
        {week.map((d) => {
          const verdict = VERDICT[d.verdict] ?? VERDICT.none;
          const isToday = d === today;
          return (
            <button
              key={d.day}
              type="button"
              className={`${styles.tile} ${verdict.className} ${d.day === day?.day ? styles.tileSelected : ''}`}
              onClick={() => setSelected(d.day)}
              aria-pressed={d.day === day?.day}
            >
              <span className={styles.tileDay}>{isToday ? 'היום' : hebrewWeekday(d.day)}</span>
              <verdict.Icon size={16} aria-hidden className={d.verdict === 'running' ? styles.spin : ''} />
              <span className={styles.tileArea}>{d.title}</span>
              <span className={styles.tileVerdict}>{verdict.label}</span>
            </button>
          );
        })}
      </div>

      {day && day.verdict !== 'none' && (
        <div className={styles.auditDetail}>
          <p className="text-sm">
            <strong>{day.title}</strong>
            {' · '}
            {day.called ?? 0} מסכים נבדקו מתוך {day.total_routes ?? 0}
            {typeof day.skipped_count === 'number' && day.skipped_count > 0
              ? ` · ${day.skipped_count} נבדקים דרך בדיקות האזור או חסרים נתוני דוגמה`
              : ''}
          </p>

          {(day.failures ?? []).length > 0 && (
            <div>
              <p className={styles.detailHead}>מסכים שנכשלו</p>
              {(day.failures ?? []).map((f) => (
                <div key={f.path} className={styles.row}>
                  <span className={styles.rowLabel} dir="ltr">/{f.path}</span>
                  <span className={styles.rowDetail}>{`${f.status ?? ''} ${f.error ?? ''}`.trim()}</span>
                </div>
              ))}
            </div>
          )}

          {(day.slow ?? []).length > 0 && (
            <div>
              <p className={styles.detailHead}>מסכים איטיים</p>
              {(day.slow ?? []).map((s) => (
                <div key={s.path} className={styles.row}>
                  <span className={styles.rowLabel} dir="ltr">/{s.path}</span>
                  <span className={styles.rowDetail}>{(s.ms / 1000).toFixed(1)} שניות</span>
                </div>
              ))}
            </div>
          )}

          {(day.probes ?? []).length > 0 && (
            <div>
              <p className={styles.detailHead}>בדיקות האזור</p>
              {(day.probes ?? []).map((p) => (
                <div key={p.name} className={styles.probe}>
                  <span className={`${styles.probeDot} ${styles[`dot_${p.severity}`]}`} aria-hidden />
                  <span>
                    <strong>{p.title}</strong> · {p.summary}
                    {p.rows.length > 0 && (
                      <span className={styles.probeRows}>
                        {p.rows.slice(0, 8).map((r) => `${r.label}${r.detail ? ` (${r.detail})` : ''}`).join(' · ')}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {day.verdict === 'green' && (day.failures ?? []).length === 0 && (
            <p className="text-sm text-emerald-800">כל המסכים ענו תקין, וכל בדיקות האזור עברו.</p>
          )}
        </div>
      )}
    </section>
  );
}
