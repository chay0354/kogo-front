'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lesson, ScheduleEvent } from '@/types/schedule';
import { formatDateISO, formatTime } from '@/lib/scheduleUtils';
import {
  eventLayerKey,
  layerColor,
  layoutOverlaps,
  lessonLayerKey,
  timeToMinutes,
  type CalendarLayer,
  type LayerDimension,
} from './calendarLayers';
import styles from './theme/calendar.module.css';

export type CalendarItem =
  | { kind: 'lesson'; id: string; lesson: Lesson }
  | { kind: 'event'; id: string; event: ScheduleEvent };

type Props = {
  days: Date[];
  lessons: Lesson[];
  events: ScheduleEvent[];
  dimension: LayerDimension;
  layers: CalendarLayer[];
  onSelectLesson: (lesson: Lesson) => void;
  onSelectEvent: (event: ScheduleEvent) => void;
  /** Pixels per hour. The phone gets a shorter hour; the maths and the CSS read
      the same number so the two can never drift. */
  hourPx: number;
};

/** A lesson runs at least this long on the grid, so a 20-minute slot stays clickable. */
const MIN_MINUTES = 30;

function itemBounds(item: CalendarItem) {
  const start = item.kind === 'lesson' ? item.lesson.start_time : item.event.start_time;
  const end = item.kind === 'lesson' ? item.lesson.end_time : item.event.end_time;
  const startMin = timeToMinutes(start || '00:00');
  const endMin = Math.max(timeToMinutes(end || start || '00:00'), startMin + MIN_MINUTES);
  return { startMin, endMin };
}

/**
 * The week as a time grid.
 *
 * One hour range is computed for every day on screen rather than per day, so a
 * row of chips at 09:00 lines up straight across the week — that alignment is
 * the whole reason to draw a grid instead of a list, and it is the first thing
 * that breaks when each column scales itself.
 */
export default function CalendarGrid({
  days,
  lessons,
  events,
  dimension,
  layers,
  onSelectLesson,
  onSelectEvent,
  hourPx,
}: Props) {
  const colorFor = useMemo(() => {
    const map = new Map<string, number>();
    layers.forEach((layer) => map.set(layer.key, layer.colorIndex));
    return map;
  }, [layers]);

  const initialsFor = useMemo(() => {
    const map = new Map<string, string>();
    layers.forEach((layer) => map.set(layer.key, layer.initials));
    return map;
  }, [layers]);

  const byDay = useMemo(() => {
    const buckets = days.map(() => [] as CalendarItem[]);
    const indexOf = new Map<string, number>();
    days.forEach((day, index) => indexOf.set(formatDateISO(day), index));

    for (const lesson of lessons) {
      const index = lesson.lesson_date ? indexOf.get(lesson.lesson_date) : undefined;
      if (index !== undefined) buckets[index].push({ kind: 'lesson', id: lesson.id, lesson });
    }
    for (const event of events) {
      if (event.is_daily_event) continue;
      const index = indexOf.get(event.event_date);
      if (index !== undefined) buckets[index].push({ kind: 'event', id: event.id, event });
    }
    return buckets;
  }, [days, lessons, events]);

  const dailyByDay = useMemo(() => {
    const buckets = days.map(() => [] as ScheduleEvent[]);
    const indexOf = new Map<string, number>();
    days.forEach((day, index) => indexOf.set(formatDateISO(day), index));
    for (const event of events) {
      if (!event.is_daily_event) continue;
      const index = indexOf.get(event.event_date);
      if (index !== undefined) buckets[index].push(event);
    }
    return buckets;
  }, [days, events]);

  const { startHour, endHour } = useMemo(() => {
    let earliest = Infinity;
    let latest = -Infinity;
    byDay.forEach((items) =>
      items.forEach((item) => {
        const { startMin, endMin } = itemBounds(item);
        earliest = Math.min(earliest, startMin);
        latest = Math.max(latest, endMin);
      }),
    );
    if (!Number.isFinite(earliest)) return { startHour: 8, endHour: 20 };
    return {
      startHour: Math.max(0, Math.floor(earliest / 60)),
      endHour: Math.min(24, Math.max(Math.floor(earliest / 60) + 1, Math.ceil(latest / 60))),
    };
  }, [byDay]);

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    [startHour, endHour],
  );

  // The red line only means anything on a day that is on screen, and only
  // while the clock is inside the range the grid actually draws.
  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setNowMin(now.getHours() * 60 + now.getMinutes());
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const didScroll = useRef(false);
  useEffect(() => {
    // Open on the working day, not on midnight — but only once, so a filter
    // change does not yank the office back off whatever it was reading.
    const el = scrollerRef.current;
    if (!el || didScroll.current || byDay.every((items) => items.length === 0)) return;
    didScroll.current = true;
    const target = Math.max(0, (Math.max(startHour, 8) - startHour) * hourPx - 12);
    el.scrollTop = target;
  }, [byDay, startHour, hourPx]);

  const gridHeight = (endHour - startHour) * hourPx;
  const today = new Date().toDateString();

  return (
    <div className={styles.board}>
      <div className={styles.scroller} ref={scrollerRef}>
        <div
          className={styles.canvas}
          style={{
            gridTemplateColumns: `var(--kg-gutter) repeat(${days.length}, minmax(0, 1fr))`,
          }}
        >
          <div className={styles.gutterHead} />
          {days.map((day, index) => {
            const isToday = day.toDateString() === today;
            return (
              <div
                key={index}
                className={`${styles.headCell} ${isToday ? styles.headToday : ''}`}
              >
                <div className={styles.headDay}>
                  {day.toLocaleDateString('he-IL', { weekday: 'long' })}
                </div>
                {isToday ? (
                  <div className={styles.todayPip}>
                    {day.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}
                  </div>
                ) : (
                  <div className={styles.headDate}>
                    {day.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}
                  </div>
                )}
                {dailyByDay[index].length > 0 ? (
                  <div className={styles.headDate}>
                    {dailyByDay[index].length} אירועי יום
                  </div>
                ) : null}
              </div>
            );
          })}

          <div className={styles.gutter} style={{ height: gridHeight }}>
            {/* The last mark would sit on the grid's bottom edge with nothing
                under it, and the first is pinned rather than centred so the
                opening hour is not half cut off by the header above it. */}
            {hours.slice(0, -1).map((hour, index) => (
              <div
                key={hour}
                className={`${styles.gutterMark} ${index === 0 ? styles.gutterFirst : ''}`}
                style={{ top: (hour - startHour) * hourPx }}
              >
                <span className={styles.time}>{String(hour).padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>

          {days.map((day, index) => {
            const items = byDay[index];
            const placed = layoutOverlaps(items, itemBounds);
            const isToday = day.toDateString() === today;
            const showNow =
              isToday && nowMin != null && nowMin >= startHour * 60 && nowMin <= endHour * 60;

            return (
              <div
                key={index}
                className={`${styles.dayCol} ${isToday ? styles.todayCol : ''}`}
                style={{ height: gridHeight }}
              >
                {hours.slice(0, -1).map((hour) => (
                  <div key={hour}>
                    <div
                      className={styles.hourLine}
                      style={{ top: (hour - startHour) * hourPx }}
                    />
                    <div
                      className={`${styles.hourLine} ${styles.halfLine}`}
                      style={{ top: (hour - startHour) * hourPx + hourPx / 2 }}
                    />
                  </div>
                ))}

                {items.length === 0 ? <div className={styles.empty}>—</div> : null}

                {showNow ? (
                  <div
                    className={styles.nowLine}
                    style={{ top: ((nowMin! - startHour * 60) / 60) * hourPx }}
                    aria-hidden
                  >
                    <span className={styles.nowDot} />
                  </div>
                ) : null}

                {placed.map(({ item, startMin, endMin, lane, lanes }) => {
                  const top = ((startMin - startHour * 60) / 60) * hourPx;
                  const height = Math.max(24, ((endMin - startMin) / 60) * hourPx - 2);
                  const width = 100 / lanes;

                  return (
                    <div
                      key={`${item.kind}-${item.id}`}
                      className={styles.slot}
                      style={{
                        top,
                        height,
                        insetInlineStart: `${lane * width}%`,
                        width: `${width}%`,
                      }}
                    >
                      <Chip
                        item={item}
                        height={height}
                        dimension={dimension}
                        layers={layers}
                        colorFor={colorFor}
                        initialsFor={initialsFor}
                        onSelectLesson={onSelectLesson}
                        onSelectEvent={onSelectEvent}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Chip({
  item,
  height,
  dimension,
  layers,
  colorFor,
  initialsFor,
  onSelectLesson,
  onSelectEvent,
}: {
  item: CalendarItem;
  height: number;
  dimension: LayerDimension;
  layers: CalendarLayer[];
  colorFor: Map<string, number>;
  initialsFor: Map<string, string>;
  onSelectLesson: (lesson: Lesson) => void;
  onSelectEvent: (event: ScheduleEvent) => void;
}) {
  const isLesson = item.kind === 'lesson';
  const key = isLesson
    ? lessonLayerKey(item.lesson, dimension)
    : eventLayerKey(item.event, dimension, layers);

  const color = layerColor(colorFor.get(key) ?? 0);
  const badge = initialsFor.get(key) ?? '';
  const isRental = !isLesson && Boolean(item.event.is_studio_rental);

  const start = isLesson ? item.lesson.start_time : item.event.start_time;
  const end = isLesson ? item.lesson.end_time : item.event.end_time;
  const timeLabel = start && end ? `${formatTime(start)}–${formatTime(end)}` : '';

  const title = isLesson ? item.lesson.course_name || '—' : item.event.name;
  const where = isLesson
    ? [item.lesson.room_name, item.lesson.branch_name].filter(Boolean).join(' · ')
    : [item.event.studio_name, item.event.branch_name].filter(Boolean).join(' · ');

  const capacity = isLesson ? item.lesson.room_capacity || 20 : 0;
  const cancelled = isLesson && item.lesson.status === 'cancelled';

  // Chips are read at four heights. Below ~44px only one line survives, so the
  // order below is what to drop first, not a set of separate layouts.
  const showMeta = height >= 62;
  const showFoot = height >= 44;

  const tooltip = [
    isRental ? 'שכירות סטודיו' : null,
    title,
    timeLabel,
    where,
    isLesson ? `${item.lesson.enrollment_count}/${capacity} תלמידים` : null,
    isLesson ? item.lesson.instructor_name : item.event.renter_name,
    cancelled ? 'שיעור מבוטל' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      title={tooltip}
      aria-label={tooltip}
      onClick={() => (isLesson ? onSelectLesson(item.lesson) : onSelectEvent(item.event))}
      className={`${styles.chip} ${isRental ? styles.rental : ''} ${
        cancelled ? styles.cancelled : ''
      }`}
      style={
        {
          '--chip-base': color.base,
          '--chip-ink': color.ink,
          '--chip-tint': color.tint,
        } as React.CSSProperties
      }
    >
      <span className={styles.chipTop}>
        {badge ? <span className={styles.chipBadge}>{badge}</span> : null}
        <span className={styles.chipTitle}>{title}</span>
      </span>

      {showMeta && where ? <span className={styles.chipMeta}>{where}</span> : null}

      {showFoot ? (
        <span className={styles.chipFoot}>
          {timeLabel ? <span className={styles.time}>{timeLabel}</span> : null}
          {isRental ? <span className={styles.rentalTag}>שכירות</span> : null}
          {isLesson ? (
            <span className={styles.count}>
              {item.lesson.enrollment_count}/{capacity}
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}
