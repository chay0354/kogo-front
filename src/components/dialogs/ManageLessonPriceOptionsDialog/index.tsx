'use client';

import { X } from 'lucide-react';
import LessonPriceOptionsEditor from '@/components/dialogs/LessonPriceOptionsEditor';
import styles from './index.module.css';
import dialogMotion from '@/components/ui/motion.module.css';
import { useDialogExit } from '@/components/ui/motion';

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
  onClose: dismiss,
  lessonId,
  lessonLabel,
  courseName,
  defaultPrice,
  onSaved,
}: ManageLessonPriceOptionsDialogProps) {
  const { closing, requestClose: onClose } = useDialogExit(dismiss);
  if (!isOpen) return null;

  return (
    <div className={`${styles.overlay} ${dialogMotion.overlay} ${closing ? dialogMotion.overlayClosing : ''}`} onClick={onClose}>
      <div className={`${styles.dialog} ${dialogMotion.panel} ${closing ? dialogMotion.panelClosing : ''}`} onClick={(e) => e.stopPropagation()} dir="rtl">
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
