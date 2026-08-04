'use client';

import { ChevronDown } from 'lucide-react';
import { getDayName, formatTimeRange } from '@/lib/courseUtils';
import type { Course, CourseLesson } from '../types';
import { isLessonVisibleInCatalog } from '../lessonVisibility';
import styles from './CourseList.module.css';

interface CourseListProps {
  filteredCourses: Course[];
  onSelect: (course: Course, lesson: CourseLesson) => void;
}

interface CourseRow {
  course: Course;
  lesson: CourseLesson;
}

function buildRows(courses: Course[]): CourseRow[] {
  const rows: CourseRow[] = [];

  for (const course of courses) {
    for (const lesson of course.lessons ?? []) {
      if (!isLessonVisibleInCatalog(lesson)) continue;
      rows.push({ course, lesson });
    }
  }

  rows.sort((a, b) => {
    if (a.lesson.day_of_week !== b.lesson.day_of_week) {
      return a.lesson.day_of_week - b.lesson.day_of_week;
    }
    const timeCmp = a.lesson.start_time.localeCompare(b.lesson.start_time);
    if (timeCmp !== 0) return timeCmp;
    const typeCmp = (a.course.course_type_name || '').localeCompare(b.course.course_type_name || '', 'he');
    if (typeCmp !== 0) return typeCmp;
    return a.course.name.localeCompare(b.course.name, 'he');
  });

  return rows;
}

export function CourseList({ filteredCourses, onSelect }: CourseListProps) {
  const rows = buildRows(filteredCourses);

  return (
    <div role="list" className={styles.list}>
      {rows.map(({ course, lesson }) => (
        <div
          key={`${course.id}-${lesson.id}`}
          role="listitem"
          className={styles.row}
          onClick={() => onSelect(course, lesson)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(course, lesson);
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
          </div>
          <div className={styles.divider} />
          <div className={styles.slotZone}>
            <div className={styles.lessonSlot}>
              <span className={styles.lessonDay}>{getDayName(lesson.day_of_week)}</span>
              <span className={styles.lessonTime} dir="ltr">
                {formatTimeRange(lesson.start_time, lesson.end_time)}
              </span>
            </div>

            <button
              type="button"
              className={styles.expandBtn}
              aria-label={`פרטי קורס — ${course.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(course, lesson);
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
