'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getDayName, formatTimeRange } from '@/lib/courseUtils';
import type { Course, CourseLesson, CourseBundle, CourseLessonPriceOption } from '../types';
import {
  buildCatalogRows,
  catalogRowKey,
  enrollmentSelectionKey,
  formatPriceLabel,
  type CatalogRow,
} from '../catalogRows';
import styles from './CourseList.module.css';

interface CourseListProps {
  filteredCourses: Course[];
  selectedAge?: number | null;
  excludedSelectionKeys?: Set<string>;
  compact?: boolean;
  onSelect: (
    course: Course,
    bundle?: CourseBundle,
    lesson?: CourseLesson,
    priceOption?: CourseLessonPriceOption,
  ) => void;
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

function timesPerWeek(row: CatalogRow): number {
  if (row.bundle?.lessons?.length) return row.bundle.lessons.length;
  if (row.lesson) return 1;
  return 0;
}

function CourseRowItem({
  row,
  index,
  onSelect,
}: {
  row: CatalogRow;
  index: number;
  onSelect: CourseListProps['onSelect'];
}) {
  const { course, lesson, bundle, priceOption, displayTitle, displayPrice } = row;
  const schedule = scheduleLines(lesson, bundle);

  return (
    <div
      key={`${course.id}-${bundle?.id ?? lesson?.id ?? index}-${priceOption?.id ?? 'default'}`}
      role="listitem"
      className={styles.row}
      onClick={() => onSelect(course, bundle ?? undefined, lesson ?? undefined, priceOption ?? undefined)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(course, bundle ?? undefined, lesson ?? undefined, priceOption ?? undefined);
        }
      }}
      tabIndex={0}
    >
      <div className={styles.nameZone}>
        <span className={styles.bullet} aria-hidden="true" />
        <span className={styles.courseName}>{displayTitle}</span>
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

        {displayPrice != null ? (
          <span className={styles.price}>{formatPriceLabel(displayPrice)}</span>
        ) : null}

        <button
          type="button"
          className={styles.expandBtn}
          aria-label={`פרטי קורס — ${displayTitle}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(course, bundle ?? undefined, lesson ?? undefined, priceOption ?? undefined);
          }}
          tabIndex={-1}
        >
          <ChevronDown size={16} color="#2B3090" />
        </button>
      </div>
    </div>
  );
}

function rowKey(row: CatalogRow, index: number): string {
  return catalogRowKey(row, index);
}

function TrackSection({
  title,
  subtitle,
  rows,
  onSelect,
}: {
  title: string;
  subtitle: string;
  rows: CatalogRow[];
  onSelect: CourseListProps['onSelect'];
}) {
  return (
    <section className={styles.section} aria-label={title}>
      <div className={styles.trackHeader}>
        <h3 className={styles.trackTitle}>{title}</h3>
        <p className={styles.trackSubtitle}>{subtitle}</p>
      </div>
      <div role="list" className={styles.sectionList}>
        {rows.map((row, index) => (
          <CourseRowItem
            key={rowKey(row, index)}
            row={row}
            index={index}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}

function AccordionTrack({
  title,
  rows,
  onSelect,
}: {
  title: string;
  rows: CatalogRow[];
  onSelect: CourseListProps['onSelect'];
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className={styles.accordionSection} aria-label={title}>
      <button
        type="button"
        className={styles.accordionCard}
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-expanded={open}
      >
        <span className={styles.accordionTitle}>{title}</span>
        <span className={styles.expandBtn} aria-hidden="true">
          <ChevronDown
            size={16}
            color="#2B3090"
            className={`${styles.accordionChevron} ${open ? styles.accordionChevronOpen : ''}`}
          />
        </span>
      </button>
      {open ? (
        <div role="list" className={styles.sectionList}>
          {rows.map((row, index) => (
            <CourseRowItem
              key={rowKey(row, index)}
              row={row}
              index={index}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

const CHOOSE_DAYS_COPY = 'בחרו את הימים והשעות שמתאימים לכם';

const FREQUENCY_GROUPS = [
  { minTimes: 3, title: 'מסלולים לשלוש פעמים בשבוע' },
  { minTimes: 2, maxTimes: 2, title: 'מסלולים לפעמיים בשבוע' },
  { minTimes: 0, maxTimes: 1, title: 'מסלולים לפעם בשבוע' },
] as const;

export function CourseList({
  filteredCourses,
  selectedAge = null,
  excludedSelectionKeys,
  compact = false,
  onSelect,
}: CourseListProps) {
  const rows = buildCatalogRows(filteredCourses, selectedAge).filter((row) => {
    if (!excludedSelectionKeys?.size) return true;
    const key = enrollmentSelectionKey({
      courseId: row.course.id,
      bundleId: row.bundle?.id,
      lessonId: row.lesson?.id,
      priceOptionId: row.priceOption?.id,
    });
    return !excludedSelectionKeys.has(key);
  });
  const groups = FREQUENCY_GROUPS
    .map((group) => ({
      title: group.title,
      rows: rows.filter((row) => {
        const times = timesPerWeek(row);
        const maxTimes = 'maxTimes' in group ? group.maxTimes : Infinity;
        return times >= group.minTimes && times <= maxTimes;
      }),
    }))
    .filter((group) => group.rows.length > 0);

  const primary = groups[0];
  const extras = groups.slice(1);

  if (!primary) return <div className={`${styles.list} ${compact ? styles.listCompact : ''}`} />;

  return (
    <div className={`${styles.list} ${compact ? styles.listCompact : ''}`}>
      <TrackSection
        title={primary.title}
        subtitle={CHOOSE_DAYS_COPY}
        rows={primary.rows}
        onSelect={onSelect}
      />
      {extras.length > 0 ? (
        <div className={styles.extras}>
          <p className={styles.extrasLabel}>אפשרויות נוספות</p>
          {extras.map((group) => (
            <AccordionTrack
              key={group.title}
              title={group.title}
              rows={group.rows}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
