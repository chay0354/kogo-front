'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import LessonDetailsDialog from '@/components/dialogs/LessonDetailsDialog';
import EventDialog from '@/components/dialogs/EventDialog';
import EventDetailsDialog from '@/components/dialogs/EventDetailsDialog';
import { Lesson, LessonFilters, ScheduleEvent } from '@/types/schedule';
import { fetchLessons, getWeekDates, formatDateISO } from '@/lib/scheduleUtils';
import { fetchEvents } from '@/lib/eventUtils';
import { useAuth } from '@/components/AuthProvider';
import { RefreshCw, ChevronRight, ChevronLeft, Search, SlidersHorizontal } from 'lucide-react';
import { LG_MEDIA_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import CalendarGrid from '@/components/schedule/CalendarGrid';
import CalendarLayerPicker from '@/components/schedule/CalendarLayerPicker';
import {
  buildLayers,
  eventLayerKey,
  layerColor,
  lessonLayerKey,
  type LayerDimension,
} from '@/components/schedule/calendarLayers';
import styles from '@/components/schedule/theme/calendar.module.css';
import { CardGridSkeleton } from '@/components/ui/skeleton';
import InstructorHome from '@/app/schedule/instructor/InstructorHome';

function shouldShowLessonOnDate(lesson: Lesson, date: Date): boolean {
  // For recurring lessons, lesson_date is treated as "start date" (first occurrence).
  // Hide in weeks before the start date so newly-added lessons don't appear in past weeks.
  if (!lesson.is_recurring) return true;
  if (!lesson.lesson_date) return true;
  const start = new Date(lesson.lesson_date);
  start.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return start.getTime() <= d.getTime();
}

type ContentFilter = 'all' | 'lessons' | 'rentals';

export default function SchedulePage() {
  const { user, loading } = useAuth();

  if (loading || !user) {
    return null;
  }

  if (user.role === 'worker') {
    return <InstructorHome />;
  }

  return <StaffSchedulePage />;
}

/**
 * The office's week.
 *
 * The screen used to ask which single branch you wanted and then draw that one.
 * It now draws every branch the server is willing to hand you and lets you
 * decide which are on the board, the way a calendar app layers calendars. That
 * is why the fetch below sends only a date range: the branch, course and
 * instructor cuts are all views of the same week, and re-fetching to change one
 * would make layering feel like a filter again.
 *
 * Scoping is unchanged and still the server's job — a partner's lessons query
 * is already limited to their branches and a worker's to their own, so asking
 * for "the week" never returns more than the caller was already allowed.
 */
function StaffSchedulePage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const isDesktop = useMediaQuery(LG_MEDIA_QUERY);
  const [view, setView] = useState<'week' | 'day'>('week');
  const [dimension, setDimension] = useState<LayerDimension>('branch');
  const [search, setSearch] = useState('');
  const [contentFilter, setContentFilter] = useState<ContentFilter>('all');
  const [showRail, setShowRail] = useState(false);

  // A layer the office switched off, remembered per dimension. Storing what is
  // hidden rather than what is shown means a branch that appears for the first
  // time next week arrives on the board instead of silently missing.
  const [hidden, setHidden] = useState<Record<LayerDimension, Set<string>>>({
    branch: new Set(),
    course: new Set(),
    instructor: new Set(),
  });

  const [detailsDialogLessonId, setDetailsDialogLessonId] = useState<string | null>(null);
  const [detailsDialogOccurrenceDate, setDetailsDialogOccurrenceDate] = useState<string | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);

  const loadSeqRef = useRef(0);
  const { start, end, dates } = getWeekDates(currentDate);

  // Six columns is what a desktop week can hold and still read; a phone gets one
  // day with the week as a strip above it.
  const weekDays = useMemo(() => dates.slice(0, 6), [start.getTime()]);
  const isWeek = view === 'week' && isDesktop;
  const days = useMemo(
    () => (isWeek ? weekDays : [currentDate]),
    [isWeek, weekDays, currentDate],
  );

  useEffect(() => {
    if (!isDesktop) setView('day');
  }, [isDesktop]);

  useEffect(() => {
    const load = async () => {
      const seq = ++loadSeqRef.current;
      setIsLoading(true);
      setError('');

      const range = {
        start_date: formatDateISO(isWeek ? start : currentDate),
        end_date: formatDateISO(isWeek ? end : currentDate),
      };

      const lessonFilters: LessonFilters = { ...range };

      const lessonsPromise =
        contentFilter === 'rentals' ? Promise.resolve([] as Lesson[]) : fetchLessons(lessonFilters);
      const eventsPromise =
        contentFilter === 'lessons'
          ? Promise.resolve([] as ScheduleEvent[])
          : fetchEvents(contentFilter === 'rentals' ? { ...range, studio_rental: true } : range);

      const [lessonsResult, eventsResult] = await Promise.allSettled([lessonsPromise, eventsPromise]);
      if (seq !== loadSeqRef.current) return;

      if (lessonsResult.status === 'fulfilled') {
        setLessons(lessonsResult.value);
      } else {
        setLessons([]);
        setError('שגיאה בטעינת השיעורים');
        console.error(lessonsResult.reason);
      }

      if (eventsResult.status === 'fulfilled') {
        setEvents(eventsResult.value);
      } else {
        setEvents([]);
        if (lessonsResult.status === 'fulfilled') {
          console.error(eventsResult.reason);
        } else {
          setError('שגיאה בטעינת השיעורים והאירועים');
        }
      }

      setIsLoading(false);
    };

    load();
  }, [currentDate, isWeek, contentFilter, start.getTime(), end.getTime()]);

  const refresh = () => setCurrentDate(new Date(currentDate));

  const inRange = useMemo(
    () => lessons.filter((lesson) => days.some((day) => shouldShowLessonOnDate(lesson, day))),
    [lessons, days],
  );

  const layers = useMemo(
    () => buildLayers(inRange, events, dimension),
    [inRange, events, dimension],
  );

  const hiddenNow = hidden[dimension];
  const selected = useMemo(
    () => new Set(layers.filter((layer) => !hiddenNow.has(layer.key)).map((layer) => layer.key)),
    [layers, hiddenNow],
  );

  const term = search.trim().toLowerCase();
  const matches = (...fields: Array<string | undefined | null>) =>
    !term || fields.some((field) => field?.toLowerCase().includes(term));

  const visibleLessons = useMemo(
    () =>
      inRange.filter(
        (lesson) =>
          selected.has(lessonLayerKey(lesson, dimension)) &&
          matches(
            lesson.course_name,
            lesson.course_type_name,
            lesson.instructor_name,
            lesson.branch_name,
            lesson.room_name,
          ),
      ),
    [inRange, selected, dimension, term],
  );

  const visibleEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          selected.has(eventLayerKey(event, dimension, layers)) &&
          matches(event.name, event.branch_name, event.studio_name, event.renter_name),
      ),
    [events, selected, dimension, layers, term],
  );

  const toggleLayer = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev[dimension]);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...prev, [dimension]: next };
    });

  const showAll = () => setHidden((prev) => ({ ...prev, [dimension]: new Set() }));
  const showNone = () =>
    setHidden((prev) => ({ ...prev, [dimension]: new Set(layers.map((layer) => layer.key)) }));

  const step = (direction: 1 | -1) => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + direction * (isWeek ? 7 : 1));
    setCurrentDate(next);
  };

  const rangeLabel = isWeek
      ? `${weekDays[0].toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })} – ${weekDays[
          weekDays.length - 1
        ].toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}`
      : currentDate.toLocaleDateString('he-IL', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });

  const rail = (
    <CalendarLayerPicker
      dimension={dimension}
      onDimensionChange={setDimension}
      layers={layers}
      selected={selected}
      onToggle={toggleLayer}
      onAll={showAll}
      onNone={showNone}
    />
  );

  return (
    <>
      <div className={styles.scope} dir="rtl">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[27px] font-black leading-tight tracking-tight">לוח זמנים</h1>
              <p className="text-[13px] font-semibold text-[color:var(--kg-muted)]">
                {rangeLabel}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={refresh}
                title="רענן"
                className={styles.navBtn}
                style={{ background: '#fff', boxShadow: 'var(--kg-sh)' }}
              >
                <RefreshCw size={15} />
              </button>
              <button
                type="button"
                onClick={() => setShowEventDialog(true)}
                className={styles.railBtn}
                style={{ flex: 'none', padding: '7px 13px' }}
              >
                הוסף אירוע
              </button>
            </div>
          </div>

          <div className={styles.bar}>
            <div className={styles.nav}>
              <button type="button" className={styles.navBtn} onClick={() => step(-1)} aria-label="הקודם">
                <ChevronRight size={17} />
              </button>
              <button type="button" className={styles.today} onClick={() => setCurrentDate(new Date())}>
                היום
              </button>
              <button type="button" className={styles.navBtn} onClick={() => step(1)} aria-label="הבא">
                <ChevronLeft size={17} />
              </button>
            </div>

            {isDesktop ? (
              <div className={styles.views} role="tablist" aria-label="תצוגה">
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'week'}
                  onClick={() => setView('week')}
                  className={`${styles.view} ${view === 'week' ? styles.viewOn : ''}`}
                >
                  שבוע
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'day'}
                  onClick={() => setView('day')}
                  className={`${styles.view} ${view === 'day' ? styles.viewOn : ''}`}
                >
                  יום
                </button>
              </div>
            ) : null}

            <label className="relative flex-1 min-w-[150px]">
              <Search
                size={14}
                className="absolute top-1/2 -translate-y-1/2 text-[color:var(--kg-muted)]"
                style={{ insetInlineStart: 10 }}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש שיעור, מדריך או סטודיו..."
                className="w-full rounded-full border border-[color:var(--kg-line)] bg-white py-2 text-[12.5px] font-semibold outline-none focus:border-[#5b54d6]"
                style={{ paddingInlineStart: 30, paddingInlineEnd: 13 }}
              />
            </label>

            <select
              value={contentFilter}
              onChange={(e) => setContentFilter(e.target.value as ContentFilter)}
              className="rounded-full border border-[color:var(--kg-line)] bg-white px-3 py-2 text-[12.5px] font-bold"
              aria-label="סוג תוכן"
            >
              <option value="all">הכל</option>
              <option value="lessons">שיעורים</option>
              <option value="rentals">שכירויות</option>
            </select>

            {!isDesktop ? (
              <button
                type="button"
                onClick={() => setShowRail((v) => !v)}
                className={styles.railBtn}
                style={{ flex: 'none', padding: '7px 12px', display: 'inline-flex', gap: 5, alignItems: 'center' }}
                aria-expanded={showRail}
              >
                <SlidersHorizontal size={13} />
                שכבות
              </button>
            ) : null}
          </div>

          {!isDesktop ? (
            <div className={styles.strip}>
              {weekDays.map((day, index) => {
                const on = day.toDateString() === currentDate.toDateString();
                const dayKey = formatDateISO(day);
                const hues = Array.from(
                  new Set(
                    visibleLessons
                      .filter((lesson) => lesson.lesson_date === dayKey)
                      .map((lesson) => lessonLayerKey(lesson, dimension)),
                  ),
                ).slice(0, 4);
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setCurrentDate(new Date(day))}
                    className={`${styles.stripDay} ${on ? styles.stripOn : ''}`}
                  >
                    <div className={styles.stripName}>
                      {day.toLocaleDateString('he-IL', { weekday: 'narrow' })}
                    </div>
                    <div className={styles.stripNum}>{day.getDate()}</div>
                    <div className={styles.stripDots}>
                      {hues.map((key) => {
                        const layer = layers.find((l) => l.key === key);
                        return (
                          <span
                            key={key}
                            className={styles.stripDot}
                            style={{ background: layerColor(layer?.colorIndex ?? 0).base }}
                          />
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}

          {!isDesktop && showRail ? rail : null}

          {isLoading ? (
            <CardGridSkeleton
              cards={6}
              gridClassName="flex gap-3 overflow-hidden"
              cardClassName="h-[420px] w-56 shrink-0"
              label="טוען שיעורים"
            />
          ) : (
            <div className={styles.split}>
              {isDesktop ? rail : null}
              <CalendarGrid
                days={days}
                lessons={visibleLessons}
                events={visibleEvents}
                dimension={dimension}
                layers={layers}
                hourPx={isDesktop ? 96 : 84}
                onSelectLesson={(lesson) => {
                  setDetailsDialogLessonId(lesson.id);
                  setDetailsDialogOccurrenceDate(lesson.lesson_date || null);
                }}
                onSelectEvent={setSelectedEvent}
              />
            </div>
          )}
        </div>

        {detailsDialogLessonId && (
          <LessonDetailsDialog
            lessonId={detailsDialogLessonId}
            occurrenceDate={detailsDialogOccurrenceDate}
            onClose={() => {
              setDetailsDialogLessonId(null);
              setDetailsDialogOccurrenceDate(null);
            }}
            onSuccess={refresh}
          />
        )}

        {showEventDialog && (
          <EventDialog onClose={() => setShowEventDialog(false)} onSuccess={refresh} />
        )}

        {selectedEvent && (
          <EventDetailsDialog
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
            onSuccess={refresh}
          />
        )}
      </div>
    </>
  );
}
