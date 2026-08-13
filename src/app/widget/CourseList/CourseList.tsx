'use client';

import { Fragment } from 'react';
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

export function CourseList({ filteredCourses, onSelect }: CourseListProps) {
  const rows = buildRows(filteredCourses);

  return (
    <div role="list" className={styles.list}>
      {rows.map(({ course, lesson, bundle }, index) => (
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
            {course.course_type_name ? (
              <span className={styles.courseType}>{course.course_type_name}</span>
            ) : null}
            {bundle ? (
              <span className={styles.bundleBadge}>{bundle.name || 'פעמיים בשבוע'}</span>
            ) : null}
          </div>
          <div className={styles.divider} />
          <div className={styles.slotZone}>
            {bundle ? (
              <div className={styles.lessonSlotStack}>
                {bundle.lessons.map((bl, i) => (
                  <Fragment key={bl.id}>
                    {i > 0 ? <span className={styles.slotConnector} aria-hidden="true">+</span> : null}
                    <div className={styles.lessonSlot}>
                      <span className={styles.lessonDay}>{getDayName(bl.day_of_week)}</span>
                      <span className={styles.lessonTime} dir="ltr">
                        {formatTimeRange(bl.start_time, bl.end_time)}
                      </span>
                    </div>
                  </Fragment>
                ))}
              </div>
            ) : (
              <div className={styles.lessonSlot}>
                {lesson ? (
                  <>
                    <span className={styles.lessonDay}>{getDayName(lesson.day_of_week)}</span>
                    <span className={styles.lessonTime} dir="ltr">
                      {formatTimeRange(lesson.start_time, lesson.end_time)}
                    </span>
                  </>
                ) : (
                  <span className={styles.lessonDay}>—</span>
                )}
              </div>
            )}

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
      ))}
    </div>
  );
}
