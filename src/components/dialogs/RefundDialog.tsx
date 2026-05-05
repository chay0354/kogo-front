'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RefundDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (amount: number | null, reason: string) => void;
  title: string;
  maxAmount: number;
  itemDescription?: string;
  loading?: boolean;
}

export default function RefundDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  maxAmount,
  itemDescription,
  loading = false
}: RefundDialogProps) {
  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isPartialRefund, setIsPartialRefund] = useState<boolean>(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // If partial refund, validate amount
    if (isPartialRefund) {
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0 || numAmount > maxAmount) {
        alert(`הסכום חייב להיות בין 0 ל-${maxAmount.toFixed(2)}`);
        return;
      }
      onConfirm(numAmount, reason || 'זיכוי חלקי');
    } else {
      // Full refund
      onConfirm(null, reason || 'זיכוי מלא');
    }
    
    // Reset form
    setAmount('');
    setReason('');
    setIsPartialRefund(false);
  };

  const handleClose = () => {
    if (!loading) {
      setAmount('');
      setReason('');
      setIsPartialRefund(false);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-yellow-600" />
            </div>
            <DialogTitle className="text-lg font-semibold text-gray-900">
              {title}
            </DialogTitle>
          </div>
          {!loading && (
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-500 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          )}
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Item description */}
            {itemDescription && (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <p className="text-sm text-gray-600 font-medium mb-1">פריט</p>
                <p className="text-base text-gray-900">{itemDescription}</p>
                <p className="text-sm text-gray-500 mt-1">
                  סכום מקסימלי: ₪{maxAmount.toFixed(2)}
                </p>
              </div>
            )}

            {/* Refund type selection */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700">סוג זיכוי</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIsPartialRefund(false)}
                  className={`px-4 py-3 rounded-lg border-2 transition-all ${
                    !isPartialRefund
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  זיכוי מלא
                </button>
                <button
                  type="button"
                  onClick={() => setIsPartialRefund(true)}
                  className={`px-4 py-3 rounded-lg border-2 transition-all ${
                    isPartialRefund
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  זיכוי חלקי
                </button>
              </div>
            </div>

            {/* Amount input (only for partial refund) */}
            {isPartialRefund && (
              <div className="space-y-2">
                <label htmlFor="amount" className="block text-sm font-medium text-gray-700">
                  סכום לזיכוי <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    id="amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    step="0.01"
                    min="0"
                    max={maxAmount}
                    required={isPartialRefund}
                    className="block w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0.00"
                    disabled={loading}
                  />
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 text-sm">₪</span>
                  </div>
                </div>
              </div>
            )}

            {/* Reason input */}
            <div className="space-y-2">
              <label htmlFor="reason" className="block text-sm font-medium text-gray-700">
                סיבת הזיכוי
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="block w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="הזן סיבה (אופציונלי)"
                disabled={loading}
              />
            </div>

            {/* Warning message */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>שים לב:</strong> פעולת זיכוי היא בלתי הפיכה. הסכום יוזכה מיידית.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={loading}
                className="flex-1"
              >
                ביטול
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white ml-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    מבצע זיכוי...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-5 w-5 ml-2" />
                    אישור זיכוי
                  </>
                )}
              </Button>
            </div>
          </form>
      </DialogContent>
    </Dialog>
  );
}

