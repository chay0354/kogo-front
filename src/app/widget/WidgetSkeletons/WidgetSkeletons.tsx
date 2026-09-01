'use client';

import styles from './WidgetSkeletons.module.css';

const COURSE_ROWS = 4;
const LESSON_OPTIONS = 3;
const TERMS_LINES = 9;

function range(count: number) {
  return Array.from({ length: count }, (_, index) => index);
}

/** A select waiting for its options — the field's own silhouette, at its own size. */
export function SkeletonFilterField({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`${styles.field} ${compact ? styles.fieldCompact : ''}`} role="status">
      <span className={styles.srOnly}>טוען אפשרויות...</span>
      <span className={`${styles.block} ${styles.fieldText}`} />
      <span className={`${styles.block} ${styles.blockGold} ${styles.fieldIcon}`} />
    </div>
  );
}

/** The catalogue on its way: a track heading over rows the height of real ones. */
export function SkeletonCourseList({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`${styles.list} ${compact ? styles.listCompact : ''}`} role="status">
      <span className={styles.srOnly}>טוען חוגים...</span>
      <div className={styles.listHeader}>
        <span className={`${styles.block} ${styles.listTitle}`} />
        <span className={`${styles.block} ${styles.listSubtitle}`} />
      </div>
      <div className={styles.rows}>
        {range(COURSE_ROWS).map((index) => (
          <div key={index} className={styles.row}>
            <div className={styles.rowName}>
              <span className={`${styles.block} ${styles.blockGold} ${styles.rowBullet}`} />
              <span className={`${styles.block} ${styles.rowTitle}`} />
            </div>
            <div className={styles.rowDivider} />
            <div className={styles.rowSlot}>
              <div className={styles.rowSchedule}>
                <span className={`${styles.block} ${styles.rowDay}`} />
                <span className={`${styles.block} ${styles.rowTime}`} />
              </div>
              <span className={`${styles.block} ${styles.rowPrice}`} />
              <span className={`${styles.block} ${styles.rowExpand}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The meetings of a chosen course, in the shape of the rows they become. */
export function SkeletonLessonOptions() {
  return (
    <div className={styles.options} role="status">
      <span className={styles.srOnly}>טוען תאריכים זמינים...</span>
      {range(LESSON_OPTIONS).map((index) => (
        <div key={index} className={styles.option}>
          <span className={`${styles.block} ${styles.optionMark}`} />
          <span className={`${styles.block} ${styles.optionLabel}`} />
          <span className={`${styles.block} ${styles.optionTime}`} />
        </div>
      ))}
    </div>
  );
}

/** A document arriving — lines of uneven length, the way the real text sits. */
export function SkeletonTextLines({ label }: { label: string }) {
  return (
    <div className={styles.lines} role="status">
      <span className={styles.srOnly}>{label}</span>
      {range(TERMS_LINES).map((index) => (
        <span key={index} className={`${styles.block} ${styles.line}`} />
      ))}
    </div>
  );
}
