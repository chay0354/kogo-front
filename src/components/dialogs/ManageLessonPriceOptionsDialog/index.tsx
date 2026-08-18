'use client';

import { X } from 'lucide-react';
import LessonPriceOptionsEditor from '@/components/dialogs/LessonPriceOptionsEditor';
import styles from './index.module.css';

interface ManageLessonPriceOptionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  lessonId: string;
  lessonLabel: string;
  courseName: string;
  defaultPrice: number;
  onSaved: () => void;
}

export default function ManageLessonPriceOptionsDialog({
  isOpen,
  onClose,
  lessonId,
  lessonLabel,
  courseName,
  defaultPrice,
  onSaved,
}: ManageLessonPriceOptionsDialogProps) {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className={styles.header}>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="סגור">
            <X size={20} />
          </button>
        </div>
        <LessonPriceOptionsEditor
          lessonId={lessonId}
          lessonLabel={lessonLabel}
          courseName={courseName}
          defaultPrice={defaultPrice}
          onSaved={onSaved}
        />
      </div>
    </div>
  );
}
