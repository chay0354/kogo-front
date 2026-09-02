'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Check, ChevronDown, ChevronRight, Clock, MessageCircle, Phone, Plus, Sparkles, Trash2, X } from 'lucide-react';
import {
  addWalkInStudent,
  fetchLessonDetail,
  peekLessonDetail,
  formatTime,
  markAttendance,
  removeWalkInStudent,
} from '@/lib/scheduleUtils';
import type { AttendanceStatus, Lesson, LessonDetail } from '@/types/schedule';
import { hebrewDayLetter, lessonTitle } from './instructorUtils';
import styles from './InstructorAttendance.module.css';

const INITIAL_VISIBLE = 8;
const ISSUE_STATUSES = new Set(['payment_problem', 'not_paid', 'trial_signed', 'trial_completed']);

/**
 * The number in the form wa.me expects: country code, no plus, no separators.
 *
 * Numbers are stored as they were typed — 052-123-4567, +972 52 123 4567, and
 * everything between — so a local leading zero becomes 972 and anything already
 * carrying the country code is left alone.
 */
function whatsappNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
}

type InstructorAttendanceProps = {
  lesson: Lesson;
  onBack: () => void;
  embedded?: boolean;
  /** Set when this register belongs to a linked colleague, not the signed-in
   *  user. Every call about the lesson has to carry it or the server cannot
   *  reach the lesson at all. */
  asUser?: string;
  /** Hands up the way to close whichever of the register's own layers is open
   *  — the contact sheet, or the walk-in form — so the phone's back button
   *  closes that before it reaches the register underneath. Null when the
   *  register has nothing of its own open. */
  onOverlayChange?: (dismiss: (() => void) | null) => void;
};

export default function InstructorAttendance({
  lesson,
  onBack,
  embedded = false,
  asUser,
  onOverlayChange,
}: InstructorAttendanceProps) {
  const [detail, setDetail] = useState<LessonDetail | null>(null);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [toast, setToast] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ first_name: '', last_name: '', phone: '' });
  const [isAdding, setIsAdding] = useState(false);
  // The parent an instructor tapped, while the two ways to reach them are open.
  const [contact, setContact] = useState<{ name: string; phone: string } | null>(null);
  // The walk-in whose removal is waiting to be confirmed.
  const [removing, setRemoving] = useState<{ id: string; child_id: string; name: string } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const addFormRef = useRef<HTMLDivElement>(null);

  const occurrenceDate = lesson.lesson_date || '';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!occurrenceDate) {
        setError('חסר תאריך לשיעור');
        setIsLoading(false);
        return;
      }
      const applyDetail = (data: LessonDetail) => {
        setDetail(data);
        const next: Record<string, AttendanceStatus> = {};
        data.attendance.forEach((record) => {
          const childId = record.child_id || record.child;
          if (childId) next[childId] = record.status;
        });
        setAttendance(next);
      };
      // Paint the roster read with the day, then refresh it.
      const cached = peekLessonDetail(lesson.id, occurrenceDate, asUser);
      if (cached) {
        applyDetail(cached);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
      setError('');
      try {
        const data = await fetchLessonDetail(lesson.id, occurrenceDate, asUser);
        if (cancelled) return;
        applyDetail(data);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        if (!cached) setError('שגיאה בטעינת רשימת הנוכחות');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [lesson.id, occurrenceDate, asUser]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Nearest the instructor first: the confirm and the contact sheet are modals
  // over everything here, including the walk-in form, so they answer a back
  // press before it. A back press on the confirm cancels the removal, which is
  // what its own ביטול does.
  useEffect(() => {
    if (!onOverlayChange) return;
    if (removing) onOverlayChange(() => setRemoving(null));
    else if (contact) onOverlayChange(() => setContact(null));
    else if (addOpen) onOverlayChange(() => setAddOpen(false));
    else onOverlayChange(null);
    return () => onOverlayChange(null);
  }, [removing, contact, addOpen, onOverlayChange]);

  /* The form is revealed below a list that can be longer than the screen. The
     layout keeps it on screen on its own, but a short phone with a long header
     can still leave the last field under the fold, so pull it back into view
     rather than leaving the instructor to hunt for it. */
  useEffect(() => {
    if (!addOpen) return;
    const node = addFormRef.current;
    if (!node) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  }, [addOpen]);

  // Paying students first, trial students after them, walk-ins last — the
  // order an instructor calls the register in. Within a group the server's
  // order stands.
  const students = useMemo(() => {
    const rows = detail?.enrollments ?? [];
    const rank = (row: (typeof rows)[number]) =>
      row.child_status === 'ghost' ? 2 : row.is_trial ? 1 : 0;
    return rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index)
      .map(({ row }) => row);
  }, [detail?.enrollments]);
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
      await markAttendance(lesson.id, occurrenceDate, [{ child_id: childId, status }], asUser);
    } catch (err) {
      console.error(err);
      setAttendance((prev) => ({ ...prev, [childId]: previous }));
      setToast('לא הצלחנו לשמור את הנוכחות');
    }
  };

  /**
   * A child who turned up unregistered. Added to this lesson only, so the
   * instructor can mark them and the office can follow up — it is not a
   * registration, and the row fades out on its own after a few weeks.
   */
  const handleAddWalkIn = async () => {
    if (!addForm.first_name.trim() || !addForm.last_name.trim()) {
      setToast('נדרשים שם פרטי ושם משפחה');
      return;
    }
    setIsAdding(true);
    try {
      const added = await addWalkInStudent(
        lesson.id,
        occurrenceDate,
        {
          first_name: addForm.first_name.trim(),
          last_name: addForm.last_name.trim(),
          phone: addForm.phone.trim(),
        },
        asUser,
      );
      setDetail((prev) =>
        prev
          ? { ...prev, enrollments: [...prev.enrollments.filter((s) => s.id !== added.id), added] }
          : prev,
      );
      // The server marked them on the way in and says so, so the tick is drawn
      // from the answer already in hand rather than by asking for the register
      // again — one request, and the row lands finished.
      if (added.attendance_status) {
        setAttendance((prev) => ({ ...prev, [added.child_id]: added.attendance_status as AttendanceStatus }));
      }
      setExpanded(true);
      setAddForm({ first_name: '', last_name: '', phone: '' });
      setAddOpen(false);
    } catch (err) {
      console.error(err);
      setToast('לא הצלחנו להוסיף את התלמיד');
    } finally {
      setIsAdding(false);
    }
  };

  /**
   * Take back a walk-in that was added by mistake. Walk-ins only — the button
   * is drawn on no other row, and the server refuses anything that is not one.
   *
   * Asked for first: this cannot be undone, and the control sits on a screen
   * being tapped quickly in a room full of children.
   */
  const handleRemoveWalkIn = async () => {
    if (!removing) return;
    const target = removing;
    setIsRemoving(true);
    try {
      await removeWalkInStudent(lesson.id, target.id, asUser);
      setDetail((prev) =>
        prev ? { ...prev, enrollments: prev.enrollments.filter((s) => s.id !== target.id) } : prev,
      );
      setAttendance((prev) => {
        const next = { ...prev };
        delete next[target.child_id];
        return next;
      });
      setRemoving(null);
    } catch (err) {
      console.error(err);
      setToast('לא הצלחנו להסיר את התלמיד');
    } finally {
      setIsRemoving(false);
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
          {isLoading && (
            /* Skeleton rather than a "loading" line: the rows land in the same
               place the real ones will, so the list does not jump when it
               arrives. */
            <div className={styles.skeletonList} aria-busy="true" aria-label="טוען תלמידים">
              {Array.from({ length: 5 }).map((_, i) => (
                <div className={styles.skeletonRow} key={i} style={{ animationDelay: `${i * 80}ms` }}>
                  <span className={styles.skeletonAvatar} />
                  <span className={styles.skeletonText} />
                  <span className={styles.skeletonPill} />
                </div>
              ))}
            </div>
          )}
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
                    <div className={styles.name}>
                      {student.child_name}
                      {student.is_trial && student.child_status !== 'ghost' && (
                        <span className={styles.trialTag} title="שיעור ניסיון">
                          <Sparkles size={13} strokeWidth={2.4} aria-hidden />
                          ניסיון
                        </span>
                      )}
                      {student.child_status === 'ghost' && (
                        <span className={styles.walkInTag}>הגיע ללא רישום</span>
                      )}
                      {/* Only on a walk-in. A registered child belongs to the
                          office, and this screen offers no way to remove one. */}
                      {student.child_status === 'ghost' && (
                        <button
                          type="button"
                          className={styles.removeBtn}
                          onClick={() =>
                            setRemoving({
                              id: student.id,
                              child_id: student.child_id,
                              name: student.child_name,
                            })
                          }
                          aria-label={`הסרת ${student.child_name} מהרשימה`}
                        >
                          <Trash2 size={15} strokeWidth={2.4} />
                        </button>
                      )}
                    </div>
                    {student.child_phone ? (
                      <button
                        type="button"
                        className={styles.phoneBtn}
                        onClick={() =>
                          setContact({ name: student.child_name, phone: student.child_phone as string })
                        }
                        aria-label={`יצירת קשר עם ${student.child_name}`}
                      >
                        {student.child_phone}
                      </button>
                    ) : (
                      <div className={styles.phone}>—</div>
                    )}
                  </div>
                </div>
                <div className={styles.toggle}>
                  <button
                    type="button"
                    data-tour-mark className={status === 'present' ? styles.presentOn : ''}
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
          {/* At the end of the list it belongs to, where the names it reveals
              are about to appear. */}
          {hiddenCount > 0 && !expanded && (
            <button type="button" className={styles.moreBtn} onClick={() => setExpanded(true)}>
              <span>עוד {hiddenCount} ילדים</span>
              <ChevronDown size={18} />
            </button>
          )}
          {addOpen && (
            /* No autofocus anywhere in here: the instructor opens this while the
               children are still arriving, and a keyboard that springs up over
               the register hides the rows they are in the middle of marking. */
            <div className={styles.addForm} ref={addFormRef}>
              <div className={styles.addTitle}>הוספת תלמיד שהגיע</div>
              <p className={styles.addHint}>
                נרשם לשיעור הזה בלבד כדי שתוכלו לסמן נוכחות. המשרד ישלים את ההרשמה.
              </p>
              <div className={styles.addFields}>
                <label className={styles.addField}>
                  <span className={styles.addLabel}>שם פרטי</span>
                  <input
                    className={styles.addInput}
                    value={addForm.first_name}
                    onChange={(e) => setAddForm((p) => ({ ...p, first_name: e.target.value }))}
                  />
                </label>
                <label className={styles.addField}>
                  <span className={styles.addLabel}>שם משפחה</span>
                  <input
                    className={styles.addInput}
                    value={addForm.last_name}
                    onChange={(e) => setAddForm((p) => ({ ...p, last_name: e.target.value }))}
                  />
                </label>
                <label className={`${styles.addField} ${styles.addFieldWide}`}>
                  <span className={styles.addLabel}>
                    טלפון
                    <span className={styles.addOptional}>לא חובה</span>
                  </span>
                  <input
                    className={styles.addInput}
                    inputMode="tel"
                    value={addForm.phone}
                    onChange={(e) => setAddForm((p) => ({ ...p, phone: e.target.value }))}
                  />
                </label>
              </div>
              <div className={styles.addActions}>
                <button
                  type="button"
                  className={styles.addSave}
                  onClick={handleAddWalkIn}
                  disabled={isAdding}
                >
                  {isAdding ? 'מוסיף…' : 'הוסף'}
                </button>
                <button
                  type="button"
                  className={styles.addCancel}
                  onClick={() => setAddOpen(false)}
                  disabled={isAdding}
                >
                  ביטול
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Stands down while the form is open: the form pulls itself against the
            bottom of the list, and a button floating there would come down on
            the very actions it just revealed. The form closes on its own
            ביטול. */}
        {!addOpen && (
          <footer className={styles.footer} data-tour="add-student">
            <button
              type="button"
              className={styles.addBtn}
              onClick={() => setAddOpen(true)}
              disabled={isCancelled}
            >
              <Plus size={18} strokeWidth={3} />
              הוסף לקוח
            </button>
          </footer>
        )}
      </div>
      {contact && (
        <div
          className={styles.contactScrim}
          role="dialog"
          aria-modal="true"
          aria-label={`יצירת קשר עם ${contact.name}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setContact(null);
          }}
        >
          <div className={styles.contactBox}>
            <div className={styles.contactName}>{contact.name}</div>
            <div className={styles.contactPhone}>{contact.phone}</div>
            <div className={styles.contactActions}>
              {/* Opens WhatsApp with the conversation ready. It never sends
                  anything on its own — the instructor writes and sends. */}
              <a
                className={`${styles.contactAction} ${styles.contactWhatsapp}`}
                href={`https://wa.me/${whatsappNumber(contact.phone)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setContact(null)}
              >
                <MessageCircle size={26} strokeWidth={2.2} />
                <span>וואטסאפ</span>
              </a>
              <a
                className={`${styles.contactAction} ${styles.contactCall}`}
                href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}
                onClick={() => setContact(null)}
              >
                <Phone size={26} strokeWidth={2.2} />
                <span>שיחה</span>
              </a>
            </div>
            <button type="button" className={styles.contactCancel} onClick={() => setContact(null)}>
              ביטול
            </button>
          </div>
        </div>
      )}

      {removing && (
        <div
          className={styles.contactScrim}
          role="dialog"
          aria-modal="true"
          aria-label={`הסרת ${removing.name} מהרשימה`}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isRemoving) setRemoving(null);
          }}
        >
          <div className={styles.contactBox}>
            <div className={styles.contactName}>{removing.name}</div>
            <p className={styles.removeHint}>להסיר מרשימת השיעור? לא ניתן לבטל.</p>
            <div className={styles.removeActions}>
              <button
                type="button"
                className={styles.removeConfirm}
                onClick={handleRemoveWalkIn}
                disabled={isRemoving}
              >
                {isRemoving ? 'מסיר…' : 'הסר'}
              </button>
              <button
                type="button"
                className={styles.contactCancel}
                onClick={() => setRemoving(null)}
                disabled={isRemoving}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
