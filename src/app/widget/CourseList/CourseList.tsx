'use client';

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

function scheduleLines(lesson: CourseLesson | null, bundle: CourseBundle | null): { days: string; times: string } {
  if (bundle?.lessons?.length) {
    return {
      days: bundle.lessons.map((bl) => getDayName(bl.day_of_week)).join(' / '),
      times: bundle.lessons.map((bl) => formatTimeRange(bl.start_time, bl.end_time)).join(' / '),
    };
  }
  if (lesson) {
    return {
      days: getDayName(lesson.day_of_week),
      times: formatTimeRange(lesson.start_time, lesson.end_time),
    };
  }
  return { days: '—', times: '' };
}

export function CourseList({ filteredCourses, onSelect }: CourseListProps) {
  const rows = buildRows(filteredCourses);

  return (
    <div role="list" className={styles.list}>
      {rows.map(({ course, lesson, bundle }, index) => {
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
            <div className={styles.lessonSlot}>
              <span className={styles.lessonDay}>{schedule.days}</span>
              {schedule.times ? (
                <span className={styles.lessonTime} dir="ltr">
                  {schedule.times}
                </span>
              ) : null}
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
      })}
    </div>
  );
}
