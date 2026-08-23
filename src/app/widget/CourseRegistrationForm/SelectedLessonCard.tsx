'use client';

import { formatPriceLabel, type EnrollmentSelection } from '../catalogRows';
import styles from './AdditionalChildSection.module.css';

interface SelectedLessonCardProps {
  selection: EnrollmentSelection;
  onChange?: () => void;
  onRemove?: () => void;
}

export default function SelectedLessonCard({
  selection,
  onChange,
  onRemove,
}: SelectedLessonCardProps) {
  return (
    <div className={styles.selectedLesson}>
      <div className={styles.selectedLessonText}>
        <span className={styles.selectedLessonTitle}>{selection.displayTitle}</span>
        {selection.displaySchedule ? (
          <span className={styles.selectedLessonSchedule} dir="ltr">
            {selection.displaySchedule}
          </span>
        ) : null}
        {selection.displayPrice != null ? (
          <span className={styles.selectedLessonPrice}>{formatPriceLabel(selection.displayPrice)}</span>
        ) : null}
      </div>
      {onChange || onRemove ? (
        <div className={styles.selectedLessonActions}>
          {onChange ? (
            <button type="button" className={styles.changeLessonBtn} onClick={onChange}>
              שנה
            </button>
          ) : null}
          {onRemove ? (
            <button type="button" className={styles.removeLessonBtn} onClick={onRemove}>
              הסרה
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
