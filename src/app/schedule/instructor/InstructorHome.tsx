'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  fetchLessons,
  formatDateISO,
  formatTime,
  prefetchLessonDetails,
} from '@/lib/scheduleUtils';
import { fetchLinkedUsers, fetchMyBranches, type LinkedUser } from '@/lib/api';
import type { Lesson } from '@/types/schedule';
import InstructorAttendance from './InstructorAttendance';
import InstructorDashboard from './InstructorDashboard';
import { INSTRUCTOR_MOTION_MS, resolveInstructorMotionDelay } from './instructorMotion';
import { useInstructorBack, type InstructorBackLayer } from './instructorBack';
import GuidedTour from '@/components/onboarding/GuidedTour';
import {
  activeCount,
  findCurrentOrNextLessonId,
  isLessonNow,
  lessonTimeRange,
  lessonTitle,
  shortGroupLabel,
  hebrewDayTitle,
} from './instructorUtils';
import styles from './InstructorHome.module.css';

/** How far ahead to look for the instructor's next teaching day. */
const LESSON_SEARCH_DAYS = 30;

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
  // Set when the screen moved itself off an empty day, so it can say so.
  const [autoAdvanced, setAutoAdvanced] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  // The register's own layers and the numbers sheet each fall away with their
  // own animation, so each hands up the way to close it rather than being torn
  // out from here — the phone's back button has to land where their own
  // controls land.
  const attendanceOverlayRef = useRef<(() => void) | null>(null);
  const [attendanceOverlayOpen, setAttendanceOverlayOpen] = useState(false);
  const dashboardDismissRef = useRef<(() => void) | null>(null);
  const [dashboardDismissible, setDashboardDismissible] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const transitionLockRef = useRef(false);
  const returnTimerRef = useRef<number | null>(null);
  // The day the tour started on, while it is borrowing another one.
  const tourOriginalDateRef = useRef<Date | null>(null);
  // Set while the tour is waiting for a lesson to become available to open.
  const tourWantsLessonRef = useRef(false);
  // Set while the tour is running, and cleared once it has borrowed a day, so
  // the search runs once rather than on every render.
  const tourRunningRef = useRef(false);
  const tourSearchedRef = useRef(false);
  const tourBorrowRef = useRef<(() => Promise<void>) | null>(null);
  // Which calendar the screen has already advanced for, so picking a date by
  // hand is never overridden.
  const autoAdvancedForRef = useRef<string | null>(null);
  /**
   * A day the search ahead already read, waiting for the load below to claim it.
   *
   * The search covers a month, so the day it lands on came back inside that same
   * answer; asking for it again is a second round trip for something already in
   * hand, and an instructor stands waiting through both.
   *
   * Carries the account it was read as, and is spent on first use. A day read as
   * one instructor can never be handed to another: the load only claims it when
   * both the date and that account match what it is about to ask for.
   */
  const preloadedDayRef = useRef<{ date: string; viewAs: string; lessons: Lesson[] } | null>(null);

  const dateIso = formatDateISO(selectedDate);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const ready = preloadedDayRef.current;
      preloadedDayRef.current = null;
      if (ready && ready.date === dateIso && ready.viewAs === viewAs) {
        setLessons(ready.lessons);
        setError('');
        setIsLoading(false);
        return;
      }
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

  /**
   * The soonest day from `anchor` onwards that this instructor actually
   * teaches, or null if there is none within the window.
   *
   * Always forward. Landing someone on a day behind them is worse than the
   * empty day it replaced — the next lesson is the one they need.
   */
  const nextTeachingDay = async (anchor: Date, who: string) => {
    const to = new Date(anchor);
    to.setDate(to.getDate() + LESSON_SEARCH_DAYS);
    const ahead = await fetchLessons({
      start_date: formatDateISO(anchor),
      end_date: formatDateISO(to),
      as_user: who === 'self' ? undefined : who,
    });
    const dates = ahead
      .map((l) => l.lesson_date)
      .filter((d): d is string => Boolean(d))
      .sort();
    if (!dates.length) return null;
    const iso = dates[0];
    // The occurrences for that day, out of the answer that found it. The
    // server expands a range the same way it expands a single day, so these
    // are what asking for the day on its own would return.
    return {
      iso,
      date: new Date(`${iso}T00:00:00`),
      lessons: ahead
        .filter((l) => l.lesson_date === iso)
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    };
  };

  // The rosters of the day on screen, read while the instructor looks at it.
  useEffect(() => {
    if (isLoading || !visibleLessons.length) return;
    prefetchLessonDetails(visibleLessons, viewAs === 'self' ? undefined : viewAs);
  }, [isLoading, visibleLessons, viewAs]);

  // An empty day tells an instructor nothing. When the screen opens on one —
  // or they switch to a colleague who is not teaching today — it moves to
  // their next teaching day instead.
  //
  // Only on arrival and on switching: once someone picks a date themselves
  // that is the day they asked for, empty or not.
  useEffect(() => {
    if (isLoading || visibleLessons.length) return;
    if (autoAdvancedForRef.current === viewAs) return;
    autoAdvancedForRef.current = viewAs;

    let cancelled = false;
    (async () => {
      try {
        const day = await nextTeachingDay(selectedDate, viewAs);
        if (cancelled || !day) return;
        if (day.iso === formatDateISO(selectedDate)) return;
        preloadedDayRef.current = { date: day.iso, viewAs, lessons: day.lessons };
        setAutoAdvanced(true);
        setSelectedDate(day.date);
      } catch {
        /* leave the empty day rather than guess */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, visibleLessons.length, viewAs]);

  // Most of the tour points at the day's lessons — the cubes, the list, then a
  // register. On a day the instructor does not teach there is nothing to point
  // at, so it moves to the nearest day that does have lessons and puts the day
  // back when it ends. Real lessons from their own timetable; nothing invented.
  useEffect(() => {
    const borrowADay = async () => {
      if (isLoading || visibleLessons.length) return;
      try {
        const nextDay = await nextTeachingDay(selectedDate, viewAs);
        if (!nextDay) return; // genuinely nothing ahead; the steps centre
        if (tourOriginalDateRef.current === null) {
          tourOriginalDateRef.current = selectedDate;
        }
        preloadedDayRef.current = { date: nextDay.iso, viewAs, lessons: nextDay.lessons };
        setSelectedDate(nextDay.date);
      } catch {
        /* the steps fall back to centred cards */
      }
    };

    const onStart = () => {
      tourRunningRef.current = true;
      tourSearchedRef.current = false;
      setTourOpen(true);
      void maybeBorrow();
    };

    // The tour can open before the day's lessons have arrived, so this is
    // retried from the effect below rather than only on the start event.
    const maybeBorrow = async () => {
      if (!tourRunningRef.current || tourSearchedRef.current) return;
      if (isLoading || visibleLessons.length) return;
      tourSearchedRef.current = true;
      await borrowADay();
    };

    tourBorrowRef.current = maybeBorrow;

    const openForTour = () => {
      tourWantsLessonRef.current = true;
      if (selectedLesson || openingLesson) return;
      const first = visibleLessons[0];
      if (first) void openLesson(first);
      else void borrowADay();
    };

    const closeForTour = () => {
      tourWantsLessonRef.current = false;
      setSelectedLesson(null);
      setOpeningLesson(null);
      setPendingLesson(null);
      transitionLockRef.current = false;
    };

    // Only when the tour is over — the borrowed day has to last across steps.
    const onEnd = () => {
      tourRunningRef.current = false;
      tourSearchedRef.current = false;
      setTourOpen(false);
      if (tourOriginalDateRef.current === null) return;
      const original = tourOriginalDateRef.current;
      tourOriginalDateRef.current = null;
      setSelectedDate(original);
    };

    window.addEventListener('kogo:tour-start', onStart);
    window.addEventListener('kogo:tour-open-lesson', openForTour);
    window.addEventListener('kogo:tour-close-lesson', closeForTour);
    window.addEventListener('kogo:tour-end', onEnd);
    return () => {
      window.removeEventListener('kogo:tour-start', onStart);
      window.removeEventListener('kogo:tour-open-lesson', openForTour);
      window.removeEventListener('kogo:tour-close-lesson', closeForTour);
      window.removeEventListener('kogo:tour-end', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleLessons, selectedLesson, openingLesson, selectedDate, viewAs, isLoading]);

  // Retry the day search once the lessons for the current day have settled.
  useEffect(() => {
    if (isLoading) return;
    void tourBorrowRef.current?.();
  }, [isLoading, visibleLessons]);

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

  const closeDashboard = useCallback(() => setDashboardOpen(false), []);

  const handleAttendanceOverlay = useCallback((dismiss: (() => void) | null) => {
    attendanceOverlayRef.current = dismiss;
    setAttendanceOverlayOpen(dismiss !== null);
  }, []);

  const handleDashboardDismiss = useCallback((dismiss: (() => void) | null) => {
    dashboardDismissRef.current = dismiss;
    setDashboardDismissible(dismiss !== null);
  }, []);

  // The phone's own back button. It is a second trigger for the controls
  // already on screen, never a second behaviour: every layer here is closed by
  // the very function its own control calls.
  useInstructorBack(
    {
      tourOpen,
      open: {
        logoutConfirm: confirmLogout,
        attendanceOverlay: attendanceOverlayOpen,
        dashboard: dashboardDismissible,
        teacherPicker: teacherPickerOpen,
        // From the moment a register is asked for until the moment it starts
        // animating away, so a press during either of those never falls
        // through to the browser.
        attendance: Boolean(visualLesson) && !isClosingAttendance,
      },
    },
    (layer: InstructorBackLayer) => {
      if (layer === 'logoutConfirm') setConfirmLogout(false);
      if (layer === 'attendanceOverlay') attendanceOverlayRef.current?.();
      if (layer === 'dashboard') dashboardDismissRef.current?.();
      if (layer === 'teacherPicker') setTeacherPickerOpen(false);
      if (layer === 'attendance') void closeAttendance();
    },
  );

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
          onClose={closeDashboard}
          onOpenLesson={openLessonFromDashboard}
          onDismissChange={handleDashboardDismiss}
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
                    setAutoAdvanced(false);
                    autoAdvancedForRef.current = viewAs;
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
                const trialStudentCount = lesson.trial_student_count ?? 0;
                const activeStudentCount = activeCount(lesson, trialStudentCount);
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
                      <div className={styles.slotCounts} aria-label={`${activeStudentCount} פעילים, ${trialStudentCount} תלמידי ניסיון`}>
                        <span title="תלמידים פעילים">
                          <Users size={13} aria-hidden="true" />
                          {activeStudentCount}
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

          {/* Say so plainly rather than leaving someone to wonder why the
              screen is not on today. */}
          {autoAdvanced && (
            <div className={styles.movedNote} key={formatDateISO(selectedDate)} role="status">
              <span className={styles.movedNoteFrom}>אין שיעורים היום</span>
              <ChevronLeft size={14} className={styles.movedNoteArrow} aria-hidden />
              <span className={styles.movedNoteTo}>{hebrewDayTitle(selectedDate)}</span>
            </div>
          )}

          <div className={styles.sectionLabel}>השיעורים היום</div>
        </header>

        <div className={styles.body}>
          <section className={styles.list} data-tour="list" key={formatDateISO(selectedDate)}>
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
              const trialStudentCount = lesson.trial_student_count ?? 0;
              const activeStudentCount = activeCount(lesson, trialStudentCount);
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
                        <div className={styles.cardCounts} aria-label={`${activeStudentCount} פעילים, ${trialStudentCount} תלמידי ניסיון`}>
                          <span title="תלמידים פעילים">
                            <Users size={15} aria-hidden="true" />
                            {activeStudentCount} פעילים
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
                asUser={viewAs === 'self' ? undefined : viewAs}
                onOverlayChange={handleAttendanceOverlay}
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
