import { getDayName, formatTimeRange } from '@/lib/courseUtils';
import type { Course } from '../types';
import { TableCell } from '@/components/ui/table';
import styles from './CourseExpandedDetail.module.css';

interface CourseExpandedDetailProps {
  course: Course;
  onEnroll: () => void;
}

export default function CourseExpandedDetail({ course, onEnroll }: CourseExpandedDetailProps) {
  return (
    <TableCell colSpan={8} className={styles.expandedCell}>
      <div className={styles.detailGrid}>
        <div className={styles.detailCard}>
          <p className={styles.detailCardHeader}>מדריך</p>
          <div className={styles.detailCardBody}>
            {course.lessons?.length ? (
              Array.from(new Set(course.lessons.map((l) => l.instructor_name).filter(Boolean))).map((name) => (
                <p key={name} className={styles.detailText}>{name}</p>
              ))
            ) : (
              <p className={styles.detailTextMuted}>—</p>
            )}
          </div>
        </div>
        <div className={styles.detailCard}>
          <p className={styles.detailCardHeader}>ימים ושעות</p>
          <div className={styles.detailCardBody}>
            {course.lessons?.length ? (
              course.lessons.map((l, i) => (
                <p key={i} className={styles.detailText}>{getDayName(l.day_of_week)} {formatTimeRange(l.start_time, l.end_time)}</p>
              ))
            ) : (
              <p className={styles.detailTextMuted}>—</p>
            )}
          </div>
        </div>
        <div className={styles.detailCardFlex}>
          <p className={styles.detailCardHeader}>מחיר</p>
          <div className={styles.detailCardBodyFlex}>
            <p className={styles.detailPrice}>{course.price != null ? `₪${course.price} לחודש` : '—'}</p>
            <button onClick={onEnroll} className={styles.enrollButton}>הירשם לחוג</button>
            <button className={styles.trialButton}>הירשם לשיעור ניסיון</button>
          </div>
        </div>
      </div>
    </TableCell>
  );
}
