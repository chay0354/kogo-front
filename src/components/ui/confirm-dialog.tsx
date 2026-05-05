'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, HelpCircle, Info } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (choice: boolean) => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'warning' | 'info' | 'question';
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'אישור',
  cancelText = 'ביטול',
  type = 'question'
}: ConfirmDialogProps) {
  const icons = {
    warning: <AlertCircle className="h-12 w-12 text-orange-500" />,
    info: <Info className="h-12 w-12 text-blue-500" />,
    question: <HelpCircle className="h-12 w-12 text-teal-500" />
  };

  const handleConfirm = () => {
    onConfirm(true);
    onClose();
  };

  const handleCancel = () => {
    onConfirm(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            {icons[type]}
          </div>
          <DialogTitle className="text-xl text-center">{title}</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <p className="text-center text-gray-700 whitespace-pre-line leading-relaxed">
            {message}
          </p>
        </div>

        <div className="flex gap-3 justify-center pt-4 border-t">
          <Button variant="outline" onClick={handleCancel} className="min-w-[120px]">
            {cancelText}
          </Button>
          <Button onClick={handleConfirm} className="min-w-[120px]">
            {confirmText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

