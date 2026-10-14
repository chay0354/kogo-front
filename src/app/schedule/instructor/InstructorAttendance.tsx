'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Check, ChevronDown, ChevronRight, Clock, History, Info, Phone, Plus, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import {
  addWalkInStudent,
  fetchLessonDetail,
  forgetMark,
  peekLessonDetail,
  rememberMark,
  formatTime,
  markAttendance,
  removeWalkInStudent,
  updateWalkInStudent,
} from '@/lib/scheduleUtils';
import ContactSheet from '@/components/ContactSheet';
import {
  isSessionLost,
  MarkRefusedError,
  SESSION_LOST_MESSAGE,
  SESSION_LOST_REDIRECT_MS,
} from '@/lib/attendanceMarks';
import type { AttendanceStatus, Lesson, LessonDetail } from '@/types/schedule';
import { hebrewDayLetter, lessonTitle } from './instructorUtils';
import { findSimilarChild, type RegisterChild } from './walkInMatch';
import styles from './InstructorAttendance.module.css';

const INITIAL_VISIBLE = 8;
const ISSUE_STATUSES = new Set(['payment_problem', 'trial_signed', 'trial_completed']);

type RegisterRow = LessonDetail['enrollments'][number];

/** The server's own Hebrew sentence for a refusal, when it sent one. */
function serverMessage(err: unknown): string {
  const data = (err as { response?: { data?: { error?: unknown } } })?.response?.data;
  return typeof data?.error === 'string' ? data.error : '';
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
  const router = useRouter();
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
  // Instructors meet this tag on a child they did not put there, and the word
  // alone explains nothing. Tapping it says what a ghost is and what to do.
  const [ghostInfo, setGhostInfo] = useState<RegisterRow | null>(null);
  // "הגיע בשיעור שעבר" tapped: this is the last lesson the walk-in is shown on.
  const [lastTimeInfo, setLastTimeInfo] = useState<RegisterRow | null>(null);
  // The walk-in whose phone is being filled in (owner, 14.10.2026).
  const [phoneFor, setPhoneFor] = useState<RegisterRow | null>(null);
  const [phoneDraft, setPhoneDraft] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  // "התכוונת לילד הזה?" — a registered child whose name is close to the one
  // typed, offered on the real register before a second child is made.
  const [suggest, setSuggest] = useState<RegisterChild | null>(null);
  // The name typed and the child the instructor already said it is not.
  const [notThisChild, setNotThisChild] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const addFormRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());

  const occurrenceDate = lesson.lesson_date || '';

  /**
   * Signed out — on this device or, far more often, the same account on
   * another one. Nothing on this screen can be saved until they sign in again,
   * so say that plainly and take them there, rather than a vague "could not
   * save" on every tap.
   */
  const signedOutElsewhere = () => {
    setToast(SESSION_LOST_MESSAGE);
    window.setTimeout(() => router.replace('/signin'), SESSION_LOST_REDIRECT_MS);
  };

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
        if (isSessionLost(err)) {
          setError(SESSION_LOST_MESSAGE);
          window.setTimeout(() => router.replace('/signin'), SESSION_LOST_REDIRECT_MS);
        } else if (!cached) {
          setError('שגיאה בטעינת רשימת הנוכחות');
        }
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
    else if (phoneFor) onOverlayChange(() => setPhoneFor(null));
    else if (lastTimeInfo) onOverlayChange(() => setLastTimeInfo(null));
    else if (ghostInfo) onOverlayChange(() => setGhostInfo(null));
    else if (suggest) onOverlayChange(() => rejectSuggestion());
    else if (contact) onOverlayChange(() => setContact(null));
    else if (addOpen) onOverlayChange(() => setAddOpen(false));
    else onOverlayChange(null);
    return () => onOverlayChange(null);
    // rejectSuggestion reads only setters and the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removing, phoneFor, lastTimeInfo, ghostInfo, suggest, contact, addOpen, onOverlayChange]);

  /* The child the typed name probably means is on the register already: bring
     its row to the middle of the screen, where the question waits on it. */
  useEffect(() => {
    if (!suggest) return;
    const node = rowRefs.current.get(suggest.child_id);
    if (!node) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  }, [suggest]);

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
    // Before the request, not after it: the refresh behind the painted register
    // may land while this is in flight, and must find the tap already there.
    rememberMark(lesson.id, occurrenceDate, asUser, childId, status);
    try {
      await markAttendance(lesson.id, occurrenceDate, [{ child_id: childId, status }], asUser);
    } catch (err) {
      console.error(err);
      forgetMark(lesson.id, occurrenceDate, asUser, childId, previous);
      setAttendance((prev) => ({ ...prev, [childId]: previous }));
      if (isSessionLost(err)) {
        signedOutElsewhere();
        return;
      }
      setToast(
        err instanceof MarkRefusedError
          ? `הסימון לא נשמר: ${err.message}`
          : 'לא הצלחנו לשמור את הנוכחות',
      );
    }
  };

  /**
   * A child who turned up unregistered. Added to this lesson only, so the
   * instructor can mark them and the office can follow up — it is not a
   * registration, and the row fades out on its own after a few weeks.
   */
  const typedKey = `${addForm.first_name.trim()} ${addForm.last_name.trim()}`;

  const handleAddWalkIn = async () => {
    if (!addForm.first_name.trim() || !addForm.last_name.trim()) {
      setToast('נדרשים שם פרטי ושם משפחה');
      return;
    }
    // A name close to a child already on this register: ask before making a
    // second child for one (owner, 14.10.2026).
    if (notThisChild !== typedKey) {
      const registered = students
        .filter((row) => row.child_status !== 'ghost' && row.attendee_kind !== 'external')
        .map((row) => ({ child_id: row.child_id, child_name: row.child_name }));
      const similar = findSimilarChild(addForm, registered);
      if (similar) {
        setSuggest(similar);
        setAddOpen(false);
        setExpanded(true);
        return;
      }
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
      setNotThisChild(null);
      setAddOpen(false);
    } catch (err) {
      console.error(err);
      if (isSessionLost(err)) signedOutElsewhere();
      else setToast(serverMessage(err) || 'לא הצלחנו להוסיף את התלמיד');
    } finally {
      setIsAdding(false);
    }
  };

  /** "כן, זה הוא": the child is on the register already — mark them, add nobody. */
  const acceptSuggestion = () => {
    if (!suggest) return;
    if ((attendance[suggest.child_id] || 'not_marked') !== 'present') {
      void handleToggle(suggest.child_id, 'present');
    }
    setToast(`סומן נוכח: ${suggest.child_name}`);
    setSuggest(null);
    setNotThisChild(null);
    setAddForm({ first_name: '', last_name: '', phone: '' });
  };

  /** "לא, ילד אחר": back to the form as it was, and this name is not asked about again. */
  const rejectSuggestion = () => {
    setSuggest(null);
    setNotThisChild(typedKey);
    setAddOpen(true);
  };

  const openPhone = (row: RegisterRow) => {
    setGhostInfo(null);
    setLastTimeInfo(null);
    setPhoneDraft('');
    setPhoneFor(row);
  };

  /** The walk-in's phone, filled in after it was added — it is no lead without one. */
  const handleSavePhone = async () => {
    if (!phoneFor) return;
    const digits = phoneDraft.replace(/\D/g, '');
    if (digits.length < 9) {
      setToast('מספר טלפון לא תקין');
      return;
    }
    setIsSavingPhone(true);
    try {
      const updated = await updateWalkInStudent(lesson.id, phoneFor.id, occurrenceDate, { phone: phoneDraft.trim() }, asUser);
      setDetail((prev) =>
        prev
          ? { ...prev, enrollments: prev.enrollments.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)) }
          : prev,
      );
      setToast('הטלפון נשמר');
      setPhoneFor(null);
    } catch (err) {
      console.error(err);
      if (isSessionLost(err)) signedOutElsewhere();
      else setToast(serverMessage(err) || 'לא הצלחנו לשמור את הטלפון');
    } finally {
      setIsSavingPhone(false);
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
      if (isSessionLost(err)) signedOutElsewhere();
      else setToast('לא הצלחנו להסיר את התלמיד');
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
                ref={(node) => {
                  if (node) rowRefs.current.set(student.child_id, node);
                  else rowRefs.current.delete(student.child_id);
                }}
                className={`${styles.card} ${flagged ? styles.cardAlert : ''} ${
                  suggest?.child_id === student.child_id ? styles.cardSuggested : ''
                }`}
              >
                <div className={styles.cardTop}>
                  <div className={styles.index}>{index + 1}</div>
                  <div className={styles.identity}>
                    <div className={styles.name}>
                      {student.child_name}
                      {student.is_trial && student.child_status !== 'ghost' && (
                        (student.trial_number ?? 1) > 1 ? (
                          <span
                            className={`${styles.trialTag} ${styles.trialTagRepeat}`}
                            title={`שיעור ניסיון ${student.trial_number} — הילד כבר היה בניסיון`}
                          >
                            <RotateCcw size={13} strokeWidth={2.4} aria-hidden />
                            ניסיון {student.trial_number}
                          </span>
                        ) : (
                          <span className={styles.trialTag} title="שיעור ניסיון">
                            <Sparkles size={13} strokeWidth={2.4} aria-hidden />
                            ניסיון
                          </span>
                        )
                      )}
                      {student.leaving && (
                        <span className={styles.trialTag} title="ביטל את החוג, ומגיע עד סוף החודש ששילם עליו">
                          עד סוף החודש
                        </span>
                      )}
                      {student.child_status === 'ghost' &&
                        (student.walk_in?.came_before ? (
                          <button
                            type="button"
                            className={`${styles.walkInTag} ${styles.walkInTagBefore}`}
                            onClick={() => setLastTimeInfo(student)}
                            aria-label="הגיע בשיעור שעבר — מה זה אומר"
                          >
                            <History size={12} strokeWidth={2.4} aria-hidden />
                            הגיע בשיעור שעבר
                            <Info size={12} strokeWidth={2.4} aria-hidden />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.walkInTag}
                            onClick={() => setGhostInfo(student)}
                            aria-label="תלמיד רפאים — למה הוא מופיע כאן"
                          >
                            תלמיד רפאים
                          </button>
                        ))}
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
                    ) : student.child_status === 'ghost' ? (
                      <button
                        type="button"
                        className={styles.phoneMissing}
                        onClick={() => openPhone(student)}
                        aria-label={`הוספת טלפון ל${student.child_name}`}
                      >
                        <Phone size={13} strokeWidth={2.4} aria-hidden />
                        חסר טלפון · הוספה
                      </button>
                    ) : (
                      <div className={styles.phone}>—</div>
                    )}
                  </div>
                </div>
                {suggest?.child_id === student.child_id && (
                  <div className={styles.suggest} role="alertdialog" aria-label="התכוונת לילד הזה?">
                    <div className={styles.suggestText}>התכוונת ל{student.child_name}?</div>
                    <div className={styles.suggestActions}>
                      <button type="button" className={styles.suggestYes} onClick={acceptSuggestion}>
                        כן, זה הוא
                      </button>
                      <button type="button" className={styles.suggestNo} onClick={rejectSuggestion}>
                        לא, ילד אחר
                      </button>
                    </div>
                  </div>
                )}
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
        <ContactSheet name={contact.name} phone={contact.phone} onClose={() => setContact(null)} />
      )}

      {ghostInfo && (
        <div
          className={styles.contactScrim}
          role="dialog"
          aria-modal="true"
          aria-label="תלמיד רפאים"
          onClick={(e) => {
            if (e.target === e.currentTarget) setGhostInfo(null);
          }}
        >
          <div className={styles.contactBox}>
            <div className={styles.contactName}>{ghostInfo.child_name}</div>
            <p className={styles.ghostHint}>
              הילד לא רשום לשיעור — הוסיפו אותו כאן כדי לסמן לו נוכחות. הוא לא נספר
              בקיבולת ולא מחויב בכלום.
            </p>
            <p className={styles.ghostHint}>
              הוא מופיע היום ובשיעור הבא. הגיע שוב? סמנו נוכח — והוא יישאר עוד שיעור.
            </p>
            <p className={styles.ghostHint}>
              {ghostInfo.walk_in?.phone_missing
                ? 'אין לו מספר טלפון: בלי טלפון הוא יימחק מהמערכת אחרי השיעור הבא. עם טלפון — המשרד יחזור אליו.'
                : 'יש לו מספר טלפון — המשרד יחזור אליו.'}
            </p>
            <div className={styles.removeActions}>
              {ghostInfo.walk_in?.phone_missing && (
                <button type="button" className={styles.phoneSave} onClick={() => openPhone(ghostInfo)}>
                  הוספת טלפון
                </button>
              )}
              <button
                type="button"
                className={styles.contactCancel}
                onClick={() => setGhostInfo(null)}
              >
                הבנתי
              </button>
            </div>
          </div>
        </div>
      )}

      {lastTimeInfo && (
        <div
          className={styles.contactScrim}
          role="dialog"
          aria-modal="true"
          aria-label="הגיע בשיעור שעבר"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLastTimeInfo(null);
          }}
        >
          <div className={styles.contactBox}>
            <div className={styles.lastTimeIcon} aria-hidden>
              <History size={22} strokeWidth={2.2} />
            </div>
            <div className={styles.contactName}>{lastTimeInfo.child_name}</div>
            <p className={styles.ghostHint}>
              <strong>זה השיעור האחרון שהוא מופיע ברשימה.</strong>
            </p>
            <p className={styles.ghostHint}>הגיע גם היום? סמנו נוכח — והוא יישאר לשיעור הבא.</p>
            {lastTimeInfo.walk_in?.phone_missing && (
              <p className={styles.ghostHint}>אין לו מספר טלפון: בלי טלפון הוא יימחק מהמערכת אחרי השיעור הזה.</p>
            )}
            <div className={styles.removeActions}>
              {lastTimeInfo.walk_in?.phone_missing && (
                <button type="button" className={styles.phoneSave} onClick={() => openPhone(lastTimeInfo)}>
                  הוספת טלפון
                </button>
              )}
              <button type="button" className={styles.contactCancel} onClick={() => setLastTimeInfo(null)}>
                הבנתי
              </button>
            </div>
          </div>
        </div>
      )}

      {phoneFor && (
        <div
          className={styles.contactScrim}
          role="dialog"
          aria-modal="true"
          aria-label={`טלפון של ${phoneFor.child_name}`}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSavingPhone) setPhoneFor(null);
          }}
        >
          <div className={styles.contactBox}>
            <div className={styles.contactName}>{phoneFor.child_name}</div>
            <p className={styles.removeHint}>הטלפון של ההורה — כדי שהמשרד יוכל לחזור אליהם</p>
            <input
              className={styles.addInput}
              inputMode="tel"
              dir="ltr"
              autoFocus
              placeholder="05X-XXXXXXX"
              aria-label="מספר טלפון"
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSavePhone();
              }}
            />
            <div className={`${styles.removeActions} ${styles.phoneActions}`}>
              <button type="button" className={styles.phoneSave} onClick={handleSavePhone} disabled={isSavingPhone}>
                {isSavingPhone ? 'שומר…' : 'שמירה'}
              </button>
              <button
                type="button"
                className={styles.contactCancel}
                onClick={() => setPhoneFor(null)}
                disabled={isSavingPhone}
              >
                ביטול
              </button>
            </div>
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
