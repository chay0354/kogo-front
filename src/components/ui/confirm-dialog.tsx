'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, HelpCircle, Info, Loader2 } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (choice: boolean) => void | Promise<void>;
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
  const [confirming, setConfirming] = useState(false);

  const icons = {
    warning: <AlertCircle className="h-12 w-12 text-orange-500" />,
    info: <Info className="h-12 w-12 text-blue-500" />,
    question: <HelpCircle className="h-12 w-12 text-teal-500" />
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm(true);
      onClose();
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = () => {
    onConfirm(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md" overlayClassName="z-[60]">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            {icons[type]}
          </div>
          <DialogTitle className="text-xl text-center">{title}<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #37</span></DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <p className="text-center text-gray-700 whitespace-pre-line leading-relaxed">
            {message}
          </p>
        </div>

        <div className="flex gap-3 justify-center pt-4 border-t">
          <Button variant="outline" onClick={handleCancel} className="min-w-[120px]" disabled={confirming}>
            {cancelText}
          </Button>
          <Button onClick={handleConfirm} className="min-w-[120px] flex items-center justify-center gap-2" disabled={confirming}>
            {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

