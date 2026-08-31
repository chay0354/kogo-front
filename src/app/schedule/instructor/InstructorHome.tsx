'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FlaskConical,
  LogOut,
  MapPin,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { fetchLessons, formatDateISO, formatTime } from '@/lib/scheduleUtils';
import { fetchLinkedUsers, fetchMyBranches, type LinkedUser } from '@/lib/api';
import type { Lesson } from '@/types/schedule';
import InstructorAttendance from './InstructorAttendance';
import InstructorDashboard from './InstructorDashboard';
import { INSTRUCTOR_MOTION_MS, resolveInstructorMotionDelay } from './instructorMotion';
import GuidedTour from '@/components/onboarding/GuidedTour';
import {
  findCurrentOrNextLessonId,
  isLessonNow,
  lessonTimeRange,
  lessonTitle,
  shortGroupLabel,
  hebrewDayTitle,
} from './instructorUtils';
import styles from './InstructorHome.module.css';

/** How far either side of the shown day the tour looks for a real lesson. */
const TOUR_LESSON_SEARCH_DAYS = 14;

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
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [pendingLesson, setPendingLesson] = useState<{ id: string; date: string } | null>(null);
  // Colleagues this account was linked to by a manager. Almost always empty,
  // and the switcher only appears when it is not.
  const [linkedUsers, setLinkedUsers] = useState<LinkedUser[]>([]);
  const [viewAs, setViewAs] = useState('self');
  const [teacherPickerOpen, setTeacherPickerOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const transitionLockRef = useRef(false);
  const returnTimerRef = useRef<number | null>(null);
  // The day the tour started on, while it is borrowing another one.
  const tourOriginalDateRef = useRef<Date | null>(null);
  // Set while the tour is waiting for a lesson to become available to open.
  const tourWantsLessonRef = useRef(false);

  const dateIso = formatDateISO(selectedDate);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError('');
      try {
        const data = await fetchLessons({
          start_date: dateIso,
          end_date: dateIso,
          as_user: viewAs === 'self' ? undefined : viewAs,
        });
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
  }, [dateIso, viewAs]);

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

  // Branches the instructor is actually assigned to, from the server. Deriving
  // them from today's lessons hid any branch that happened to be quiet today,
  // which is exactly when someone needs to switch to it.
  const [assignedBranches, setAssignedBranches] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    fetchLinkedUsers()
      .then((res) => {
        if (!cancelled) setLinkedUsers(res.linked_users ?? []);
      })
      .catch(() => {
        /* no links, or the endpoint is unavailable — the switcher stays hidden */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchMyBranches()
      .then((list) => {
        if (!cancelled) setAssignedBranches(list.map((b) => ({ id: b.id, name: b.name })));
      })
      .catch(() => {
        /* falls back to the branches seen in today's lessons */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const branches = useMemo(() => {
    const map = new Map<string, string>();
    // Assignments first so the order is stable regardless of today's schedule.
    assignedBranches.forEach((b) => map.set(b.id, b.name));
    lessons.forEach((lesson) => {
      if (lesson.branch_id && lesson.branch_name) {
        map.set(lesson.branch_id, lesson.branch_name);
      }
    });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [assignedBranches, lessons]);

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
      const data = await fetchLessons({
        start_date: dateIso,
        end_date: dateIso,
        as_user: viewAs === 'self' ? undefined : viewAs,
      });
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

  /**
   * Jump from the dashboard to a lesson on another day. The day has to load
   * first, so the id is parked and an effect opens it once that day's lessons
   * arrive.
   */
  const openLessonFromDashboard = (lessonId: string, date: string) => {
    setDashboardOpen(false);
    setPendingLesson({ id: lessonId, date });
    setSelectedDate(new Date(`${date}T00:00:00`));
  };

  useEffect(() => {
    if (!pendingLesson || isLoading) return;
    if (dateIso !== pendingLesson.date) return;
    const match = lessons.find((l) => l.id === pendingLesson.id);
    setPendingLesson(null);
    if (match) void openLesson(match);
    // openLesson is stable enough for this one-shot handoff; re-running on it
    // would reopen the lesson every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLesson, lessons, isLoading, dateIso]);

  // Whenever the tour is waiting for a lesson and one is on screen, open it.
  // Tying this to an id handed over before the day reloaded was fragile: the
  // day's request had to land in exactly the right order for it to fire.
  useEffect(() => {
    if (!tourWantsLessonRef.current) return;
    if (isLoading || selectedLesson || openingLesson) return;
    const first = visibleLessons[0];
    if (first) void openLesson(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleLessons, isLoading, selectedLesson, openingLesson]);

  // The tour lights up controls that live inside a lesson, so it asks the
  // screen to open one for those steps and to close it afterwards.
  //
  // A new instructor often signs in on a day they do not teach. Rather than
  // showing those steps against an empty screen — or inventing a lesson — the
  // tour borrows the nearest real one from their own timetable and puts the day
  // back when it moves on.
  useEffect(() => {
    const openForTour = async () => {
      tourWantsLessonRef.current = true;
      if (selectedLesson || openingLesson) return;

      const first = visibleLessons[0];
      if (first) {
        void openLesson(first);
        return;
      }

      const asUser = viewAs === 'self' ? undefined : viewAs;
      const from = new Date(selectedDate);
      from.setDate(from.getDate() - TOUR_LESSON_SEARCH_DAYS);
      const to = new Date(selectedDate);
      to.setDate(to.getDate() + TOUR_LESSON_SEARCH_DAYS);

      try {
        const nearby = await fetchLessons({
          start_date: formatDateISO(from),
          end_date: formatDateISO(to),
          as_user: asUser,
        });
        const dated = nearby.filter((l) => l.lesson_date);
        if (!dated.length) return; // genuinely nothing to show; the card centres

        const anchor = selectedDate.getTime();
        const nearest = dated.reduce((best, l) => {
          const gap = Math.abs(new Date(`${l.lesson_date}T00:00:00`).getTime() - anchor);
          const bestGap = Math.abs(new Date(`${best.lesson_date}T00:00:00`).getTime() - anchor);
          return gap < bestGap ? l : best;
        });

        if (tourOriginalDateRef.current === null) {
          tourOriginalDateRef.current = selectedDate;
        }
        // The effect above opens whatever lands on that day.
        setSelectedDate(new Date(`${nearest.lesson_date}T00:00:00`));
      } catch {
        /* the step falls back to a centred card */
      }
    };

    const closeForTour = () => {
      tourWantsLessonRef.current = false;
      setSelectedLesson(null);
      setOpeningLesson(null);
      setPendingLesson(null);
      transitionLockRef.current = false;
      // Put the day back if the tour moved it to find a lesson.
      if (tourOriginalDateRef.current !== null) {
        const original = tourOriginalDateRef.current;
        tourOriginalDateRef.current = null;
        setSelectedDate(original);
      }
    };

    window.addEventListener('kogo:tour-open-lesson', openForTour);
    window.addEventListener('kogo:tour-close-lesson', closeForTour);
    return () => {
      window.removeEventListener('kogo:tour-open-lesson', openForTour);
      window.removeEventListener('kogo:tour-close-lesson', closeForTour);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleLessons, selectedLesson, openingLesson, selectedDate, viewAs]);

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
      <GuidedTour />

      {/* The instructor's own numbers. Hidden while attendance is open so it
          never covers the mark buttons. */}
      {!selectedLesson && (
        <button
          type="button"
          className={styles.dashFab}
          onClick={() => setDashboardOpen(true)}
          aria-label="הנתונים שלי"
          data-tour="dashboard"
        >
          <BarChart3 size={24} strokeWidth={2.6} />
        </button>
      )}

      {/* Only for an account a manager linked to colleagues. Mirrored to the
          left so it never sits under the data button. */}
      {!selectedLesson && linkedUsers.length > 0 && (
        <button
          type="button"
          className={styles.teacherFab}
          onClick={() => setTeacherPickerOpen((v) => !v)}
          aria-label="החלפת מדריך"
          aria-expanded={teacherPickerOpen}
        >
          <UserRound size={24} strokeWidth={2.4} />
          {viewAs !== 'self' && <span className={styles.teacherFabDot} />}
        </button>
      )}

      {teacherPickerOpen && (
        <>
          <div className={styles.pickerScrim} onClick={() => setTeacherPickerOpen(false)} />
          <div className={styles.picker} role="menu" aria-label="בחירת מדריך">
            <div className={styles.pickerTitle}>יומן להצגה</div>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={viewAs === 'self'}
              className={`${styles.pickerItem} ${viewAs === 'self' ? styles.pickerItemOn : ''}`}
              onClick={() => {
                setViewAs('self');
                setTeacherPickerOpen(false);
              }}
            >
              היומן שלי
            </button>
            {linkedUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                role="menuitemradio"
                aria-checked={viewAs === u.id}
                className={`${styles.pickerItem} ${viewAs === u.id ? styles.pickerItemOn : ''}`}
                onClick={() => {
                  setViewAs(u.id);
                  setTeacherPickerOpen(false);
                }}
              >
                {u.name}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Signing out mid-lesson loses the register you were filling, and the
          button sits next to the date picker — so it asks first. */}
      {confirmLogout && (
        <div
          className={styles.confirmScrim}
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmLogout(false);
          }}
        >
          <div className={styles.confirmBox}>
            <div className={styles.confirmIcon} aria-hidden>
              <LogOut size={22} />
            </div>
            <h2 id="logout-title" className={styles.confirmTitle}>
              לצאת מהמערכת?
            </h2>
            <p className={styles.confirmBody}>תצטרכו להתחבר מחדש בפעם הבאה.</p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmGo}
                onClick={() => {
                  setConfirmLogout(false);
                  void handleLogout();
                }}
                disabled={isLeaving}
              >
                {isLeaving ? 'יוצא…' : 'כן, צא'}
              </button>
              <button
                type="button"
                className={styles.confirmStay}
                onClick={() => setConfirmLogout(false)}
                autoFocus
              >
                הישאר
              </button>
            </div>
          </div>
        </div>
      )}

      {dashboardOpen && (
        <InstructorDashboard
          onClose={() => setDashboardOpen(false)}
          onOpenLesson={openLessonFromDashboard}
        />
      )}

      <div
        className={`${styles.shell} ${selectedLesson ? styles.hasAttendance : ''} ${openingLesson ? styles.openingAttendance : ''} ${isReturning ? styles.returningFromAttendance : ''} ${isLeaving ? styles.shellLeaving : ''}`}
      >
        <header className={styles.header}>
          <div className={styles.topBar}>
            <div className={styles.branchWrap} data-tour="branch">
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
            {/* RTL row: the first child sits furthest right. Sign-out is last
                so it ends up on the far left, with the date picker beside it. */}
            <div className={styles.topActions}>
              <label className={styles.iconBtn} title="בחירת תאריך" data-tour="date">
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
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setConfirmLogout(true)}
                disabled={isLeaving}
                aria-label="התנתק"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>

          <div className={styles.dayTitleWrap} data-tour="day">
            <div className={styles.dayTitle}>{hebrewDayTitle(selectedDate)}</div>
          </div>

          <div className={styles.carouselRow} data-tour="lessons">
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
              {/* Switching day refetches, so hold the shape of the strip rather
                  than collapsing it — the header must not jump. */}
              {isLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <div className={styles.slotWrap} key={`slot-skeleton-${i}`} aria-hidden="true">
                    <div className={styles.slotSkeleton} style={{ animationDelay: `${i * 90}ms` }} />
                  </div>
                ))}
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
                      <div className={`${styles.slotStatus} ${complete ? styles.ok : styles.miss}`} data-tour-status>
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
          <section className={styles.list} data-tour="list">
            {isLoading && (
              <div className={styles.rowSkeletons} aria-busy="true" aria-label="טוען שיעורים">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div className={styles.rowSkeleton} key={i} style={{ animationDelay: `${i * 90}ms` }}>
                    <span className={styles.rowSkeletonTime} />
                    <span className={styles.rowSkeletonText} />
                    <span className={styles.rowSkeletonPill} />
                  </div>
                ))}
              </div>
            )}
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
