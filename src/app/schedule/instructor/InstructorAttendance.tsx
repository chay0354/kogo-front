'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calendar, Check, ChevronDown, ChevronRight, Clock, Plus, X } from 'lucide-react';
import { fetchLessonDetail, formatTime, markAttendance } from '@/lib/scheduleUtils';
import type { AttendanceStatus, Lesson, LessonDetail } from '@/types/schedule';
import { hebrewDayLetter, lessonTitle } from './instructorUtils';
import styles from './InstructorAttendance.module.css';

const INITIAL_VISIBLE = 8;
const ISSUE_STATUSES = new Set(['payment_problem', 'not_paid', 'trial_signed', 'trial_completed']);

type InstructorAttendanceProps = {
  lesson: Lesson;
  onBack: () => void;
  embedded?: boolean;
};

export default function InstructorAttendance({ lesson, onBack, embedded = false }: InstructorAttendanceProps) {
  const [detail, setDetail] = useState<LessonDetail | null>(null);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [toast, setToast] = useState('');

  const occurrenceDate = lesson.lesson_date || '';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!occurrenceDate) {
        setError('חסר תאריך לשיעור');
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError('');
      try {
        const data = await fetchLessonDetail(lesson.id, occurrenceDate);
        if (cancelled) return;
        setDetail(data);
        const next: Record<string, AttendanceStatus> = {};
        data.attendance.forEach((record) => {
          const childId = record.child_id || record.child;
          if (childId) next[childId] = record.status;
        });
        setAttendance(next);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setError('שגיאה בטעינת רשימת הנוכחות');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [lesson.id, occurrenceDate]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const students = detail?.enrollments ?? [];
  const visibleStudents = expanded ? students : students.slice(0, INITIAL_VISIBLE);
  const hiddenCount = Math.max(0, students.length - INITIAL_VISIBLE);

  const lessonDate = useMemo(() => {
    if (!occurrenceDate) return new Date();
    return new Date(`${occurrenceDate}T00:00:00`);
  }, [occurrenceDate]);

  const isCancelled = (detail?.status || lesson.status) === 'cancelled';

  const handleToggle = async (childId: string, next: AttendanceStatus) => {
    if (isCancelled) return;
    const current = attendance[childId] || 'not_marked';
    const status = current === next ? 'not_marked' : next;
    const previous = current;
    setAttendance((prev) => ({ ...prev, [childId]: status }));
    try {
      await markAttendance(lesson.id, occurrenceDate, [{ child_id: childId, status }]);
    } catch (err) {
      console.error(err);
      setAttendance((prev) => ({ ...prev, [childId]: previous }));
      setToast('לא הצלחנו לשמור את הנוכחות');
    }
  };

  return (
    <div className={embedded ? styles.panel : styles.page} dir={embedded ? undefined : 'rtl'}>
      <div className={embedded ? styles.panelShell : styles.shell}>
        <header className={styles.header}>
          <button type="button" className={styles.backBtn} onClick={onBack} aria-label="חזרה">
            <ChevronRight size={26} />
          </button>
          <h1 className={styles.title}>רשימת נוכחות</h1>
          <div className={styles.infoBox}>
            <div className={styles.infoRow}>
              <Calendar className={styles.gold} size={16} />
              <span>{lesson.branch_name}</span>
            </div>
            <div className={styles.infoCourse}>{lessonTitle(lesson)}</div>
            <div className={styles.infoMeta}>
              <Clock className={styles.gold} size={16} />
              <span>
                יום {hebrewDayLetter(lessonDate)} {formatTime(lesson.start_time)}-{formatTime(lesson.end_time)}
              </span>
            </div>
          </div>
        </header>

        <section className={styles.list}>
          {isLoading && <div className={styles.loading}>טוען תלמידים...</div>}
          {error && <div className={styles.error}>{error}</div>}
          {isCancelled && <div className={styles.cancelled}>לא ניתן לסמן נוכחות בשיעור מבוטל</div>}
          {!isLoading && !error && students.length === 0 && (
            <div className={styles.empty}>אין תלמידים רשומים לשיעור זה</div>
          )}
          {visibleStudents.map((student, index) => {
            const status = attendance[student.child_id] || 'not_marked';
            const flagged = Boolean(student.is_trial) || ISSUE_STATUSES.has(student.child_status || '');
            return (
              <article
                key={student.id}
                className={`${styles.card} ${flagged ? styles.cardAlert : ''}`}
              >
                <div className={styles.cardTop}>
                  <div className={styles.index}>{index + 1}</div>
                  <div className={styles.identity}>
                    <div className={styles.name}>{student.child_name}</div>
                    <div className={styles.phone}>{student.child_phone || '—'}</div>
                  </div>
                </div>
                <div className={styles.toggle}>
                  <button
                    type="button"
                    className={status === 'present' ? styles.presentOn : ''}
                    disabled={isCancelled}
                    onClick={() => handleToggle(student.child_id, 'present')}
                    aria-label={`נוכח: ${student.child_name}`}
                    aria-pressed={status === 'present'}
                  >
                    <Check size={22} strokeWidth={3} />
                  </button>
                  <button
                    type="button"
                    className={status === 'absent' ? styles.absentOn : ''}
                    disabled={isCancelled}
                    onClick={() => handleToggle(student.child_id, 'absent')}
                    aria-label={`נעדר: ${student.child_name}`}
                    aria-pressed={status === 'absent'}
                  >
                    <X size={22} strokeWidth={3} />
                  </button>
                </div>
              </article>
            );
          })}
        </section>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.addBtn}
            onClick={() => setToast('להוספת תלמיד פנו למשרד')}
          >
            <Plus size={18} strokeWidth={3} />
            הוסף לקוח
          </button>
          {hiddenCount > 0 && !expanded ? (
            <button type="button" className={styles.moreBtn} onClick={() => setExpanded(true)}>
              <span>עוד {hiddenCount} ילדים</span>
              <ChevronDown size={18} />
            </button>
          ) : (
            <span />
          )}
        </footer>
      </div>
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
