'use client';

import { ChevronDown } from 'lucide-react';
import { getDayName, formatTimeRange } from '@/lib/courseUtils';
import type { Course, CourseLesson } from '../types';
import styles from './CourseList.module.css';

interface CourseListProps {
  filteredCourses: Course[];
  onSelect: (course: Course) => void;
}

interface CourseRow {
  course: Course;
  lesson: CourseLesson | null;
}

function buildRows(courses: Course[]): CourseRow[] {
  const rows: CourseRow[] = [];
  for (const course of courses) {
    if (course.lessons && course.lessons.length > 0) {
      for (const lesson of course.lessons) {
        rows.push({ course, lesson });
      }
    } else {
      rows.push({ course, lesson: null });
    }
  }
  return rows;
}

export function CourseList({ filteredCourses, onSelect }: CourseListProps) {
  const rows = buildRows(filteredCourses);

  return (
    <div role="list" className={styles.list}>
      {rows.map(({ course, lesson }, index) => (
        <div
          key={`${course.id}-${lesson?.id ?? index}`}
          role="listitem"
          className={styles.row}
          onClick={() => onSelect(course)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(course); } }}
          tabIndex={0}
        >
          <div className={styles.nameZone}>
            <span className={styles.bullet} aria-hidden="true" />
            <span className={styles.courseName}>{course.name}</span>
          </div>
          <div className={styles.divider}></div>
          <div className={styles.slotZone}>

            <div className={styles.lessonSlot}>
              {lesson ? (
                <>
                  <span className={styles.lessonDay}>{getDayName(lesson.day_of_week)}</span>
                  <span className={styles.lessonTime} dir="ltr">{formatTimeRange(lesson.start_time, lesson.end_time)}</span>
                </>
              ) : (
                <span className={styles.lessonDay}>—</span>
              )}
            </div>

            <button type="button" className={styles.expandBtn} aria-label={`פרטי קורס — ${course.name}`} onClick={(e) => { e.stopPropagation(); onSelect(course); }} tabIndex={-1}>
              <ChevronDown size={16} color="#2B3090" />
            </button>
          </div>


        </div>
      ))}
    </div>
  );
}
