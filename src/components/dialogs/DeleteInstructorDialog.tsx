'use client';

import { AlertTriangle, X } from 'lucide-react';
import dialogMotion from '@/components/ui/motion.module.css';
import { useDialogExit } from '@/components/ui/motion';

type InstructorLike = {
  id: string;
  full_name: string;
};

interface DeleteInstructorDialogProps {
  instructor: InstructorLike | null;
  isOpen: boolean;
  isDeleting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeleteInstructorDialog({
  instructor,
  isOpen,
  isDeleting = false,
  onClose: dismiss,
  onConfirm,
}: DeleteInstructorDialogProps) {
  const { closing, requestClose: onClose } = useDialogExit(dismiss);
  if (!isOpen || !instructor) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 ${dialogMotion.overlay} ${closing ? dialogMotion.overlayClosing : ''}`}
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-lg shadow-xl w-full max-w-md ${dialogMotion.panel} ${closing ? dialogMotion.panelClosing : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-destructive/10">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <h2 className="text-xl font-bold text-destructive">מחיקת מדריך<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #14</span></h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            disabled={isDeleting}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-foreground mb-3">
            האם אתה בטוח שברצונך למחוק את המדריך <strong>{instructor.full_name}</strong>?
          </p>
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 mb-3">
            <p className="text-sm text-warning">
              ⚠️ השיעורים שהמדריך משויך אליהם לא יימחקו — הם יישארו ללא מדריך.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">פעולה זו אינה ניתנת לביטול.</p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/20">
          <button onClick={onClose} className="btn-secondary" disabled={isDeleting}>
            ביטול
          </button>
          <button
            onClick={() => {
              if (isDeleting) return;
              onConfirm();
            }}
            className="btn bg-destructive text-white hover:bg-destructive/90"
            disabled={isDeleting}
          >
            {isDeleting ? 'מוחק...' : 'מחק מדריך'}
          </button>
        </div>
      </div>
    </div>
  );
}


