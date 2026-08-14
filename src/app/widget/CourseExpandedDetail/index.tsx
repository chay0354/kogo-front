import { getDayName, formatTimeRange, formatAgeRange } from '@/lib/courseUtils';
import type { Course, CourseBundle, CourseLesson } from '../types';
import type { WidgetAlternative } from '../alternativeLessons';
import { MapPin, Users, CalendarDays, Wallet, X } from 'lucide-react';
import styles from './CourseExpandedDetail.module.css';

const WIDGET_SUPPORT_PHONE = '0509424755';

function formatTimesPerWeek(count: number): string {
  if (count === 1) return 'פעם בשבוע';
  if (count === 2) return 'פעמיים בשבוע';
  if (count >= 3) return `${count} פעמים בשבוע`;
  return '—';
}

interface CourseExpandedDetailProps {
  course: Course;
  lesson?: CourseLesson;
  bundleOffer?: CourseBundle;
  selectionFull?: boolean;
  alternatives?: WidgetAlternative[];
  onSelectAlternative?: (alt: WidgetAlternative) => void;
  onEnroll: () => void;
  onBundleEnroll?: () => void;
  onTrialEnroll: () => void;
  onClose: () => void;
}

export default function CourseExpandedDetail({
  course,
  lesson,
  bundleOffer,
  selectionFull = false,
  alternatives = [],
  onSelectAlternative,
  onEnroll,
  onBundleEnroll,
  onTrialEnroll,
  onClose,
}: CourseExpandedDetailProps) {
  const instructors = Array.from(
    new Set((lesson ? [lesson] : course.lessons)?.map((l) => l.instructor_name).filter(Boolean))
  ) as string[];

  const ageLabel = formatAgeRange(course.min_age, course.max_age) || '—';
  const scheduleLessons = lesson ? [lesson] : course.lessons;
  const timesPerWeek = bundleOffer
    ? bundleOffer.lessons.length
    : lesson
      ? 1
      : course.lessons_count || course.lessons?.length || 0;
  const timesPerWeekLabel = bundleOffer
    ? (bundleOffer.name || 'פעמיים בשבוע')
    : formatTimesPerWeek(timesPerWeek);
  const displayPrice = lesson?.price ?? course.price;
  const displayTitle = course.name;

  return (
    <div className={styles.card} dir="rtl">
      <div className={styles.topBar}>
        <button onClick={onClose} className={styles.closeButton} aria-label="סגור">
          <X size={20} />
        </button>
      </div>

      <div className={styles.scrollArea}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>{displayTitle}</h2>
          {timesPerWeek > 0 ? (
            <span className={styles.bundleBadge}>{timesPerWeekLabel}</span>
          ) : null}
        </div>

        {/* Course type description */}
        {course.course_type_description && (
          <p className={styles.description}>{course.course_type_description}</p>
        )}

        {/* Info pills */}
        <div className={styles.infoRow}>
          <div className={styles.infoPill}>
            <MapPin size={20} className={styles.infoIcon} />
            <span className={styles.infoLabel}>מיקום</span>
            <span className={styles.infoValue}>{course.branch_name}</span>
          </div>
          <div className={styles.pillDivider} />
          <div className={styles.infoPill}>
            <Users size={20} className={styles.infoIcon} />
            <span className={styles.infoLabel}>גיליאים</span>
            <span className={styles.infoValue}>{ageLabel}</span>
          </div>
          <div className={styles.pillDivider} />
          <div className={styles.infoPill}>
            <CalendarDays size={20} className={styles.infoIcon} />
            <span className={styles.infoLabel}>יום ושעה</span>
            {scheduleLessons?.length ? (
              scheduleLessons.map((l, i) => (
                <span key={i} className={styles.infoValue}>
                  {getDayName(l.day_of_week)}{' '}
                  {formatTimeRange(l.start_time, l.end_time)}
                </span>
              ))
            ) : (
              <span className={styles.infoValue}>—</span>
            )}
          </div>
        </div>

        {/* Instructor */}
        {instructors.length > 0 && (
          <div className={styles.instructorBox}>
            <div className={styles.instructorAvatar}>
              {instructors[0].charAt(0)}
            </div>
            <div className={styles.instructorInfo}>
              <p className={styles.instructorName}>{instructors[0]}</p>
              <p className={styles.instructorTitle}>מדריך {course.course_type_name}</p>
            </div>
          </div>
        )}

        {/* Price */}
        <div className={styles.priceRow}>
          <div className={styles.priceLeft}>
            <Wallet size={22} className={styles.walletIcon} />
          </div>
          <div className={styles.priceRight}>
            <span className={styles.priceAmount}>
              {displayPrice != null ? `₪${displayPrice}` : '—'}
            </span>
            <span className={styles.priceLabel}>לחודש</span>
          </div>
        </div>
        {bundleOffer ? (
          <p className={styles.priceNote}>
            מסלול משולב ({bundleOffer.name || 'פעמיים בשבוע'}): ₪{bundleOffer.combined_price} לחודש
          </p>
        ) : null}
        <p className={styles.priceNote}>מנוי שנתי עד חודש יולי. ניתן לבטל מנוי עד חודש אפריל</p>
        <p className={styles.priceNote}>ברכישת מנוי חיוב ע&quot;ס 120 שקל עבור דמי רישום</p>

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
          <>
            <button onClick={onEnroll} className={styles.enrollButton}>
              הירשם לחוג
            </button>
            {bundleOffer && onBundleEnroll ? (
              <button onClick={onBundleEnroll} className={styles.enrollButton}>
                הרשמה למסלול ({bundleOffer.name || 'פעמיים בשבוע'})
              </button>
            ) : null}
            <button onClick={onTrialEnroll} className={styles.trialButton}>
              {course.trial_lesson_is_paid && course.trial_lesson_price != null
                ? `הרשמה לניסיון (₪${Number(course.trial_lesson_price).toFixed(0)})`
                : 'הרשמה לניסיון'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
