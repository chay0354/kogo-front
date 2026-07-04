'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import PageSearchBar from '@/components/PageSearchBar';
import PageFilters from '@/components/PageFilters';
import LessonDetailsDialog from '@/components/dialogs/LessonDetailsDialog';
import EventDialog from '@/components/dialogs/EventDialog';
import EventDetailsDialog from '@/components/dialogs/EventDetailsDialog';
import { Lesson, LessonFilters, ScheduleEvent } from '@/types/schedule';
import { fetchLessons, getWeekDates, formatDateISO, groupLessonsByDate, formatTime } from '@/lib/scheduleUtils';
import ScheduleLessonCard from '@/components/schedule/ScheduleLessonCard';
import { fetchEvents } from '@/lib/eventUtils';
import { useAuth } from '@/components/AuthProvider';
import { RefreshCw, Plus, ChevronRight, ChevronLeft, Calendar as CalendarIcon, LogOut } from 'lucide-react';
import { LG_MEDIA_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import api, { fetchInstructorsDropdown } from '@/lib/api';
import { citiesFromBranches, filterBranchesByCity, filterBranchesForUser, unwrapApiList } from '@/lib/scopedFilters';

type Branch = {
  id: string;
  name: string;
  city?: string;
  city_name?: string;
};

type City = {
  id: string;
  name: string;
};

type Instructor = {
  id: string;
  first_name: string;
  last_name: string;
};

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
  const { user, logout } = useAuth();
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const isManager = user?.role === 'manager';
  const isPartner = user?.role === 'partner';
  const isWorker = user?.role === 'worker';
  const canUseStaffFilters = isManager || isPartner;
  
  const isDesktop = useMediaQuery(LG_MEDIA_QUERY);
  
  // Workers are forced to daily view; mobile defaults to daily
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly'>(isWorker ? 'daily' : 'weekly');
  const [mobileTabInit, setMobileTabInit] = useState(false);

  useEffect(() => {
    if (!mobileTabInit && !isDesktop && !isWorker) {
      setActiveTab('daily');
      setMobileTabInit(true);
    }
  }, [isDesktop, isWorker, mobileTabInit]);
  
  // Filters
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [cityFilter, setCityFilter] = useState<string>('all');
  const [instructorFilter, setInstructorFilter] = useState<string>('all');
  const [contentFilter, setContentFilter] = useState<ContentFilter>('all');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [pageSearch, setPageSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [primaryFilter, setPrimaryFilter] = useState('');
  const [secondaryFilter, setSecondaryFilter] = useState('');

  // Dialog
  const [detailsDialogLessonId, setDetailsDialogLessonId] = useState<string | null>(null);
  const [detailsDialogOccurrenceDate, setDetailsDialogOccurrenceDate] = useState<string | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);

  const { start, end, dates } = getWeekDates(currentDate);

  useEffect(() => {
    if (canUseStaffFilters) {
      loadFilters();
    }
  }, [canUseStaffFilters, user?.id]);

  useEffect(() => {
    loadLessons();
  }, [currentDate, branchFilter, cityFilter, instructorFilter, contentFilter, activeTab]);

  const loadFilters = async () => {
    try {
      const branchRes = await api.get('/core/branches/?simple=true');
      const branchList = filterBranchesForUser(
        unwrapApiList<Branch>(branchRes.data),
        user,
      );
      setBranches(branchList);
      setCities(citiesFromBranches(branchList));

      const instructorList = await fetchInstructorsDropdown();
      setInstructors(instructorList);
    } catch (err) {
      console.error('Error loading filters:', err);
    }
  };

  const branchesForFilter =
    cityFilter === 'all' ? branches : filterBranchesByCity(branches, cityFilter);

  const loadLessons = async () => {
    setIsLoading(true);
    setError('');

    try {
      const dateRange = {
        start_date: activeTab === 'daily' ? formatDateISO(currentDate) : formatDateISO(start),
        end_date: activeTab === 'daily' ? formatDateISO(currentDate) : formatDateISO(end),
      };

      const eventFilters = {
        ...dateRange,
        branch_id: branchFilter !== 'all' ? branchFilter : undefined,
        city_id: cityFilter !== 'all' ? cityFilter : undefined,
      };

      let lessonsData: Lesson[] = [];
      if (contentFilter === 'all' || contentFilter === 'lessons') {
        const lessonFilters: LessonFilters = { ...dateRange };
        if (branchFilter !== 'all') lessonFilters.branch_id = branchFilter;
        if (cityFilter !== 'all') lessonFilters.city_id = cityFilter;
        if (instructorFilter !== 'all') lessonFilters.instructor_id = instructorFilter;
        lessonsData = await fetchLessons(lessonFilters);
      }

      let eventsData: ScheduleEvent[] = [];
      if (contentFilter === 'rentals') {
        if (!isWorker) {
          eventsData = await fetchEvents({ ...eventFilters, studio_rental: true });
        }
      } else if (contentFilter === 'all') {
        eventsData = await fetchEvents(eventFilters);
        if (isWorker) {
          eventsData = eventsData.filter((e) => !e.is_studio_rental);
        }
      }

      setLessons(lessonsData);
      setEvents(eventsData);
    } catch (err) {
      setError('שגיאה בטעינת השיעורים והאירועים');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrevious = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - (activeTab === 'daily' ? 1 : 7));
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (activeTab === 'daily' ? 1 : 7));
    setCurrentDate(newDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleRefresh = () => {
    loadLessons();
  };

  const handleViewDetails = (lesson: Lesson) => {
    setDetailsDialogLessonId(lesson.id);
    setDetailsDialogOccurrenceDate(lesson.lesson_date || null);
  };

  const handleViewEventDetails = (event: ScheduleEvent) => {
    if (isWorker && event.is_studio_rental) return;
    setSelectedEvent(event);
  };

  const handleDialogSuccess = () => {
    loadLessons();
  };

  const lessonsByDay = groupLessonsByDate(lessons, dates);

  const dateDisplay = activeTab === 'daily'
    ? currentDate.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : `${start.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })} - ${end.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' })}`;

  return (
    <AppLayout>
      <div className="flex flex-col gap-4 sm:gap-6" dir="rtl">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold">לוח זמנים</h1>
          <div className="flex flex-wrap gap-2">
            {isWorker ? (
              /* Worker: Show only sign out button */
              <button
                onClick={async () => {
                  await logout();
                  router.replace('/signin');
                }}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                התנתק
              </button>
            ) : (
              /* Manager: Show all controls */
              <>
                <button
                  onClick={handleRefresh}
                  className="px-3 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2"
                  title="רענן"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button 
                  onClick={() => setShowEventDialog(true)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  הוסף אירוע
                </button>
                {activeTab === 'daily' && (
                  <button className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    הוסף שיעור
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Tabs - Hidden for workers */}
        <div className="space-y-4">
          {/* Tab List - Only show for managers */}
          {!isWorker && (
            <div className="flex gap-2 border-b">
              <button
                onClick={() => setActiveTab('daily')}
                className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                  activeTab === 'daily'
                    ? 'border-teal-500 text-teal-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                תצוגה יומית
              </button>
              <button
                onClick={() => setActiveTab('weekly')}
                className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                  activeTab === 'weekly'
                    ? 'border-teal-500 text-teal-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                תצוגה שבועית
              </button>
            </div>
          )}

          {/* Navigation Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevious}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ChevronRight className="h-5 w-5" />
              </button>

              <div className="font-medium text-base sm:text-lg min-w-0">{dateDisplay}</div>

              <button
                onClick={handleNext}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <button
                onClick={handleToday}
                className="px-3 py-1 text-sm border rounded-lg hover:bg-gray-50 flex items-center gap-1"
              >
                <CalendarIcon className="h-4 w-4" />
                היום
              </button>
            </div>

            {/* Filters (manager + partner) */}
            {canUseStaffFilters && (
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 w-full sm:w-auto">
                <select
                  value={contentFilter}
                  onChange={(e) => setContentFilter(e.target.value as ContentFilter)}
                  className="w-full sm:w-36 px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="all">הכל</option>
                  <option value="lessons">שיעורים</option>
                  <option value="rentals">שכירויות</option>
                </select>

                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="w-full sm:w-48 px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="all">כל הסניפים</option>
                  {branchesForFilter.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>

                <select
                  value={cityFilter}
                  onChange={(e) => setCityFilter(e.target.value)}
                  className="w-full sm:w-48 px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="all">כל הערים</option>
                  {cities.map((city: any) => (
                    <option key={city.id} value={city.id}>
                      {city.name}
                    </option>
                  ))}
                </select>

                <select
                  value={instructorFilter}
                  onChange={(e) => setInstructorFilter(e.target.value)}
                  className="w-full sm:w-48 px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="all">כל המדריכים</option>
                  {instructors.map((instructor: any) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.first_name} {instructor.last_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <PageSearchBar
            search={pageSearch}
            onSearchChange={setPageSearch}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            searchPlaceholder="חיפוש שיעור..."
          />
          <PageFilters
            primaryLabel="עסק / סניף"
            primaryValue={primaryFilter}
            primaryOptions={branches.map((b) => ({ value: b.id, label: b.name }))}
            onPrimaryChange={setPrimaryFilter}
            secondaryValue={secondaryFilter}
            secondaryOptions={[]}
            onSecondaryChange={setSecondaryFilter}
          />

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Tab Content */}
          {isLoading ? (
            <div className="text-center py-12">
              <div className="text-lg text-gray-600">טוען שיעורים...</div>
            </div>
          ) : activeTab === 'weekly' ? (
            <WeeklyView
              weekDates={dates}
              lessonsByDay={lessonsByDay}
              events={events}
              branchFilter={branchFilter}
              onViewDetails={handleViewDetails}
              onViewEventDetails={handleViewEventDetails}
            />
          ) : (
            <DailyView
              currentDate={currentDate}
              lessons={lessons}
              events={events}
              onViewDetails={handleViewDetails}
              onViewEventDetails={handleViewEventDetails}
              branchFilter={branchFilter}
            />
          )}
        </div>
      </div>

      {/* Lesson Details Dialog */}
      {detailsDialogLessonId && (
        <LessonDetailsDialog
          lessonId={detailsDialogLessonId}
          occurrenceDate={detailsDialogOccurrenceDate}
          onClose={() => {
            setDetailsDialogLessonId(null);
            setDetailsDialogOccurrenceDate(null);
          }}
          onSuccess={handleDialogSuccess}
        />
      )}

      {/* Event Dialog */}
      {showEventDialog && (
        <EventDialog
          onClose={() => setShowEventDialog(false)}
          onSuccess={handleDialogSuccess}
        />
      )}

      {/* Event Details Dialog */}
      {selectedEvent && (
        <EventDetailsDialog
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onSuccess={handleDialogSuccess}
        />
      )}
    </AppLayout>
  );
}

// Weekly View Component — scrollable day columns, time groups, compact cards
function gridSlotSize(height: number): 'xs' | 'sm' | 'md' | 'lg' {
  const h = height - 4;
  if (h < 40) return 'xs';
  if (h < 64) return 'sm';
  if (h < 110) return 'md';
  return 'lg';
}

function WeeklyView({
  weekDates,
  lessonsByDay,
  events,
  branchFilter,
  onViewDetails,
  onViewEventDetails,
}: {
  weekDates: Date[];
  lessonsByDay: Record<number, Lesson[]>;
  events: ScheduleEvent[];
  branchFilter: string;
  onViewDetails: (lesson: Lesson) => void;
  onViewEventDetails: (event: ScheduleEvent) => void;
}) {
  const workDays = weekDates.slice(0, 6); // Sunday to Friday

  type DayScheduleItem =
    | { kind: 'lesson'; start: string; end: string; id: string; lesson: Lesson; studioKey: string; studioLabel: string }
    | { kind: 'event'; start: string; end: string; id: string; event: ScheduleEvent; studioKey: string; studioLabel: string };

  const getLessonStudio = (lesson: Lesson): { key: string; label: string } => {
    const room = lesson.room_name?.trim();
    if (!room) {
      return { key: '__none__', label: 'ללא סטודיו' };
    }
    if (branchFilter === 'all' && lesson.branch_name) {
      return { key: `${lesson.branch_id}:${room}`, label: `${room} · ${lesson.branch_name}` };
    }
    return { key: room, label: room };
  };

  const getEventStudio = (event: ScheduleEvent): { key: string; label: string } => {
    const studio = event.studio_name?.trim();
    if (studio) {
      if (branchFilter === 'all' && event.branch_name) {
        return { key: `${event.branch || 'branch'}:${studio}`, label: `${studio} · ${event.branch_name}` };
      }
      return { key: studio, label: studio };
    }
    return { key: '__none__', label: 'ללא סטודיו' };
  };

  type StudioColumn = { key: string; label: string; items: DayScheduleItem[] };

  const buildDayStudioColumns = (
    dayLessons: Lesson[],
    timedEvents: ScheduleEvent[]
  ): StudioColumn[] => {
    const byStudio = new Map<string, StudioColumn>();

    const pushItem = (studio: { key: string; label: string }, item: DayScheduleItem) => {
      if (!byStudio.has(studio.key)) {
        byStudio.set(studio.key, { key: studio.key, label: studio.label, items: [] });
      }
      byStudio.get(studio.key)!.items.push(item);
    };

    dayLessons.forEach((lesson) => {
      const studio = getLessonStudio(lesson);
      pushItem(studio, {
        kind: 'lesson',
        start: lesson.start_time || '00:00:00',
        end: lesson.end_time || lesson.start_time || '00:00:00',
        id: lesson.id,
        lesson,
        studioKey: studio.key,
        studioLabel: studio.label,
      });
    });

    timedEvents.forEach((event) => {
      const studio = getEventStudio(event);
      pushItem(studio, {
        kind: 'event',
        start: event.start_time || '00:00:00',
        end: event.end_time || event.start_time || '00:00:00',
        id: event.id,
        event,
        studioKey: studio.key,
        studioLabel: studio.label,
      });
    });

    return Array.from(byStudio.values())
      .map((col) => ({
        ...col,
        items: col.items.sort((a, b) => a.start.localeCompare(b.start)),
      }))
      .sort(
        (a, b) =>
          (a.key === '__none__' ? 1 : 0) - (b.key === '__none__' ? 1 : 0) ||
          a.label.localeCompare(b.label, 'he')
      );
  };

  // Group events by day
  const eventsByDay: Record<number, { daily: ScheduleEvent[]; timed: ScheduleEvent[] }> = {};
  workDays.forEach((date, index) => {
    const dateStr = formatDateISO(date);
    const dayEvents = events.filter(e => e.event_date === dateStr);
    eventsByDay[index] = {
      daily: dayEvents.filter(e => e.is_daily_event),
      timed: dayEvents.filter(e => !e.is_daily_event),
    };
  });

  // --- Time-grid (Apple Calendar style) ---
  // 96px per hour so a bubble's height visibly matches its duration
  // (45-min lesson ≈ 72px — enough to show its content)
  const HOUR_PX = 96;
  const STUDIO_HEADER_PX = 40;
  const MIN_ITEM_MINUTES = 20;

  const timeToMinutes = (t: string) => {
    const [h = 0, m = 0] = t.split(':').map((n) => parseInt(n, 10) || 0);
    return h * 60 + m;
  };

  const daysData = workDays.map((date, index) => {
    const dayLessons = (lessonsByDay[index] || []).filter((l) => shouldShowLessonOnDate(l, date));
    const dayEventData = eventsByDay[index] || { daily: [], timed: [] };
    const studioColumns = buildDayStudioColumns(dayLessons, dayEventData.timed);
    const totalItems = studioColumns.reduce((n, col) => n + col.items.length, 0);
    return { date, dayEventData, studioColumns, totalItems };
  });

  // One shared hour range for the whole week so all day grids align
  let earliestMin = Infinity;
  let latestMin = -Infinity;
  daysData.forEach(({ studioColumns }) =>
    studioColumns.forEach((col) =>
      col.items.forEach((item) => {
        const start = timeToMinutes(item.start);
        const end = Math.max(timeToMinutes(item.end), start + MIN_ITEM_MINUTES);
        earliestMin = Math.min(earliestMin, start);
        latestMin = Math.max(latestMin, end);
      })
    )
  );
  if (!Number.isFinite(earliestMin)) {
    earliestMin = 8 * 60;
    latestMin = 20 * 60;
  }
  const startHour = Math.max(0, Math.floor(earliestMin / 60));
  const endHour = Math.min(24, Math.max(startHour + 1, Math.ceil(latestMin / 60)));
  const hourMarks = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const gridHeight = (endHour - startHour) * HOUR_PX;

  // Assign overlapping items within a studio to side-by-side lanes
  const layoutColumnItems = (items: DayScheduleItem[]) => {
    const laneEnds: number[] = [];
    const placed = items.map((item) => {
      const startMin = timeToMinutes(item.start);
      const endMin = Math.max(timeToMinutes(item.end), startMin + MIN_ITEM_MINUTES);
      let lane = laneEnds.findIndex((end) => end <= startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(endMin);
      } else {
        laneEnds[lane] = endMin;
      }
      return { item, startMin, endMin, lane };
    });
    return { placed, laneCount: Math.max(1, laneEnds.length) };
  };

  const mainScrollRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const updateWidth = () => setContentWidth(el.scrollWidth);
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, [daysData, gridHeight]);

  useEffect(() => {
    const main = mainScrollRef.current;
    const top = topScrollRef.current;
    if (!main || !top) return;

    let syncing = false;
    const syncMainToTop = () => {
      if (syncing) return;
      syncing = true;
      top.scrollLeft = main.scrollLeft;
      syncing = false;
    };
    const syncTopToMain = () => {
      if (syncing) return;
      syncing = true;
      main.scrollLeft = top.scrollLeft;
      syncing = false;
    };

    main.addEventListener('scroll', syncMainToTop, { passive: true });
    top.addEventListener('scroll', syncTopToMain, { passive: true });
    return () => {
      main.removeEventListener('scroll', syncMainToTop);
      top.removeEventListener('scroll', syncTopToMain);
    };
  }, [contentWidth]);

  return (
    <div className="space-y-1">
      {/* Horizontal scroll — synced strip at top so users don't scroll down to pan days */}
      <div
        ref={topScrollRef}
        className="overflow-x-auto overflow-y-hidden -mx-1 px-1 h-3 shrink-0"
        aria-label="גלילה אופקית — ימים"
      >
        <div style={{ width: contentWidth || 1, height: 1 }} />
      </div>

      <div
        ref={mainScrollRef}
        className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)] sm:max-h-[calc(100vh-260px)] pb-1 -mx-1 px-1"
      >
        <div ref={contentRef} className="flex gap-3 min-w-max">
        {daysData.map(({ date, dayEventData, studioColumns, totalItems }, index) => {
          const isToday = new Date().toDateString() === date.toDateString();
          const columns: StudioColumn[] =
            studioColumns.length > 0
              ? studioColumns
              : [{ key: '__empty__', label: '', items: [] }];
          // Hour gutter (2.5rem) + one column per studio
          const dayWidthRem = 2.5 + Math.min(columns.length, 4) * 12;

          return (
            <div
              key={index}
              style={{ width: `${dayWidthRem}rem` }}
              className={`flex shrink-0 flex-col rounded-lg border bg-white shadow-sm overflow-hidden ${
                isToday ? 'ring-2 ring-teal-500/40 border-teal-200' : 'border-gray-200'
              }`}
            >
              <div
                className={`px-3 py-2.5 text-center border-b ${
                  isToday ? 'bg-teal-50 text-teal-900' : 'bg-gray-50 text-gray-900'
                }`}
              >
                <div className="text-sm font-bold leading-tight">
                  {date.toLocaleDateString('he-IL', { weekday: 'long' })}
                </div>
                <div className="text-xs text-gray-600 mt-0.5">
                  {date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}
                </div>
              </div>

              {dayEventData.daily.length > 0 && (
                <div className="bg-purple-50 border-b border-purple-100 p-2 space-y-1.5">
                  {dayEventData.daily.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      compact
                      onClick={() => onViewEventDetails(event)}
                    />
                  ))}
                </div>
              )}

              <div className="flex-1 bg-white">
                <div className="flex">
                  {/* Hour gutter (appears on the right in RTL) */}
                  <div className="w-10 shrink-0 bg-gray-50/60 border-l border-gray-100">
                    <div
                      style={{ height: STUDIO_HEADER_PX }}
                      className="border-b border-gray-200"
                    />
                    <div className="relative" style={{ height: gridHeight }}>
                      {hourMarks.map((h) => (
                        <div
                          key={h}
                          className="absolute inset-x-0 -translate-y-1/2 text-center text-[10px] text-gray-400 tabular-nums"
                          style={{ top: (h - startHour) * HOUR_PX }}
                        >
                          {String(h).padStart(2, '0')}:00
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Studio columns over a shared hour grid */}
                  <div className="flex flex-1 min-w-0 divide-x divide-x-reverse divide-gray-200">
                    {columns.map((col) => {
                      const { placed, laneCount } = layoutColumnItems(col.items);
                      return (
                        <div key={col.key} className="flex-1 min-w-0">
                          <div
                            style={{ height: STUDIO_HEADER_PX }}
                            className="px-2 flex flex-col items-center justify-center border-b border-gray-200 bg-gray-50/90"
                          >
                            <div
                              className="w-full text-[11px] font-semibold text-gray-600 truncate text-center"
                              title={col.label}
                            >
                              {col.label || '—'}
                            </div>
                            {col.items.length > 0 ? (
                              <div className="text-[10px] text-gray-400 leading-tight">
                                {col.items.length} פעילויות
                              </div>
                            ) : null}
                          </div>

                          <div className="relative" style={{ height: gridHeight }}>
                            {hourMarks.slice(1, -1).map((h) => (
                              <div
                                key={h}
                                className="absolute inset-x-0 border-t border-gray-100"
                                style={{ top: (h - startHour) * HOUR_PX }}
                              />
                            ))}

                            {totalItems === 0 ? (
                              <div className="absolute inset-x-0 top-8 text-center text-xs text-gray-400">
                                אין שיעורים
                              </div>
                            ) : null}

                            {placed.map(({ item, startMin, endMin, lane }) => {
                              const top = ((startMin - startHour * 60) / 60) * HOUR_PX;
                              const height = Math.max(
                                26,
                                ((endMin - startMin) / 60) * HOUR_PX - 2
                              );
                              const widthPct = 100 / laneCount;
                              const slotSize = gridSlotSize(height);
                              return (
                                <div
                                  key={`${item.kind}-${item.id}`}
                                  className="absolute p-0.5 z-[1] hover:z-10"
                                  style={{
                                    top,
                                    height,
                                    right: `${lane * widthPct}%`,
                                    width: `${widthPct}%`,
                                  }}
                                >
                                  {item.kind === 'lesson' ? (
                                    <ScheduleLessonCard
                                      lesson={item.lesson}
                                      compact
                                      gridSize={slotSize}
                                      showLocation
                                      className="h-full min-h-0"
                                      onClick={() => onViewDetails(item.lesson)}
                                    />
                                  ) : (
                                    <EventCard
                                      event={item.event}
                                      compact
                                      gridSize={slotSize}
                                      onClick={() => onViewEventDetails(item.event)}
                                      className="h-full min-h-0"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}

// Daily View Component (Boxes Layout with Studio Columns)
function DailyView({
  currentDate,
  lessons,
  events,
  onViewDetails,
  onViewEventDetails,
  branchFilter,
}: {
  currentDate: Date;
  lessons: Lesson[];
  events: ScheduleEvent[];
  onViewDetails: (lesson: Lesson) => void;
  onViewEventDetails: (event: ScheduleEvent) => void;
  branchFilter: string;
}) {
  const visibleLessons = lessons.filter((l) => shouldShowLessonOnDate(l, currentDate));
  const dateStr = formatDateISO(currentDate);
  const dayEvents = events.filter(e => e.event_date === dateStr);
  const dailyEvents = dayEvents.filter(e => e.is_daily_event);
  const timedEvents = dayEvents.filter(e => !e.is_daily_event);
  
  // Get unique studios from lessons (only if a specific branch is selected)
  const studios: string[] = [];
  const useStudioLayout = branchFilter !== 'all';
  
  if (useStudioLayout) {
    const studioSet = new Set<string>();
    visibleLessons.forEach((lesson) => {
      if (lesson.room_name) {
        studioSet.add(lesson.room_name);
      }
    });
    // Sort alphabetically and take first 2
    const sortedStudios = Array.from(studioSet).sort();
    studios.push(...sortedStudios.slice(0, 2));
  }
  
  // Group lessons and timed events by hour and studio
  const lessonsByHourAndStudio: Record<number, Record<string, Lesson[]>> = {};
  const eventsByHour: Record<number, ScheduleEvent[]> = {};
  
  visibleLessons.forEach((lesson) => {
    const hour = parseInt(lesson.start_time.split(':')[0]);
    const studio = lesson.room_name || 'other';
    
    if (!lessonsByHourAndStudio[hour]) {
      lessonsByHourAndStudio[hour] = {};
    }
    if (!lessonsByHourAndStudio[hour][studio]) {
      lessonsByHourAndStudio[hour][studio] = [];
    }
    lessonsByHourAndStudio[hour][studio].push(lesson);
  });
  
  timedEvents.forEach((event) => {
    if (!event.start_time) return;
    const hour = parseInt(event.start_time.split(':')[0]);
    if (!eventsByHour[hour]) {
      eventsByHour[hour] = [];
    }
    eventsByHour[hour].push(event);
  });

  const hours = Array.from({ length: 13 }, (_, i) => i + 8); // 8-20

  return (
    <div className="space-y-4">
      {/* Daily Events Section */}
      {dailyEvents.length > 0 && (
        <div className="border rounded-lg bg-purple-50 p-4">
          <h3 className="font-semibold mb-2 text-sm">אירועים יומיים</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {dailyEvents.map(event => (
              <EventCard key={event.id} event={event} onClick={() => onViewEventDetails(event)} />
            ))}
          </div>
        </div>
      )}

      {/* Hourly Schedule */}
      <div className="border rounded-lg overflow-hidden bg-white">
        {useStudioLayout && studios.length > 0 ? (
          /* Studio-based layout (2 columns) */
          <>
            {/* Studio Headers */}
            <div className="flex border-b bg-gray-100">
              <div className="w-20 p-4 flex-shrink-0"></div>
              {studios.map((studio, idx) => (
                <div 
                  key={idx} 
                  className={`flex-1 p-4 font-semibold text-center ${
                    idx === 0 ? 'border-l border-r border-gray-300' : 'border-l'
                  }`}
                >
                  {studio}
                </div>
              ))}
            </div>
            
            {/* Hour Rows */}
            {hours.map((hour) => {
              const hourData = lessonsByHourAndStudio[hour] || {};
              const hourEvents = eventsByHour[hour] || [];
              
              return (
                <div key={hour} className="flex border-b last:border-b-0 bg-white">
                  {/* Hour Label */}
                  <div className="w-20 p-4 bg-gray-50 flex-shrink-0">
                    <div className="text-sm font-medium text-gray-600">
                      {hour.toString().padStart(2, '0')}:00
                    </div>
                  </div>
                  
                  {/* Studio Columns */}
                  {studios.map((studio, idx) => {
                    const studioLessons = hourData[studio] || [];
                    // Events are shown in first column only
                    const studioEvents = idx === 0 ? hourEvents : [];
                    
                    return (
                      <div 
                        key={idx} 
                        className={`flex-1 p-2 min-h-[80px] bg-white ${
                          idx === 0 ? 'border-l border-r border-gray-300' : 'border-l'
                        }`}
                      >
                        <div className="flex flex-wrap gap-2">
                          {studioLessons.map((lesson) => (
                            <ScheduleLessonCard
                              key={lesson.id}
                              lesson={lesson}
                              onClick={() => onViewDetails(lesson)}
                            />
                          ))}
                          {studioEvents.map((event) => (
                            <EventCard key={event.id} event={event} onClick={() => onViewEventDetails(event)} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        ) : (
          /* Default single column layout */
          hours.map((hour) => {
            const hourData = lessonsByHourAndStudio[hour] || {};
            const allHourLessons = Object.values(hourData).flat();
            const hourEvents = eventsByHour[hour] || [];
            
            return (
              <div key={hour} className="flex border-b last:border-b-0 bg-white">
                {/* Hour Label */}
                <div className="w-20 p-4 bg-gray-50 border-r flex-shrink-0">
                  <div className="text-sm font-medium text-gray-600">
                    {hour.toString().padStart(2, '0')}:00
                  </div>
                </div>
                
                {/* Content Container */}
                <div className="flex-1 p-2 min-h-[80px] bg-white">
                  <div className="flex flex-wrap gap-2">
                    {allHourLessons.map((lesson) => (
                      <ScheduleLessonCard
                        key={lesson.id}
                        lesson={lesson}
                        onClick={() => onViewDetails(lesson)}
                      />
                    ))}
                    {hourEvents.map((event) => (
                      <EventCard key={event.id} event={event} onClick={() => onViewEventDetails(event)} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Event Card for Schedule Views
function EventCard({
  event,
  onClick,
  compact = false,
  gridSize,
  studioLabel,
  className = '',
}: {
  event: ScheduleEvent;
  onClick?: () => void;
  compact?: boolean;
  gridSize?: 'xs' | 'sm' | 'md' | 'lg';
  studioLabel?: string;
  className?: string;
}) {
  const bgColor = event.color || '#9333ea';
  const timeLabel =
    !event.is_daily_event && event.start_time && event.end_time
      ? `${formatTime(event.start_time)}–${formatTime(event.end_time)}`
      : '';
  const titleLabel = [event.name, timeLabel, event.branch_name].filter(Boolean).join(' · ');

  if (compact) {
    if (gridSize === 'xs') {
      return (
        <div
          onClick={onClick}
          title={titleLabel}
          className={`rounded-md border-2 px-1.5 py-1 h-full min-h-0 flex items-center transition-all ${
            onClick ? 'cursor-pointer hover:shadow-md' : ''
          } ${className}`}
          style={{ backgroundColor: `${bgColor}18`, borderColor: bgColor }}
        >
          <div className="min-w-0 flex-1 text-[10px] font-semibold truncate leading-tight" style={{ color: bgColor }}>
            {event.name}
          </div>
          {event.is_studio_rental ? (
            <span className="shrink-0 mr-1 text-[8px] font-semibold bg-amber-100 text-amber-900 px-1 rounded">
              שכ׳
            </span>
          ) : null}
        </div>
      );
    }

    if (gridSize === 'sm') {
      return (
        <div
          onClick={onClick}
          title={titleLabel}
          className={`rounded-md border-2 px-2 py-1 h-full min-h-0 flex flex-col justify-center gap-0.5 transition-all ${
            onClick ? 'cursor-pointer hover:shadow-md' : ''
          } ${className}`}
          style={{ backgroundColor: `${bgColor}18`, borderColor: bgColor }}
        >
          <div className="text-[10px] font-semibold truncate leading-tight" style={{ color: bgColor }}>
            {event.name}
          </div>
          {timeLabel ? (
            <div className="text-[9px] text-gray-500 tabular-nums truncate">{timeLabel}</div>
          ) : null}
        </div>
      );
    }

    if (gridSize === 'md') {
      return (
        <div
          onClick={onClick}
          title={titleLabel}
          className={`rounded-md border-2 px-2 py-1.5 h-full min-h-0 flex flex-col transition-all ${
            onClick ? 'cursor-pointer hover:shadow-md' : ''
          } ${className}`}
          style={{ backgroundColor: `${bgColor}18`, borderColor: bgColor }}
        >
          <div className="flex items-start justify-between gap-1 min-w-0">
            <div className="text-[10px] font-semibold truncate leading-tight" style={{ color: bgColor }}>
              {event.name}
            </div>
            {event.is_studio_rental ? (
              <span className="shrink-0 text-[8px] font-semibold bg-amber-100 text-amber-900 px-1 rounded">
                שכירות
              </span>
            ) : null}
          </div>
          {timeLabel ? (
            <div className="mt-auto text-[9px] text-gray-500 tabular-nums">{timeLabel}</div>
          ) : null}
        </div>
      );
    }

    return (
      <div
        onClick={onClick}
        title={titleLabel}
        className={`rounded-md border-2 px-2.5 py-2 h-full min-h-0 flex flex-col transition-all ${
          onClick ? 'cursor-pointer hover:shadow-md' : ''
        } ${className}`}
        style={{
          backgroundColor: `${bgColor}18`,
          borderColor: bgColor,
        }}
      >
        {studioLabel || event.is_studio_rental ? (
          <div className="flex items-center justify-between gap-1.5 mb-1 min-w-0">
            {studioLabel ? (
              <div className="text-[10px] font-medium truncate min-w-0" style={{ color: bgColor }}>
                {studioLabel}
              </div>
            ) : (
              <span />
            )}
            {event.is_studio_rental ? (
              <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-900 px-1 py-0.5 rounded">
                שכירות
              </span>
            ) : null}
          </div>
        ) : null}
        <div
          className="font-semibold text-xs leading-snug line-clamp-2 min-w-0"
          style={{ color: bgColor }}
          title={event.name}
        >
          {event.name}
        </div>
        {!event.is_daily_event && event.start_time && event.end_time ? (
          <div className="mt-auto text-[10px] text-gray-600 tabular-nums">
            {timeLabel}
          </div>
        ) : null}
        {event.branch_name && !studioLabel ? (
          <div className="text-[10px] text-gray-500 truncate mt-0.5">{event.branch_name}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className="p-2 rounded-md border-2 cursor-pointer transition-all hover:shadow-md"
      style={{ 
        backgroundColor: `${bgColor}20`,
        borderColor: bgColor,
      }}
    >
      <div className="flex items-center gap-1 flex-wrap">
        {event.is_studio_rental && (
          <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">
            שכירות
          </span>
        )}
        <span className="text-xs">📅</span>
        <div className="font-medium text-xs truncate" style={{ color: bgColor }}>
          {event.name}
        </div>
      </div>
      {!event.is_daily_event && event.start_time && event.end_time && (
        <div className="text-xs text-gray-600 mt-0.5">
          {formatTime(event.start_time)}-{formatTime(event.end_time)}
        </div>
      )}
      {event.location && (
        <div className="text-xs text-gray-500 truncate mt-0.5">
          📍 {event.location}
        </div>
      )}
      {event.branch_name && (
        <div className="text-xs text-gray-500 truncate">
          סניף: {event.branch_name}
        </div>
      )}
    </div>
  );
}
