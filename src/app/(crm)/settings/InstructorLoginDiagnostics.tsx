'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';

interface MatchedInstructor {
  id: string;
  name: string;
  email: string;
  lessons: number;
}

interface Account {
  user_id: string;
  username: string;
  email: string;
  name: string;
  is_active: boolean;
  matched_instructors: MatchedInstructor[];
  visible_lessons: number;
  problem: string | null;
}

interface Orphan {
  id: string;
  name: string;
  email: string;
  lessons: number;
  problem: string;
}

interface Report {
  accounts: Account[];
  instructors_without_login: Orphan[];
  summary: {
    worker_accounts: number;
    with_problem: number;
    instructors_without_login: number;
  };
}

/**
 * Why an instructor sees an empty week.
 *
 * A worker's schedule is matched by comparing their login name against the
 * one stored on the instructor record. When the two drift apart the person
 * signs in perfectly well and sees nothing, with no error to go on. This puts
 * the mismatch in front of a manager instead of leaving them to guess.
 */
export default function InstructorLoginDiagnostics() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/instructors/login-diagnostics/');
      setReport(res.data as Report);
    } catch {
      setError('שגיאה בטעינת הבדיקה');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && !report && !loading) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const problems = (report?.accounts ?? []).filter((a) => a.problem);
  const healthy = (report?.accounts ?? []).filter((a) => !a.problem);

  return (
    <div className="card mt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">בדיקת גישת מדריכים ללוח השיעורים</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            מוצא מדריכים שנכנסים למערכת אך לא רואים את השיעורים שלהם.
          </p>
        </div>
        <Button variant="outline" onClick={() => setOpen((v) => !v)}>
          {open ? 'סגור' : 'הרץ בדיקה'}
        </Button>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          {loading && <p className="text-sm text-muted-foreground">בודק...</p>}
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {report && (
            <>
              <div className="flex flex-wrap gap-4 text-sm">
                <span>חשבונות מדריכים: <b>{report.summary.worker_accounts}</b></span>
                <span className={report.summary.with_problem ? 'text-destructive' : ''}>
                  עם בעיה: <b>{report.summary.with_problem}</b>
                </span>
                <span className={report.summary.instructors_without_login ? 'text-destructive' : ''}>
                  מדריכים ללא חשבון כניסה: <b>{report.summary.instructors_without_login}</b>
                </span>
                <button className="underline text-muted-foreground" onClick={() => void load()}>
                  רענן
                </button>
              </div>

              {problems.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-destructive">דורש טיפול</h3>
                  {problems.map((a) => (
                    <div key={a.user_id} className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                      <div className="font-medium">{a.name || a.username}</div>
                      <div className="text-xs text-muted-foreground">
                        כניסה: {a.username}
                        {a.email && a.email !== a.username ? ` · אימייל: ${a.email}` : ''}
                        {!a.is_active ? ' · חשבון מושבת' : ''}
                      </div>
                      <div className="mt-1 text-destructive">{a.problem}</div>
                      {a.matched_instructors.length > 0 && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          רשומות מדריך שנמצאו:{' '}
                          {a.matched_instructors
                            .map((i) => `${i.name} (${i.email || 'ללא שם משתמש'}, ${i.lessons} שיעורים)`)
                            .join(' · ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {report.instructors_without_login.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">רשומות מדריך ללא חשבון כניסה</h3>
                  {report.instructors_without_login.map((o) => (
                    <div key={o.id} className="rounded-lg border px-3 py-2 text-sm">
                      <div className="font-medium">{o.name}</div>
                      <div className="text-xs text-muted-foreground">
                        שם משתמש ברשומה: {o.email || '—'} · {o.lessons} שיעורים
                      </div>
                      <div className="mt-1 text-muted-foreground">{o.problem}</div>
                    </div>
                  ))}
                </div>
              )}

              {healthy.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm text-muted-foreground">
                    {healthy.length} מדריכים תקינים
                  </summary>
                  <div className="mt-2 space-y-1">
                    {healthy.map((a) => (
                      <div key={a.user_id} className="text-xs text-muted-foreground">
                        {a.name || a.username} — {a.visible_lessons} שיעורים
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {problems.length === 0 && report.instructors_without_login.length === 0 && (
                <p className="text-sm text-muted-foreground">כל המדריכים רואים את השיעורים שלהם.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
