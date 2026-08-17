'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getDayName, formatTimeRange } from '@/lib/courseUtils';
import type { Course, CourseLesson, CourseBundle } from '../types';
import { isLessonVisibleInCatalog } from '../lessonVisibility';
import styles from './CourseList.module.css';

interface CourseListProps {
  filteredCourses: Course[];
  onSelect: (course: Course, bundle?: CourseBundle, lesson?: CourseLesson) => void;
}

interface CourseRow {
  course: Course;
  lesson: CourseLesson | null;
  bundle: CourseBundle | null;
}

function rowSortKey(row: CourseRow): { day: number; time: string; type: string; name: string } {
  const lesson = row.lesson ?? row.bundle?.lessons[0];
  return {
    day: lesson?.day_of_week ?? 99,
    time: lesson?.start_time ?? '',
    type: row.course.course_type_name || '',
    name: row.course.name,
  };
}

function buildRows(courses: Course[]): CourseRow[] {
  const rows: CourseRow[] = [];

  for (const course of courses) {
    const bundles = course.bundles ?? [];

    if (course.lessons && course.lessons.length > 0) {
      for (const lesson of course.lessons) {
        if (!isLessonVisibleInCatalog(lesson)) continue;
        rows.push({ course, lesson, bundle: null });
      }
    } else if (bundles.length === 0) {
      rows.push({ course, lesson: null, bundle: null });
    }

    for (const bundle of bundles) {
      rows.push({ course, lesson: null, bundle });
    }
  }

  rows.sort((a, b) => {
    const keyA = rowSortKey(a);
    const keyB = rowSortKey(b);
    if (keyA.day !== keyB.day) return keyA.day - keyB.day;
    const timeCmp = keyA.time.localeCompare(keyB.time);
    if (timeCmp !== 0) return timeCmp;
    const typeCmp = keyA.type.localeCompare(keyB.type, 'he');
    if (typeCmp !== 0) return typeCmp;
    return keyA.name.localeCompare(keyB.name, 'he');
  });

  return rows;
}

function scheduleLines(lesson: CourseLesson | null, bundle: CourseBundle | null): { days: string; times: string; isBundle: boolean } {
  if (bundle?.lessons?.length) {
    const dayParts = bundle.lessons.map((bl) => getDayName(bl.day_of_week));
    const timeParts = bundle.lessons.map((bl) => formatTimeRange(bl.start_time, bl.end_time));
    const uniqueTimes = [...new Set(timeParts)];
    return {
      days: dayParts.join(' / '),
      times: uniqueTimes.length === 1 ? uniqueTimes[0] : timeParts.join(' / '),
      isBundle: true,
    };
  }
  if (lesson) {
    return {
      days: getDayName(lesson.day_of_week),
      times: formatTimeRange(lesson.start_time, lesson.end_time),
      isBundle: false,
    };
  }
  return { days: '—', times: '', isBundle: false };
}

function timesPerWeek(row: CourseRow): number {
  if (row.bundle?.lessons?.length) return row.bundle.lessons.length;
  if (row.lesson) return 1;
  return 0;
}

function CourseRowItem({
  row,
  index,
  onSelect,
}: {
  row: CourseRow;
  index: number;
  onSelect: CourseListProps['onSelect'];
}) {
  const { course, lesson, bundle } = row;
  const schedule = scheduleLines(lesson, bundle);

  return (
    <div
      key={`${course.id}-${bundle?.id ?? lesson?.id ?? index}`}
      role="listitem"
      className={styles.row}
      onClick={() => onSelect(course, bundle ?? undefined, lesson ?? undefined)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(course, bundle ?? undefined, lesson ?? undefined);
        }
      }}
      tabIndex={0}
    >
      <div className={styles.nameZone}>
        <span className={styles.bullet} aria-hidden="true" />
        <span className={styles.courseName}>{course.name}</span>
      </div>
      <div className={styles.divider} />
      <div className={styles.slotZone}>
        <div className={styles.scheduleGroup}>
          <div className={`${styles.lessonSlot} ${schedule.isBundle ? styles.lessonSlotBundle : ''}`}>
            <span className={styles.lessonDay}>{schedule.days}</span>
            {schedule.times ? (
              <span className={styles.lessonTime} dir="ltr">
                {schedule.times}
              </span>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          className={styles.expandBtn}
          aria-label={`פרטי קורס — ${course.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(course, bundle ?? undefined, lesson ?? undefined);
          }}
          tabIndex={-1}
        >
          <ChevronDown size={16} color="#2B3090" />
        </button>
      </div>
    </div>
  );
}

function TrackSection({
  title,
  subtitle,
  rows,
  onSelect,
}: {
  title: string;
  subtitle: string;
  rows: CourseRow[];
  onSelect: CourseListProps['onSelect'];
}) {
  if (rows.length === 0) return null;
  return (
    <section className={styles.section} aria-label={title}>
      <div className={styles.trackHeader}>
        <h3 className={styles.trackTitle}>{title}</h3>
        <p className={styles.trackSubtitle}>{subtitle}</p>
      </div>
      <div role="list" className={styles.sectionList}>
        {rows.map((row, index) => (
          <CourseRowItem
            key={`${row.course.id}-${row.bundle?.id ?? row.lesson?.id ?? index}`}
            row={row}
            index={index}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}

const CHOOSE_DAYS_COPY = 'בחרו את הימים והשעות שמתאימים לכם';

export function CourseList({ filteredCourses, onSelect }: CourseListProps) {
  const rows = buildRows(filteredCourses);
  const threeAWeek = rows.filter((row) => timesPerWeek(row) >= 3);
  const twiceAWeek = rows.filter((row) => timesPerWeek(row) === 2);
  const onceAWeek = rows.filter((row) => timesPerWeek(row) <= 1);
  const [onceAWeekOpen, setOnceAWeekOpen] = useState(threeAWeek.length === 0 && twiceAWeek.length === 0);

  return (
    <div className={styles.list}>
      <TrackSection
        title="מסלולים לשלוש פעמים בשבוע"
        subtitle={CHOOSE_DAYS_COPY}
        rows={threeAWeek}
        onSelect={onSelect}
      />
      <TrackSection
        title="מסלולים לפעמיים בשבוע"
        subtitle={CHOOSE_DAYS_COPY}
        rows={twiceAWeek}
        onSelect={onSelect}
      />

      {onceAWeek.length > 0 ? (
        <section className={styles.section} aria-label="מעדיפים להגיע פעם בשבוע?">
          {(threeAWeek.length > 0 || twiceAWeek.length > 0) ? (
            <div className={styles.sectionDivider} aria-hidden="true" />
          ) : null}
          <div className={styles.trackHeader}>
            <h3 className={styles.trackTitle}>מעדיפים להגיע פעם בשבוע?</h3>
            <button
              type="button"
              className={styles.onceCta}
              onClick={() => setOnceAWeekOpen((open) => !open)}
              aria-expanded={onceAWeekOpen}
            >
              הצגת רשימה מסלולים לפעם בשבוע
              <ChevronDown
                size={16}
                className={`${styles.onceCtaChevron} ${onceAWeekOpen ? styles.onceCtaChevronOpen : ''}`}
              />
            </button>
          </div>
          {onceAWeekOpen ? (
            <div role="list" className={styles.sectionList}>
              {onceAWeek.map((row, index) => (
                <CourseRowItem
                  key={`${row.course.id}-${row.lesson?.id ?? index}`}
                  row={row}
                  index={index}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
