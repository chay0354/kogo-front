'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getDayName, formatTimeRange } from '@/lib/courseUtils';
import type { Course, CourseLesson, CourseBundle, CourseLessonPriceOption } from '../types';
import { isLessonVisibleInCatalog } from '../lessonVisibility';
import styles from './CourseList.module.css';

interface CourseListProps {
  filteredCourses: Course[];
  selectedAge?: number | null;
  onSelect: (
    course: Course,
    bundle?: CourseBundle,
    lesson?: CourseLesson,
    priceOption?: CourseLessonPriceOption,
  ) => void;
}

interface CourseRow {
  course: Course;
  lesson: CourseLesson | null;
  bundle: CourseBundle | null;
  priceOption: CourseLessonPriceOption | null;
  displayTitle: string;
  displayPrice: number | null;
}

const GENERIC_BUNDLE_NAMES = new Set(['', 'מסלול משולב', 'פעמיים בשבוע', 'שלוש פעמים בשבוע']);

function formatListPrice(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatPriceLabel(value: number): string {
  return `₪${Math.round(value)}`;
}

function bundleDisplayTitle(course: Course, bundle: CourseBundle): string {
  const name = (bundle.name || '').trim();
  return name && !GENERIC_BUNDLE_NAMES.has(name) ? name : course.name;
}

function rowSortKey(row: CourseRow): { day: number; time: string; type: string; name: string; price: number } {
  const lesson = row.lesson ?? row.bundle?.lessons[0];
  return {
    day: lesson?.day_of_week ?? 99,
    time: lesson?.start_time ?? '',
    type: row.course.course_type_name || '',
    name: row.displayTitle,
    price: row.displayPrice ?? 0,
  };
}

function selectedAgeMatches(
  minAge: number | null | undefined,
  maxAge: number | null | undefined,
  selectedAge: number | null | undefined,
): boolean {
  if (selectedAge == null || Number.isNaN(selectedAge)) return true;
  return selectedAge >= (minAge ?? 0) && selectedAge <= (maxAge ?? 99);
}

function priceOptionMatchesAge(
  option: CourseLessonPriceOption,
  course: Course,
  selectedAge: number | null | undefined,
): boolean {
  if (option.min_age != null || option.max_age != null) {
    return selectedAgeMatches(option.min_age, option.max_age, selectedAge);
  }
  return selectedAgeMatches(course.min_age, course.max_age, selectedAge);
}

function buildRows(courses: Course[], selectedAge?: number | null): CourseRow[] {
  const rows: CourseRow[] = [];

  for (const course of courses) {
    const bundles = course.bundles ?? [];
    const courseAgeMatches = selectedAgeMatches(course.min_age, course.max_age, selectedAge);

    if (course.lessons && course.lessons.length > 0) {
      for (const lesson of course.lessons) {
        if (!isLessonVisibleInCatalog(lesson)) continue;
        if (courseAgeMatches) {
          rows.push({
            course,
            lesson,
            bundle: null,
            priceOption: null,
            displayTitle: course.name,
            displayPrice: formatListPrice(lesson.price ?? course.price),
          });
        }
        for (const priceOption of lesson.price_options ?? []) {
          if (!priceOptionMatchesAge(priceOption, course, selectedAge)) continue;
          rows.push({
            course,
            lesson,
            bundle: null,
            priceOption,
            displayTitle: priceOption.display_title,
            displayPrice: formatListPrice(priceOption.monthly_price),
          });
        }
      }
    } else if (bundles.length === 0 && courseAgeMatches) {
      rows.push({
        course,
        lesson: null,
        bundle: null,
        priceOption: null,
        displayTitle: course.name,
        displayPrice: formatListPrice(course.price),
      });
    }

    // Each combined-track price is its own catalog row, even when the days/hours match.
    if (courseAgeMatches) {
      for (const bundle of bundles) {
        rows.push({
          course,
          lesson: null,
          bundle,
          priceOption: null,
          displayTitle: bundleDisplayTitle(course, bundle),
          displayPrice: formatListPrice(bundle.combined_price),
        });
      }
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
    const nameCmp = keyA.name.localeCompare(keyB.name, 'he');
    if (nameCmp !== 0) return nameCmp;
    return keyA.price - keyB.price;
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

function rowKey(row: CourseRow, index: number): string {
  return `${row.course.id}-${row.bundle?.id ?? row.lesson?.id ?? index}-${row.priceOption?.id ?? 'default'}`;
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
  rows: CourseRow[];
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

export function CourseList({ filteredCourses, selectedAge = null, onSelect }: CourseListProps) {
  const rows = buildRows(filteredCourses, selectedAge);
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

  if (!primary) return <div className={styles.list} />;

  return (
    <div className={styles.list}>
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
