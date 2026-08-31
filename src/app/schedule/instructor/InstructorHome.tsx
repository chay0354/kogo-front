'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FlaskConical,
  LogOut,
  MapPin,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { fetchLessons, formatDateISO, formatTime } from '@/lib/scheduleUtils';
import type { Lesson } from '@/types/schedule';
import InstructorAttendance from './InstructorAttendance';
import { INSTRUCTOR_MOTION_MS, resolveInstructorMotionDelay } from './instructorMotion';
import {
  findCurrentOrNextLessonId,
  isLessonNow,
  lessonTimeRange,
  lessonTitle,
  shortGroupLabel,
  hebrewDayTitle,
} from './instructorUtils';
import styles from './InstructorHome.module.css';

export default function InstructorHome() {
  const { logout } = useAuth();
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [branchId, setBranchId] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [openingLesson, setOpeningLesson] = useState<Lesson | null>(null);
  const [isClosingAttendance, setIsClosingAttendance] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const transitionLockRef = useRef(false);
  const returnTimerRef = useRef<number | null>(null);

  const dateIso = formatDateISO(selectedDate);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError('');
      try {
        const data = await fetchLessons({ start_date: dateIso, end_date: dateIso });
        if (cancelled) return;
        const sorted = [...data].sort((a, b) => a.start_time.localeCompare(b.start_time));
        setLessons(sorted);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setLessons([]);
        setError('שגיאה בטעינת השיעורים');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [dateIso]);

  useEffect(() => {
    setSelectedLesson(null);
    setOpeningLesson(null);
    setIsClosingAttendance(false);
    setIsReturning(false);
    transitionLockRef.current = false;
  }, [dateIso]);

  useEffect(() => () => {
    if (returnTimerRef.current !== null) {
      window.clearTimeout(returnTimerRef.current);
    }
  }, []);

  const branches = useMemo(() => {
    const map = new Map<string, string>();
    lessons.forEach((lesson) => {
      if (lesson.branch_id && lesson.branch_name) {
        map.set(lesson.branch_id, lesson.branch_name);
      }
    });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [lessons]);

  useEffect(() => {
    if (branchId !== 'all' && !branches.some((branch) => branch.id === branchId)) {
      setBranchId('all');
    }
  }, [branches, branchId]);

  const visibleLessons = useMemo(
    () => (branchId === 'all' ? lessons : lessons.filter((lesson) => lesson.branch_id === branchId)),
    [lessons, branchId],
  );

  const highlightId = useMemo(
    () => findCurrentOrNextLessonId(visibleLessons, selectedDate),
    [visibleLessons, selectedDate],
  );

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
      return;
    }
    const node = carouselRef.current?.querySelector('[data-current="true"]');
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }, [highlightId, visibleLessons.length]);

  const selectedBranchName =
    branches.find((branch) => branch.id === branchId)?.name ||
    branches[0]?.name ||
    'הסניף שלי';

  const motionDelay = (duration: number, mobileOnly = false) => {
    if (typeof window === 'undefined') return 0;
    return resolveInstructorMotionDelay({
      duration,
      reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      mobileOnly,
      isMobile: window.matchMedia('(max-width: 1023px)').matches,
    });
  };

  const waitForMotion = (duration: number, mobileOnly = false) => {
    const delay = motionDelay(duration, mobileOnly);
    if (delay === 0) return Promise.resolve();
    return new Promise<void>((resolve) => window.setTimeout(resolve, delay));
  };

  const handleLogout = async () => {
    if (transitionLockRef.current || isLeaving) return;
    transitionLockRef.current = true;
    setIsLeaving(true);
    try {
      await waitForMotion(INSTRUCTOR_MOTION_MS.logout);
      await logout();
      router.replace('/signin');
    } finally {
      transitionLockRef.current = false;
    }
  };

  const reload = async () => {
    try {
      const data = await fetchLessons({ start_date: dateIso, end_date: dateIso });
      setLessons([...data].sort((a, b) => a.start_time.localeCompare(b.start_time)));
    } catch (err) {
      console.error(err);
    }
  };

  const visualLesson = selectedLesson || openingLesson;

  const isSelected = (lesson: Lesson) =>
    visualLesson?.id === lesson.id && visualLesson.lesson_date === lesson.lesson_date;

  const openLesson = async (lesson: Lesson) => {
    if (transitionLockRef.current || isLeaving) return;
    transitionLockRef.current = true;
    setOpeningLesson(lesson);
    try {
      await waitForMotion(INSTRUCTOR_MOTION_MS.openLesson, true);
      setSelectedLesson(lesson);
    } finally {
      setOpeningLesson(null);
      transitionLockRef.current = false;
    }
  };

  const closeAttendance = async () => {
    if (transitionLockRef.current || !selectedLesson) return;
    transitionLockRef.current = true;
    setIsClosingAttendance(true);
    try {
      await waitForMotion(INSTRUCTOR_MOTION_MS.closeAttendance);
      setSelectedLesson(null);
      setIsClosingAttendance(false);
      setIsReturning(true);

      if (returnTimerRef.current !== null) {
        window.clearTimeout(returnTimerRef.current);
      }
      const returnDelay = motionDelay(INSTRUCTOR_MOTION_MS.returnHome);
      if (returnDelay === 0) {
        setIsReturning(false);
      } else {
        returnTimerRef.current = window.setTimeout(() => {
          setIsReturning(false);
          returnTimerRef.current = null;
        }, returnDelay);
      }
      void reload();
    } finally {
      transitionLockRef.current = false;
    }
  };

  return (
    <div className={styles.page} dir="rtl">
      <div
        className={`${styles.shell} ${selectedLesson ? styles.hasAttendance : ''} ${openingLesson ? styles.openingAttendance : ''} ${isReturning ? styles.returningFromAttendance : ''} ${isLeaving ? styles.shellLeaving : ''}`}
      >
        <header className={styles.header}>
          <div className={styles.topBar}>
            <div className={styles.branchWrap}>
              <MapPin size={18} />
              {branches.length > 1 ? (
                <>
                  <select
                    className={styles.branchSelect}
                    value={branchId}
                    onChange={(event) => setBranchId(event.target.value)}
                    aria-label="בחירת סניף"
                  >
                    <option value="all">כל הסניפים</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className={styles.branchChevron} size={16} />
                </>
              ) : (
                <span>{selectedBranchName}</span>
              )}
            </div>
            <div className={styles.topActions}>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={handleLogout}
                disabled={isLeaving}
                aria-label="התנתק"
              >
                <LogOut size={18} />
              </button>
              <label className={styles.iconBtn} title="בחירת תאריך">
                <Calendar size={18} />
                <input
                  type="date"
                  className={styles.hiddenDate}
                  value={dateIso}
                  onChange={(event) => {
                    if (!event.target.value) return;
                    setSelectedDate(new Date(`${event.target.value}T00:00:00`));
                  }}
                  aria-label="בחירת תאריך"
                />
              </label>
            </div>
          </div>

          <div className={styles.dayTitleWrap}>
            <div className={styles.dayTitle}>{hebrewDayTitle(selectedDate)}</div>
          </div>

          <div className={styles.carouselRow}>
            {visibleLessons.length > 1 && (
              <button
                type="button"
                className={styles.carouselArrow}
                onClick={() => carouselRef.current?.scrollBy({ left: 140, behavior: 'smooth' })}
                aria-label="הקודם"
              >
                <ChevronRight size={22} />
              </button>
            )}
            <div className={styles.carousel} ref={carouselRef}>
              {visibleLessons.map((lesson) => {
                const isCurrent = isLessonNow(lesson, selectedDate);
                const complete = Boolean(lesson.attendance_complete);
                const highlighted = highlightId === lesson.id;
                const selected = isSelected(lesson);
                const studentCount = lesson.student_count ?? lesson.enrollment_count;
                const trialStudentCount = lesson.trial_student_count ?? 0;
                return (
                  <div
                    key={`${lesson.id}-${lesson.lesson_date}`}
                    className={styles.slotWrap}
                    data-current={highlighted ? 'true' : undefined}
                  >
                    {isCurrent && <div className={styles.nowBadge}>עכשיו</div>}
                    <button
                      type="button"
                      className={`${styles.slot} ${highlighted ? styles.slotCurrent : ''} ${selected ? styles.slotSelected : ''}`}
                      onClick={() => openLesson(lesson)}
                    >
                      <div className={styles.slotTime}>{formatTime(lesson.start_time)}</div>
                      <div className={styles.slotGroup}>{shortGroupLabel(lesson)}</div>
                      <div className={styles.slotCounts} aria-label={`${studentCount} תלמידים, ${trialStudentCount} תלמידי ניסיון`}>
                        <span title="תלמידים">
                          <Users size={13} aria-hidden="true" />
                          {studentCount}
                        </span>
                        <span className={trialStudentCount > 0 ? styles.slotTrial : styles.slotTrialEmpty} title="תלמידי ניסיון">
                          <FlaskConical size={12} aria-hidden="true" />
                          {trialStudentCount}
                        </span>
                      </div>
                      <div className={`${styles.slotStatus} ${complete ? styles.ok : styles.miss}`}>
                        {complete ? <Check size={18} strokeWidth={3} /> : <X size={18} strokeWidth={3} />}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
            {visibleLessons.length > 1 && (
              <button
                type="button"
                className={styles.carouselArrow}
                onClick={() => carouselRef.current?.scrollBy({ left: -140, behavior: 'smooth' })}
                aria-label="הבא"
              >
                <ChevronLeft size={22} />
              </button>
            )}
          </div>

          <div className={styles.sectionLabel}>השיעורים היום</div>
        </header>

        <div className={styles.body}>
          <section className={styles.list}>
            {isLoading && <div className={styles.loading}>טוען שיעורים...</div>}
            {error && <div className={styles.error}>{error}</div>}
            {!isLoading && !error && visibleLessons.length === 0 && (
              <div className={styles.empty}>אין שיעורים ביום זה</div>
            )}
            {visibleLessons.map((lesson) => {
              const studentCount = lesson.student_count ?? lesson.enrollment_count;
              const trialStudentCount = lesson.trial_student_count ?? 0;
              return (
                <button
                  key={`${lesson.id}-${lesson.lesson_date}-row`}
                  type="button"
                  className={`${styles.card} ${lesson.status === 'cancelled' ? styles.cardCancelled : ''} ${isSelected(lesson) ? styles.cardSelected : ''}`}
                  onClick={() => openLesson(lesson)}
                >
                  <div className={styles.cardMain}>
                    <ChevronRight className={styles.cardChevron} size={22} strokeWidth={2.5} />
                    <div className={styles.cardText}>
                      <div className={styles.cardTitle}>{lessonTitle(lesson)}</div>
                      <div className={styles.cardMetaRow}>
                        <div className={styles.cardTime}>
                          <Clock size={14} />
                          <span>{lessonTimeRange(lesson)}</span>
                        </div>
                        <div className={styles.cardCounts} aria-label={`${studentCount} תלמידים, ${trialStudentCount} תלמידי ניסיון`}>
                          <span title="תלמידים">
                            <Users size={15} aria-hidden="true" />
                            {studentCount} תלמידים
                          </span>
                          <span className={trialStudentCount > 0 ? styles.trialCount : styles.trialCountEmpty} title="תלמידי ניסיון">
                            <FlaskConical size={14} aria-hidden="true" />
                            {trialStudentCount} ניסיון
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={styles.statusCol}>
                    {lesson.attendance_complete ? (
                      <Check className={styles.ok} size={26} strokeWidth={3} />
                    ) : (
                      <ChevronRight className={styles.cardChevron} size={22} strokeWidth={2.5} />
                    )}
                  </div>
                </button>
              );
            })}
          </section>

          <aside
            className={`${styles.attendancePane} ${isClosingAttendance ? styles.attendancePaneLeaving : ''}`}
            aria-label="נוכחות"
          >
            {selectedLesson ? (
              <InstructorAttendance
                key={`${selectedLesson.id}-${selectedLesson.lesson_date}`}
                embedded
                lesson={selectedLesson}
                onBack={closeAttendance}
              />
            ) : (
              <div className={styles.pickHint}>
                <p>בחרו שיעור מהרשימה כדי לסמן נוכחות</p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
