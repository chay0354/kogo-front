'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getDayName, formatTimeRange } from '@/lib/courseUtils';
import type { Course, CourseLesson, CourseBundle, CourseLessonPriceOption } from '../types';
import { isLessonVisibleInCatalog } from '../lessonVisibility';
import styles from './CourseList.module.css';

interface CourseListProps {
  filteredCourses: Course[];
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

function buildRows(courses: Course[]): CourseRow[] {
  const rows: CourseRow[] = [];

  for (const course of courses) {
    const bundles = course.bundles ?? [];

    if (course.lessons && course.lessons.length > 0) {
      for (const lesson of course.lessons) {
        if (!isLessonVisibleInCatalog(lesson)) continue;
        rows.push({
          course,
          lesson,
          bundle: null,
          priceOption: null,
          displayTitle: course.name,
          displayPrice: formatListPrice(lesson.price ?? course.price),
        });
        for (const priceOption of lesson.price_options ?? []) {
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
    } else if (bundles.length === 0) {
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
            key={`${row.course.id}-${row.bundle?.id ?? row.lesson?.id ?? index}-${row.priceOption?.id ?? 'default'}`}
            row={row}
            index={index}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}

function CollapsibleTrackSection({
  ariaLabel,
  subtitle,
  expandLabel,
  rows,
  onSelect,
  defaultOpen,
}: {
  ariaLabel: string;
  subtitle: string;
  expandLabel: string;
  rows: CourseRow[];
  onSelect: CourseListProps['onSelect'];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (rows.length === 0) return null;

  return (
    <section className={styles.section} aria-label={ariaLabel}>
      <div className={styles.trackHeader}>
        <p className={styles.trackSubtitle}>{subtitle}</p>
        <div className={styles.sectionDivider} />
        <button
          type="button"
          className={styles.onceCta}
          onClick={() => setOpen((isOpen) => !isOpen)}
          aria-expanded={open}
        >
          {open ? 'הסתרת רשימה' : expandLabel}
          <ChevronDown
            size={16}
            className={`${styles.onceCtaChevron} ${open ? styles.onceCtaChevronOpen : ''}`}
          />
        </button>
      </div>
      {open ? (
        <div role="list" className={styles.sectionList}>
          {rows.map((row, index) => (
            <CourseRowItem
              key={`${row.course.id}-${row.bundle?.id ?? row.lesson?.id ?? index}-${row.priceOption?.id ?? 'default'}`}
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

export function CourseList({ filteredCourses, onSelect }: CourseListProps) {
  const rows = buildRows(filteredCourses);
  const threeAWeek = rows.filter((row) => timesPerWeek(row) >= 3);
  const twiceAWeek = rows.filter((row) => timesPerWeek(row) === 2);
  const onceAWeek = rows.filter((row) => timesPerWeek(row) <= 1);

  return (
    <div className={styles.list}>
      <TrackSection
        title="מסלולים לשלוש פעמים בשבוע"
        subtitle={CHOOSE_DAYS_COPY}
        rows={threeAWeek}
        onSelect={onSelect}
      />
      {threeAWeek.length > 0 ? (
        <CollapsibleTrackSection
          ariaLabel="מסלולים לפעמיים בשבוע"
          subtitle="מעדיפים להגיע פעמיים בשבוע?"
          expandLabel="הצגת רשימה מסלולים לפעמיים בשבוע"
          rows={twiceAWeek}
          onSelect={onSelect}
          defaultOpen={false}
        />
      ) : (
        <TrackSection
          title="מסלולים לפעמיים בשבוע"
          subtitle={CHOOSE_DAYS_COPY}
          rows={twiceAWeek}
          onSelect={onSelect}
        />
      )}
      <CollapsibleTrackSection
        ariaLabel="מסלולים לפעם בשבוע"
        subtitle="מעדיפים להגיע פעם בשבוע?"
        expandLabel="הצגת רשימה מסלולים לפעם בשבוע"
        rows={onceAWeek}
        onSelect={onSelect}
        defaultOpen={threeAWeek.length === 0 && twiceAWeek.length === 0}
      />
    </div>
  );
}
