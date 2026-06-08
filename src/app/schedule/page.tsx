'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import LessonDetailsDialog from '@/components/dialogs/LessonDetailsDialog';
import EventDialog from '@/components/dialogs/EventDialog';
import EventDetailsDialog from '@/components/dialogs/EventDetailsDialog';
import { Lesson, LessonFilters, ScheduleEvent } from '@/types/schedule';
import { fetchLessons, getWeekDates, formatDateISO, groupLessonsByDate, formatTime } from '@/lib/scheduleUtils';
import { fetchEvents } from '@/lib/eventUtils';
import { useAuth } from '@/components/AuthProvider';
import { RefreshCw, Plus, ChevronRight, ChevronLeft, Calendar as CalendarIcon, LogOut } from 'lucide-react';
import api, { fetchInstructorsDropdown } from '@/lib/api';

type Branch = {
  id: string;
  name: string;
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

export default function SchedulePage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const isManager = user?.role === 'manager';
  const isWorker = user?.role === 'worker';
  
  // Workers are forced to daily view
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly'>(isWorker ? 'daily' : 'weekly');
  
  // Filters
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [cityFilter, setCityFilter] = useState<string>('all');
  const [instructorFilter, setInstructorFilter] = useState<string>('all');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  
  // Dialog
  const [detailsDialogLessonId, setDetailsDialogLessonId] = useState<string | null>(null);
  const [detailsDialogOccurrenceDate, setDetailsDialogOccurrenceDate] = useState<string | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);

  const { start, end, dates } = getWeekDates(currentDate);

  useEffect(() => {
    if (isManager) {
      loadFilters();
    }
  }, [isManager]);

  useEffect(() => {
    loadLessons();
  }, [currentDate, branchFilter, cityFilter, instructorFilter, activeTab]);

  const loadFilters = async () => {
    try {
      // Load branches
      const branchRes = await api.get('/core/branches/?simple=true');
      const branchData = branchRes.data;
      const branchList: Branch[] = Array.isArray(branchData)
        ? branchData
        : Array.isArray(branchData?.results)
          ? branchData.results
          : [];
      setBranches(branchList);

      // Load cities
      const cityRes = await api.get('/core/cities/');
      const cityData = cityRes.data;
      const cityList: City[] = Array.isArray(cityData)
        ? cityData
        : Array.isArray(cityData?.results)
          ? cityData.results
          : [];
      setCities(cityList);

      // Load instructors
      const instructorList = await fetchInstructorsDropdown();
      setInstructors(instructorList);
    } catch (err) {
      console.error('Error loading filters:', err);
    }
  };

  const loadLessons = async () => {
    setIsLoading(true);
    setError('');

    try {
      const filters: LessonFilters = {
        start_date: activeTab === 'daily' ? formatDateISO(currentDate) : formatDateISO(start),
        end_date: activeTab === 'daily' ? formatDateISO(currentDate) : formatDateISO(end),
      };

      if (branchFilter !== 'all') {
        filters.branch_id = branchFilter;
      }

      if (cityFilter !== 'all') {
        filters.city_id = cityFilter;
      }

      if (instructorFilter !== 'all') {
        filters.instructor_id = instructorFilter;
      }

      // Fetch lessons and events in parallel
      const [lessonsData, eventsData] = await Promise.all([
        fetchLessons(filters),
        fetchEvents({
          start_date: filters.start_date,
          end_date: filters.end_date,
          branch_id: branchFilter !== 'all' ? branchFilter : undefined,
          city_id: cityFilter !== 'all' ? cityFilter : undefined,
        }),
      ]);

      setLessons(lessonsData);
      setEvents(isWorker ? eventsData.filter((e) => !e.is_studio_rental) : eventsData);
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
      <div className="flex flex-col gap-6 p-6" dir="rtl">
        {/* Header */}
        <div className="h-14 flex items-center justify-between">
          <h1 className="text-3xl font-bold">לוח זמנים</h1>
          <div className="flex gap-2">
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
          <div className="flex items-center gap-4">
            <button
              onClick={handlePrevious}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            <div className="font-medium text-lg">{dateDisplay}</div>

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

            {/* Filters (Manager Only) */}
            {isManager && (
              <>
                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="w-48 px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="all">כל הסניפים</option>
                  {branches.map((branch: any) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>

                <select
                  value={cityFilter}
                  onChange={(e) => setCityFilter(e.target.value)}
                  className="w-48 px-3 py-2 border rounded-lg text-sm"
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
                  className="w-48 px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="all">כל המדריכים</option>
                  {instructors.map((instructor: any) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.first_name} {instructor.last_name}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

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

// Weekly View Component with Hour Labels
function WeeklyView({
  weekDates,
  lessonsByDay,
  events,
  onViewDetails,
  onViewEventDetails,
}: {
  weekDates: Date[];
  lessonsByDay: Record<number, Lesson[]>;
  events: ScheduleEvent[];
  onViewDetails: (lesson: Lesson) => void;
  onViewEventDetails: (event: ScheduleEvent) => void;
}) {
  const workDays = weekDates.slice(0, 6); // Sunday to Friday

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

  return (
    <div className="flex gap-2">
      {/* Days Grid */}
      <div className="grid grid-cols-6 gap-2 flex-1">
        {workDays.map((date, index) => {
          const dayLessons = (lessonsByDay[index] || []).filter((l) => shouldShowLessonOnDate(l, date));
          const dayEventData = eventsByDay[index] || { daily: [], timed: [] };
          const isToday = new Date().toDateString() === date.toDateString();
          const hasContent = dayLessons.length > 0 || dayEventData.daily.length > 0 || dayEventData.timed.length > 0;

          return (
            <div key={index} className="flex flex-col">
              {/* Day Header */}
               <div
                 className={`font-bold p-2 rounded-t text-center h-12 flex items-center justify-center bg-gray-100 ${
                   isToday ? 'bg-gray-300/70 ring-1 ring-gray-300 ring-inset' : ''
                 }`}
               >
                {date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' })}
              </div>

              {/* Daily Events (at top) */}
              {dayEventData.daily.length > 0 && (
                <div className="bg-purple-50 border-x border-t p-2 space-y-1">
                  {dayEventData.daily.map(event => (
                    <EventCard key={event.id} event={event} onClick={() => onViewEventDetails(event)} />
                  ))}
                </div>
              )}

              {/* Day Content (single stacked list, consistent gaps) */}
              <div className="border rounded-b bg-white px-2 pb-2 pt-3 min-h-[400px]">
                <div className="flex flex-col gap-2">
                  {[
                    ...dayLessons.map((lesson) => ({
                      kind: 'lesson' as const,
                      start: lesson.start_time || '00:00:00',
                      id: lesson.id,
                      lesson,
                    })),
                    ...dayEventData.timed.map((event) => ({
                      kind: 'event' as const,
                      start: event.start_time || '00:00:00',
                      id: event.id,
                      event,
                    })),
                  ]
                    .sort((a, b) => a.start.localeCompare(b.start))
                    .map((item) =>
                      item.kind === 'lesson' ? (
                        <LessonCardCompact
                          key={`lesson-${item.id}`}
                          lesson={item.lesson}
                          onClick={() => onViewDetails(item.lesson)}
                        />
                      ) : (
                        <EventCard
                          key={`event-${item.id}`}
                          event={item.event}
                          onClick={() => onViewEventDetails(item.event)}
                        />
                      )
                    )}
                </div>
              </div>
            </div>
          );
        })}
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
                            <LessonCardCompact
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
                      <LessonCardCompact
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

// Compact Lesson Card for Weekly and Daily Views
function LessonCardCompact({ lesson, onClick }: { lesson: Lesson; onClick: () => void }) {
  const isCancelled = lesson.status === 'cancelled';

  return (
    <div
      onClick={onClick}
      className={`px-2 py-2 rounded-md border border-primary/30 cursor-pointer transition-all hover:shadow-md bg-primary/10 ${
        isCancelled ? 'opacity-50 line-through' : ''
      }`}
    >
      <div className="font-medium text-xs truncate">{lesson.course_type_name}</div>
      <div className="text-xs text-gray-600">{formatTime(lesson.start_time)}-{formatTime(lesson.end_time)}</div>
      <div className="text-xs truncate">{lesson.instructor_name}</div>
      <div className="text-xs text-gray-500 truncate">סניף: {lesson.branch_name}</div>
      <div>
        <span className="inline-block px-1.5 py-0.5 bg-gray-200 rounded text-xs">
          {lesson.enrollment_count}/{lesson.room_capacity || 20}
        </span>
      </div>
    </div>
  );
}

// Event Card for Schedule Views
function EventCard({ event, onClick }: { event: ScheduleEvent; onClick?: () => void }) {
  const bgColor = event.color || '#9333ea';
  
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
