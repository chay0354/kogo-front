'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, FileSpreadsheet, Upload, X } from 'lucide-react';
import dialogMotion from '@/components/ui/motion.module.css';
import { useDialogExit } from '@/components/ui/motion';
import {
  applyRosterImport,
  discardRosterImport,
  fetchRosterImport,
  fetchRosterReview,
  parseNextGroup,
  updateRosterRow,
  updateRosterUnit,
  uploadRoster,
} from '@/lib/rosterImports';
import type { RosterImport, RosterUnit } from '@/types/rosterImport';
import type { Lesson } from '@/types/course';
import { STEPS, stepStatus, type StepId } from './steps';
import styles from './index.module.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  branchId: string;
  lessons: Lesson[];
  /** An import already in progress, to pick up where it was left. */
  resumeImportId?: string | null;
}

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Upload a municipality sheet, watch it being read, then decide.
 *
 * Reading is driven from here one group at a time. That is what keeps each
 * request short enough to survive a function timeout, and it is why the
 * progress bar can show something true instead of a spinner over a silent
 * server. If this dialog is closed halfway the import is not lost — a sweeper
 * finishes it, and it is waiting in review next time.
 *
 * Nothing is written until the last step, and the button there carries the
 * fingerprint of exactly what was on screen: if a colleague changed the roster
 * in between, the apply stops rather than acting on a stale picture.
 */
export default function RosterImportDialog({
  isOpen, onClose: dismiss, onSuccess, branchId, lessons, resumeImportId,
}: Props) {
  const { closing, requestClose } = useDialogExit(dismiss);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);

  const [step, setStep] = useState<StepId>('upload');
  const [roster, setRoster] = useState<RosterImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [bulkOk, setBulkOk] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    cancelled.current = false;
    setStep('upload');
    setRoster(null);
    setError(null);
    setConfirmed(false);
    setBulkOk([]);

    // Picking up an import that outlived the window it started in. Anything
    // still unread is finished here; anything already read goes straight to
    // the decision.
    if (!resumeImportId) return;
    let live = true;
    (async () => {
      setBusy(true);
      setStep('reading');
      try {
        let current = await fetchRosterImport(resumeImportId);
        if (live) setRoster(current);
        while (live && !cancelled.current && current.units_done < current.units_total) {
          const next = await parseNextGroup(current.id);
          if (next.units_done === current.units_done) break;
          current = next;
          if (live) setRoster(current);
        }
        if (live && !cancelled.current) {
          setRoster(await fetchRosterReview(current.id));
          setStep('review');
        }
      } catch {
        if (live) {
          setError('לא הצלחנו לפתוח את הייבוא שנשמר');
          setStep('upload');
        }
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => { live = false; };
  }, [isOpen, resumeImportId]);

  const lessonById = useMemo(
    () => new Map(lessons.map((lesson) => [lesson.id, lesson])),
    [lessons],
  );

  /** Reading is never interrupted by a stray click on the backdrop. */
  const close = () => {
    if (step === 'reading' && busy) return;
    cancelled.current = true;
    requestClose();
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared straight away so picking the same file again still fires.
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError('הקובץ גדול מדי. ניתן להעלות עד 8MB');
      return;
    }

    setBusy(true);
    setError(null);
    setStep('reading');
    try {
      let current = await uploadRoster(branchId, file);
      setRoster(current);
      // One group per request until the server says there are no more.
      while (!cancelled.current && current.units_done < current.units_total) {
        const next = await parseNextGroup(current.id);
        if (next.units_done === current.units_done) break;   // nothing moved; stop asking
        current = next;
        setRoster(current);
      }
      if (!cancelled.current) {
        setRoster(await fetchRosterReview(current.id));
        setStep('review');
      }
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: string } } }).response?.data;
      setError(data?.error || 'לא הצלחנו לקרוא את הקובץ');
      setStep('upload');
    } finally {
      setBusy(false);
    }
  };

  const refreshReview = async (next: RosterImport) => {
    setRoster(await fetchRosterReview(next.id));
  };

  const chooseLesson = async (unit: RosterUnit, lessonIds: string[]) => {
    if (!roster) return;
    setBusy(true);
    try {
      await updateRosterUnit(roster.id, unit.id, { lesson_ids: lessonIds });
      await refreshReview(roster);
    } finally {
      setBusy(false);
    }
  };

  const skipUnit = async (unit: RosterUnit) => {
    if (!roster) return;
    setBusy(true);
    try {
      await updateRosterUnit(roster.id, unit.id, { status: 'skipped' });
      await refreshReview(roster);
    } finally {
      setBusy(false);
    }
  };

  const toggleRow = async (rowId: string, action: string) => {
    if (!roster) return;
    await updateRosterRow(roster.id, rowId, { action });
    await refreshReview(roster);
  };

  const apply = async () => {
    if (!roster?.diff_digest) return;
    setBusy(true);
    setError(null);
    try {
      const done = await applyRosterImport(roster.id, {
        expected_digest: roster.diff_digest,
        confirmed_bulk_lessons: bulkOk,
      });
      setRoster(done);
      setStep('done');
      onSuccess();
    } catch (err: unknown) {
      const response = (err as { response?: { status?: number; data?: RosterImport & { error?: string } } }).response;
      if (response?.status === 409 && response.data) {
        setRoster(response.data);
        setConfirmed(false);
        setError('הרשימה השתנתה מאז הבדיקה. עברו עליה שוב לפני האישור.');
      } else {
        setError(response?.data?.error || 'ההחלה נכשלה');
      }
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (roster && roster.status !== 'applied') {
      try {
        await discardRosterImport(roster.id);
      } catch {
        // Throwing it away is best-effort; the sweeper closes it out anyway.
      }
    }
    close();
  };

  if (!isOpen) return null;

  const blocking = roster?.blocking_units ?? [];
  const bulkNeeded = roster?.bulk_removal_lessons ?? [];
  const bulkPending = bulkNeeded.filter((id) => !bulkOk.includes(id));
  const canApply =
    Boolean(roster?.diff_digest) && confirmed && !busy
    && blocking.length === 0 && bulkPending.length === 0;

  return (
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 ${dialogMotion.overlay} ${closing ? dialogMotion.overlayClosing : ''}`}
      dir="rtl"
    >
      <div className={`bg-background rounded-lg shadow-xl max-w-3xl w-full max-h-[92vh] overflow-y-auto ${dialogMotion.panel} ${closing ? dialogMotion.panelClosing : ''}`}>
        <div className={styles.header}>
          <h2 className={styles.title}>ייבוא רשימת עירייה</h2>
          {!(step === 'reading' && busy) && (
            <button onClick={close} className={styles.iconButton} aria-label="סגירה">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <ol className={styles.stepper}>
          {STEPS.map((definition, index) => {
            const state = stepStatus(definition.id, step);
            return (
              <li key={definition.id} className={`${styles.step} ${styles[state]}`}>
                <span className={styles.stepMark}>
                  {state === 'completed' ? <Check className="w-3.5 h-3.5" /> : index + 1}
                </span>
                <span>{definition.label}</span>
              </li>
            );
          })}
        </ol>

        <div className={styles.body}>
          {error && <div className={styles.error}>{error}</div>}

          {step === 'upload' && (
            <div className={styles.upload}>
              <FileSpreadsheet className="w-10 h-10" />
              <p className={styles.uploadTitle}>העלו את הרשימה שהתקבלה מהעירייה</p>
              <p className={styles.uploadHint}>
                קובץ אקסל או PDF סרוק. המערכת תקרא את הקבוצות והשמות ותציג לכם מה היא מצאה
                לפני שמשהו נשמר.
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xlsm,.pdf"
                className="hidden"
                onChange={handleFile}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className={styles.primaryButton}
              >
                <Upload className="w-4 h-4" />
                בחירת קובץ
              </button>
              <p className={styles.privacy}>
                תעודות זהות שמופיעות בקובץ אינן נשמרות במערכת בשום שלב.
              </p>
            </div>
          )}

          {step === 'reading' && roster && (
            <div className={styles.reading}>
              <p className={styles.readingTitle}>
                קוראים את {roster.original_filename}
              </p>
              <div className={styles.bar}>
                <span
                  className={styles.barFill}
                  style={{
                    width: `${roster.units_total ? (roster.units_done / roster.units_total) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className={styles.readingCount}>
                {roster.units_done} מתוך {roster.units_total} קבוצות
              </p>
              <p className={styles.uploadHint}>
                אפשר להשאיר את החלון פתוח. אם ייסגר באמצע, הקריאה תושלם לבד ותמתין לכם כאן.
              </p>
            </div>
          )}

          {step === 'review' && roster && (
            <ReviewStage
              roster={roster}
              lessonById={lessonById}
              bulkOk={bulkOk}
              onBulkOk={setBulkOk}
              onChooseLesson={chooseLesson}
              onSkipUnit={skipUnit}
              onToggleRow={toggleRow}
            />
          )}

          {step === 'done' && roster && (
            <div className={styles.done}>
              <div className={styles.doneIcon}>✓</div>
              <p className={styles.doneTitle}>הרשימה עודכנה</p>
              <p className={styles.uploadHint}>
                נוספו {roster.result?.added ?? 0} · הוסרו {roster.result?.removed ?? 0} ·
                ללא שינוי {roster.result?.kept ?? 0}
              </p>
            </div>
          )}
        </div>

        {step === 'review' && roster && (
          <div className={styles.footer}>
            {blocking.length > 0 && (
              <p className={styles.blocker}>
                יש {blocking.length} קבוצות שטרם נקראו או שנכשלו. השלימו אותן או דלגו עליהן.
              </p>
            )}
            <label className={styles.confirm}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                בדקתי את הרשימה. יתווספו {roster.summary.add}, יוסרו {roster.summary.remove}.
              </span>
            </label>
            <div className={styles.footerActions}>
              <button type="button" onClick={discard} className={styles.secondaryButton}>
                ביטול הייבוא
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={!canApply}
                className={styles.primaryButton}
              >
                {busy ? 'מחיל…' : 'אישור והחלה'}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className={styles.footer}>
            <div className={styles.footerActions}>
              <button type="button" onClick={close} className={styles.primaryButton}>
                סגירה
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The middle stage: what was read, what it means, and what it would change. */
function ReviewStage({
  roster, lessonById, bulkOk, onBulkOk, onChooseLesson, onSkipUnit, onToggleRow,
}: {
  roster: RosterImport;
  lessonById: Map<string, Lesson>;
  bulkOk: string[];
  onBulkOk: (ids: string[]) => void;
  onChooseLesson: (unit: RosterUnit, lessonIds: string[]) => void;
  onSkipUnit: (unit: RosterUnit) => void;
  onToggleRow: (rowId: string, action: string) => void;
}) {
  const bulkNeeded = roster.bulk_removal_lessons ?? [];

  return (
    <div className={styles.review}>
      <div className={styles.summary}>
        <span className={styles.pillAdd}>יתווספו {roster.summary.add}</span>
        <span className={styles.pillKeep}>ללא שינוי {roster.summary.keep}</span>
        <span className={styles.pillRemove}>יוסרו {roster.summary.remove}</span>
        {!roster.summary.matches_stated_total && (
          <span className={styles.pillWarn}>
            הקובץ מצהיר על {roster.stated_report_total}, נקראו {roster.summary.read_total}
          </span>
        )}
      </div>

      {bulkNeeded.length > 0 && (
        <div className={styles.bulk}>
          <AlertTriangle className="w-4 h-4" />
          <div>
            <p className={styles.bulkTitle}>
              יש שיעורים שמאבדים את רוב הרשימה שלהם
            </p>
            <p className={styles.uploadHint}>
              כך נראה גם קובץ חלקי או קריאה שגויה. אשרו לכל שיעור בנפרד.
            </p>
            {bulkNeeded.map((lessonId) => {
              const lesson = lessonById.get(lessonId);
              return (
                <label key={lessonId} className={styles.confirm}>
                  <input
                    type="checkbox"
                    checked={bulkOk.includes(lessonId)}
                    onChange={(e) =>
                      onBulkOk(
                        e.target.checked
                          ? [...bulkOk, lessonId]
                          : bulkOk.filter((id) => id !== lessonId),
                      )
                    }
                  />
                  <span>
                    {lesson
                      ? `${(lesson as { course_name?: string }).course_name ?? ''} · יום ${DAYS[lesson.day_of_week]} ${(lesson.start_time || '').slice(0, 5)}`
                      : 'שיעור'}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {roster.units.map((unit) => (
        <section key={unit.id} className={styles.unit}>
          <header className={styles.unitHead}>
            <div>
              <span className={styles.unitName}>
                {unit.group_name || unit.municipality_code || `קבוצה ${unit.ordinal}`}
              </span>
              <span className={styles.unitSlots}>{unit.slots_raw}</span>
            </div>
            <span className={styles.unitCounts}>
              +{unit.counts.add} · ={unit.counts.keep} · −{unit.counts.remove}
            </span>
          </header>

          {unit.status === 'skipped' && (
            <p className={styles.uploadHint}>הקבוצה דולגה ולא תיכנס לרשימה.</p>
          )}

          {unit.status === 'failed' && (
            <p className={styles.error}>
              {unit.error || 'לא הצלחנו לקרוא את הקבוצה'}
              <button type="button" onClick={() => onSkipUnit(unit)} className={styles.linkButton}>
                דלגו עליה
              </button>
            </p>
          )}

          {unit.status === 'mismatch' && (
            <p className={styles.warn}>
              הקובץ מצהיר על {unit.stated_total} משתתפים, נקראו {unit.read_total}.
            </p>
          )}

          {(unit.match_state === 'ambiguous' || unit.match_state === 'none') && (
            <div className={styles.picker}>
              <p className={styles.pickerTitle}>
                {unit.match_state === 'none'
                  ? 'לא מצאנו שיעור מתאים. בחרו אחד:'
                  : 'יותר משיעור אחד מתאים לשעה הזאת. בחרו:'}
              </p>
              <div className={styles.pickerOptions}>
                {(unit.candidates.length ? unit.candidates : []).map((candidate) => (
                  <button
                    key={candidate.lesson_id}
                    type="button"
                    onClick={() => onChooseLesson(unit, [candidate.lesson_id])}
                    className={styles.pickerOption}
                  >
                    {candidate.course_name} · יום {DAYS[candidate.day_of_week]} {candidate.start_time}
                  </button>
                ))}
                <button type="button" onClick={() => onSkipUnit(unit)} className={styles.linkButton}>
                  דילוג על הקבוצה
                </button>
              </div>
            </div>
          )}

          {unit.rows.length > 0 && (
            <ul className={styles.rows}>
              {unit.rows.map((row) => (
                <li key={row.id} className={`${styles.row} ${styles[row.action]}`}>
                  <span className={styles.rowName}>{row.full_name}</span>
                  <span className={styles.rowPhone}>{row.phone || '—'}</span>
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() =>
                      onToggleRow(row.id, row.action === 'remove' ? 'keep' : 'remove')
                    }
                  >
                    {row.action === 'add' ? 'יתווסף' : row.action === 'keep' ? 'קיים' : 'יוסר'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
