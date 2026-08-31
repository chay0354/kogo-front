'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getDayName,
  formatTimeRange,
  formatAge,
  formatAgeRange,
  isInstructorsCourse,
  INSTRUCTORS_TRACK_TITLE,
  stripWidgetApprovalPhrase,
} from '@/lib/courseUtils';
import type { Course, CourseBundle, CourseLesson, CourseLessonPriceOption } from '../types';
import type { WidgetAlternative } from '../alternativeLessons';
import { MapPin, Users, CalendarDays, X } from 'lucide-react';
import { GroupIdBadge } from '@/components/GroupIdBadge/GroupIdBadge';
import styles from './CourseExpandedDetail.module.css';

const WIDGET_SUPPORT_PHONE = '0509424755';
const AUDITION_NOTICE_BODY = 'ההשתתפות במסלול מותנית באודישן ובאישור מנהלת המחול.';
const INSTRUCTORS_NOTICE_BODY = 'רישום למסלול מדריכים מותנה באישור קוגומלו בלבד!';

function isCompetitiveTroupeTitle(title: string): boolean {
  return title.includes('מסלול להקה תחרותי');
}

function noticeBodyFor(course: Course, title: string): string | null {
  if (isInstructorsCourse(course)) return INSTRUCTORS_NOTICE_BODY;
  if (isCompetitiveTroupeTitle(title) || isCompetitiveTroupeTitle(course.name)) {
    return AUDITION_NOTICE_BODY;
  }
  return null;
}

function formatTimesPerWeek(count: number): string {
  if (count === 1) return 'פעם בשבוע';
  if (count === 2) return 'פעמיים בשבוע';
  if (count >= 3) return `${count} פעמים בשבוע`;
  return '—';
}

function formatShekel(value: number | string | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `₪${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

function formatAgesCompact(minAge?: number | null, maxAge?: number | null): string {
  if (!minAge && !maxAge) return '—';
  const minLabel = minAge ? formatAge(minAge) : '';
  const maxLabel = maxAge ? formatAge(maxAge) : '';
  if (minLabel.startsWith('כיתה ') && maxLabel.startsWith('כיתה ')) {
    if (minAge === maxAge) return minLabel;
    return `כיתות ${minLabel.slice(5)} - ${maxLabel.slice(5)}`;
  }
  return formatAgeRange(minAge, maxAge) || '—';
}

function resolveInstructorName(
  course: Course,
  lesson?: CourseLesson,
  bundleOffer?: CourseBundle,
): string | null {
  const names: string[] = [];
  const add = (value?: string | null) => {
    const name = value?.trim();
    if (name && !names.includes(name)) names.push(name);
  };

  add(lesson?.instructor_name);

  if (bundleOffer?.lessons?.length) {
    const bundleIds = new Set(bundleOffer.lessons.map((l) => l.id));
    for (const slot of bundleOffer.lessons) add(slot.instructor_name);
    for (const courseLesson of course.lessons ?? []) {
      if (bundleIds.has(courseLesson.id)) add(courseLesson.instructor_name);
    }
  }

  if (!names.length) {
    for (const courseLesson of course.lessons ?? []) add(courseLesson.instructor_name);
  }

  return names.length ? names.join(' ו') : null;
}

type ScheduleSlot = Pick<CourseLesson, 'day_of_week' | 'start_time' | 'end_time'>;

function resolveScheduleLessons(
  course: Course,
  lesson?: CourseLesson,
  bundleOffer?: CourseBundle,
): ScheduleSlot[] {
  if (lesson) return [lesson];
  if (bundleOffer?.lessons?.length) return bundleOffer.lessons;
  return course.lessons ?? [];
}

function PriceSwoosh() {
  return (
    <svg className={styles.priceSwoosh} viewBox="0 0 72 10" fill="none" aria-hidden>
      <path d="M2 6c18-6 34-6 68 0" stroke="#F5C518" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

interface CourseExpandedDetailProps {
  course: Course;
  lesson?: CourseLesson;
  bundleOffer?: CourseBundle;
  priceOption?: CourseLessonPriceOption;
  selectionFull?: boolean;
  alternatives?: WidgetAlternative[];
  onSelectAlternative?: (alt: WidgetAlternative) => void;
  onEnroll: () => void;
  onBundleEnroll?: () => void;
  onTrialEnroll: () => void;
  onClose: () => void;
  hideSeptemberStandingOrderNote?: boolean;
}

export default function CourseExpandedDetail({
  course,
  lesson,
  bundleOffer,
  priceOption,
  selectionFull = false,
  alternatives = [],
  onSelectAlternative,
  onEnroll,
  onTrialEnroll,
  onClose,
  hideSeptemberStandingOrderNote = false,
}: CourseExpandedDetailProps) {
  const [pendingAction, setPendingAction] = useState<'enroll' | 'trial' | null>(null);
  const instructorName = resolveInstructorName(course, lesson, bundleOffer);

  const ageLabel = formatAgesCompact(course.min_age, course.max_age);
  const scheduleLessons = resolveScheduleLessons(course, lesson, bundleOffer);
  const timesPerWeek = bundleOffer
    ? bundleOffer.lessons.length
    : lesson
      ? 1
      : course.lessons_count || course.lessons?.length || 0;
  const timesPerWeekLabel = isInstructorsCourse(course)
    ? INSTRUCTORS_TRACK_TITLE
    : formatTimesPerWeek(timesPerWeek);
  const displayPrice = bundleOffer?.combined_price
    ?? (priceOption ? Number(priceOption.monthly_price) : null)
    ?? (lesson?.price != null ? Number(lesson.price) : null)
    ?? course.price;
  const displayTitle = stripWidgetApprovalPhrase(priceOption?.display_title ?? course.name);
  const noticeBody = noticeBodyFor(course, displayTitle);
  const showAuditionNotice = Boolean(noticeBody);

  const closeNotice = () => setPendingAction(null);
  const confirmNotice = () => {
    const action = pendingAction;
    setPendingAction(null);
    if (action === 'trial') onTrialEnroll();
    else if (action === 'enroll') onEnroll();
  };
  const requestEnroll = () => {
    if (showAuditionNotice) setPendingAction('enroll');
    else onEnroll();
  };
  const requestTrial = () => {
    if (showAuditionNotice) setPendingAction('trial');
    else onTrialEnroll();
  };

  useEffect(() => {
    if (!pendingAction) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeNotice();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendingAction]);

  return (
    <div className={styles.card} dir="rtl">
      <button type="button" onClick={onClose} className={styles.closeButton} aria-label="סגור">
        <X size={18} strokeWidth={2.4} />
      </button>

      <div className={styles.scrollArea}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {displayTitle}
            <GroupIdBadge displayId={course.display_id} />
          </h2>
          {timesPerWeek > 0 ? (
            <div className={styles.badgeRow}>
              <span className={styles.badgeLine} />
              <span className={styles.bundleBadge}>{timesPerWeekLabel}</span>
              <span className={styles.badgeLine} />
            </div>
          ) : null}
        </div>

        {course.course_type_description ? (
          <p className={styles.description}>{course.course_type_description}</p>
        ) : null}

        <div className={styles.infoRow}>
          <div className={styles.infoPill}>
            <MapPin size={22} className={styles.infoIcon} />
            <span className={styles.infoLabel}>מיקום</span>
            <span className={styles.infoValue}>{course.branch_name}</span>
          </div>
          <div className={styles.pillDivider} />
          <div className={styles.infoPill}>
            <Users size={22} className={styles.infoIcon} />
            <span className={styles.infoLabel}>גילאים</span>
            <span className={styles.infoValue}>{ageLabel}</span>
          </div>
          <div className={styles.pillDivider} />
          <div className={`${styles.infoPill} ${styles.schedulePill}`}>
            <CalendarDays size={22} className={styles.infoIcon} />
            <span className={styles.infoLabel}>יום ושעה</span>
            {scheduleLessons.length ? (
              scheduleLessons.map((l, i) => {
                const day = getDayName(l.day_of_week);
                const time = formatTimeRange(l.start_time, l.end_time);
                return (
                  <span key={i} className={`${styles.infoValue} ${styles.scheduleValue}`}>
                    {day && time ? `${day} ${time}` : day || time || '—'}
                  </span>
                );
              })
            ) : (
              <span className={`${styles.infoValue} ${styles.scheduleValue}`}>—</span>
            )}
          </div>
        </div>

        <div className={styles.instructorBox}>
          <div className={styles.instructorAvatar} aria-hidden>
            <svg viewBox="0 0 64 64" className={styles.avatarPlaceholder}>
              <rect width="64" height="64" fill="#F5C518" />
              <circle cx="32" cy="24" r="11" fill="#2B3090" opacity="0.35" />
              <path d="M12 58c2-13 11-21 20-21s18 8 20 21" fill="#2B3090" opacity="0.35" />
            </svg>
          </div>
          <div className={styles.instructorDivider} />
          <div className={styles.instructorInfo}>
            <p className={styles.instructorName}>
              {instructorName ? `החוג בהדרכת ${instructorName}` : 'החוג בהדרכת מדריך'}
            </p>
          </div>
        </div>

        <div className={styles.priceCard}>
          <p className={styles.priceLabel}>מחיר לחודש</p>
          <p className={styles.priceAmount}>{formatShekel(displayPrice)}</p>
          <PriceSwoosh />
          <p className={styles.priceTrack}>מסלול שנתי • תשלום חודשי</p>
        </div>
        <p className={styles.priceNote}>מנוי שנתי עד חודש יולי. ניתן לבטל מנוי עד חודש אפריל</p>
        {course.charge_standing_order_immediately ? (
          <p className={styles.priceNoteHighlight}>דמי רישום פעם אחת לכל ילד. הוראת הקבע תחויב מיד</p>
        ) : hideSeptemberStandingOrderNote ? null : (
          <p className={styles.priceNoteHighlight}>דמי רישום פעם אחת לכל ילד. הוראת קבע תתחיל ב-1.9</p>
        )}

        {selectionFull ? (
          <div className={styles.fullSection}>
            <p className={styles.fullTitle}>השיעור שבחרתם מלא</p>
            {alternatives.length > 0 ? (
              <>
                <p className={styles.fullHint}>מועדים פנויים אחרים באותו תחום וגיל:</p>
                <div className={styles.alternativesList}>
                  {alternatives.map((alt) => (
                    <button
                      key={`${alt.course.id}-${alt.lesson?.id ?? alt.bundle?.id}`}
                      type="button"
                      className={styles.alternativeButton}
                      onClick={() => onSelectAlternative?.(alt)}
                    >
                      {alt.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className={styles.fullHelp}>
                צריכים עזרה? דברו איתנו!{' '}
                <a href={`tel:${WIDGET_SUPPORT_PHONE}`} className={styles.fullHelpPhone}>
                  {WIDGET_SUPPORT_PHONE}
                </a>
              </p>
            )}
          </div>
        ) : (
          <div className={styles.actions}>
            <button type="button" onClick={requestEnroll} className={styles.enrollButton}>
              הירשם לחוג
            </button>
            <button type="button" onClick={requestTrial} className={styles.trialButton}>
              {course.trial_lesson_is_paid && course.trial_lesson_price != null
                ? `הרשמה לניסיון (₪${Number(course.trial_lesson_price).toFixed(0)})`
                : 'הרשמה לניסיון'}
            </button>
          </div>
        )}
      </div>

      {pendingAction && typeof document !== 'undefined'
        ? createPortal(
            <div className={styles.noticeRoot} dir="rtl">
              <div className={styles.noticeBackdrop} onClick={closeNotice} />
              <div
                className={styles.noticeCard}
                role="dialog"
                aria-modal="true"
                aria-labelledby="audition-notice-title"
              >
                {timesPerWeekLabel ? (
                  <span className={styles.noticeBadge}>{timesPerWeekLabel}</span>
                ) : null}
                <button
                  type="button"
                  className={styles.noticeClose}
                  onClick={closeNotice}
                  aria-label="סגור"
                >
                  <X size={16} strokeWidth={2.4} />
                </button>
                <div className={styles.noticeIconRow} aria-hidden>
                  <span className={styles.noticeGoldLine} />
                  <span className={styles.noticeInfoIcon}>i</span>
                  <span className={styles.noticeGoldLine} />
                </div>
                <h3 id="audition-notice-title" className={styles.noticeTitle}>
                  חשוב לדעת
                </h3>
                <p className={styles.noticeBody}>{noticeBody}</p>
                <button type="button" className={styles.noticeConfirm} onClick={confirmNotice}>
                  הבנתי
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
