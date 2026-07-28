import { getDayName, formatTimeRange, formatAgeRange } from '@/lib/courseUtils';
import type { Course, CourseBundle } from '../types';
import { MapPin, Users, CalendarDays, Wallet, X } from 'lucide-react';
import styles from './CourseExpandedDetail.module.css';

interface CourseExpandedDetailProps {
  course: Course;
  bundle?: CourseBundle;
  onEnroll: () => void;
  onClose: () => void;
}

export default function CourseExpandedDetail({ course, bundle, onEnroll, onClose }: CourseExpandedDetailProps) {
  const instructors = Array.from(
    new Set(course.lessons?.map((l) => l.instructor_name).filter(Boolean))
  ) as string[];

  const ageLabel = formatAgeRange(course.min_age, course.max_age) || '—';
  const scheduleLessons = bundle ? bundle.lessons : course.lessons;
  const displayPrice = bundle ? bundle.combined_price : course.price;
  const displayTitle = bundle ? `${course.name} (${bundle.name || 'פעמיים בשבוע'})` : course.name;

  return (
    <div className={styles.card} dir="rtl">
      <button onClick={onClose} className={styles.closeButton} aria-label="סגור">
        <X size={20} />
      </button>

        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>{displayTitle}</h2>
          <p className={styles.subtitle}>{course.course_type_name}</p>
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
        <p className={styles.priceNote}>תשלום חודשי, ניתן לבטל בכל עת</p>

        {/* Buttons */}
        <button onClick={onEnroll} className={styles.enrollButton}>
          הרשמה לחוג
        </button>

      </div>
  );
}
