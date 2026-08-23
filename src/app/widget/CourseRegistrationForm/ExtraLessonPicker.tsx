'use client';

import MiniLessonPicker, { type WidgetFilterDefaults } from './MiniLessonPicker';
import styles from './AdditionalChildSection.module.css';

interface ExtraLessonPickerProps {
  defaultFilters: WidgetFilterDefaults;
  excludedSelectionKeys: Set<string>;
  canCancel: boolean;
  onCancel: () => void;
  onSelect: Parameters<typeof MiniLessonPicker>[0]['onSelect'];
}

export default function ExtraLessonPicker({
  defaultFilters,
  excludedSelectionKeys,
  canCancel,
  onCancel,
  onSelect,
}: ExtraLessonPickerProps) {
  return (
    <div className={styles.extraPicker}>
      {canCancel ? (
        <button type="button" className={styles.cancelPickerBtn} onClick={onCancel}>
          ביטול
        </button>
      ) : null}
      <MiniLessonPicker
        defaultFilters={defaultFilters}
        excludedSelectionKeys={excludedSelectionKeys}
        onSelect={onSelect}
      />
    </div>
  );
}
