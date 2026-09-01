'use client';

import { ChildWithDetails } from '@/types/customer';
import { X, AlertTriangle } from 'lucide-react';
import dialogMotion from '@/components/ui/motion.module.css';
import { useDialogExit } from '@/components/ui/motion';

interface DeleteChildDialogProps {
  child: ChildWithDetails;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeleteChildDialog({ child, isOpen, onClose: dismiss, onConfirm }: DeleteChildDialogProps) {
  const { closing, requestClose: onClose } = useDialogExit(dismiss);
  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 ${dialogMotion.overlay} ${closing ? dialogMotion.overlayClosing : ''}`} onClick={onClose}>
      <div 
        className={`bg-white rounded-lg shadow-xl w-full max-w-md ${dialogMotion.panel} ${closing ? dialogMotion.panelClosing : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-destructive/10">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <h2 className="text-xl font-bold text-destructive">מחיקת פרופיל<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #13</span></h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-foreground mb-4">
            האם אתה בטוח שברצונך למחוק את הפרופיל של <strong>{child.full_name}</strong>?
          </p>
          <p className="text-sm text-muted-foreground mb-2">
            משפחה: {child.family_name}
          </p>
          {child.enrollments.length > 0 && (
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 mb-4">
              <p className="text-sm text-warning">
                ⚠️ לילד יש {child.enrollments.length} רישומים פעילים שימחקו גם כן
              </p>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            פעולה זו אינה ניתנת לביטול.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/20">
          <button onClick={onClose} className="btn-secondary">
            ביטול
          </button>
          <button 
            onClick={() => {
              onConfirm();
              onClose();
            }} 
            className="btn bg-destructive text-white hover:bg-destructive/90"
          >
            מחק פרופיל
          </button>
        </div>
      </div>
    </div>
  );
}

