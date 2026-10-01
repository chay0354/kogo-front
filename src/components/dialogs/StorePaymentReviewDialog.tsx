'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export type StorePaymentReviewAction = 'complete' | 'release';

export interface StorePaymentReviewEvidence {
  confirmation_code?: string;
  card_last4?: string;
}

export interface StorePaymentReviewNumberView {
  index: string;
  /** Found in Tranzila's report by sum and time; nothing ties it to this order. */
  suspected: boolean;
}

interface StorePaymentReviewDialogProps {
  isOpen: boolean;
  action: StorePaymentReviewAction;
  itemDescription?: string;
  numbers: StorePaymentReviewNumberView[];
  loading?: boolean;
  onClose: () => void;
  onConfirm: (reason: string, evidence: StorePaymentReviewEvidence) => void;
}

type EvidenceKind = 'approval' | 'card';

/** What the form may send: a reason always; for "complete" on a suspected charge, the customer's evidence too. */
export function reviewFormProblem(
  action: StorePaymentReviewAction,
  reason: string,
  evidenceKind: EvidenceKind,
  evidence: string,
  hasSuspected: boolean,
): string {
  if (reason.trim().length < 3) return 'חובה לכתוב סיבה';
  if (action !== 'complete') return '';
  const digits = evidence.replace(/\D/g, '');
  if (!digits) return hasSuspected ? 'לחיוב חשוד חובה מספר אישור או 4 ספרות מהלקוח' : '';
  if (evidenceKind === 'card' && digits.length !== 4) return 'יש להזין בדיוק 4 ספרות אחרונות של הכרטיס';
  return '';
}

export function reviewEvidence(evidenceKind: EvidenceKind, evidence: string): StorePaymentReviewEvidence {
  const digits = evidence.replace(/\D/g, '');
  if (!digits) return {};
  return evidenceKind === 'card' ? { card_last4: digits } : { confirmation_code: digits };
}

/**
 * A manager settles a store payment in review (CRM payment_followup):
 * "השלם אחרי אימות" goes through only if Tranzila's report confirms the charge
 * with the customer's own evidence; "אין תשלום — שחרר" lets the customer pay
 * again — only after checking in Tranzila that there is no charge.
 */
export default function StorePaymentReviewDialog({
  isOpen,
  action,
  itemDescription,
  numbers,
  loading = false,
  onClose,
  onConfirm,
}: StorePaymentReviewDialogProps) {
  const [reason, setReason] = useState('');
  const [evidenceKind, setEvidenceKind] = useState<EvidenceKind>('approval');
  const [evidence, setEvidence] = useState('');
  const [problem, setProblem] = useState('');
  const hasSuspected = numbers.some((n) => n.suspected);
  const complete = action === 'complete';

  const reset = () => {
    setReason('');
    setEvidence('');
    setEvidenceKind('approval');
    setProblem('');
  };

  const handleClose = () => {
    if (loading) return;
    reset();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = reviewFormProblem(action, reason, evidenceKind, evidence, hasSuspected);
    if (found) {
      setProblem(found);
      return;
    }
    onConfirm(reason.trim(), complete ? reviewEvidence(evidenceKind, evidence) : {});
    reset();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-yellow-600" />
            </div>
            <DialogTitle className="text-lg font-semibold text-gray-900">
              {complete ? 'השלמה אחרי אימות' : 'אין תשלום — שחרור'}
            </DialogTitle>
          </div>
          {!loading && (
            <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-500" aria-label="סגירה">
              <X className="h-6 w-6" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            {itemDescription && <p className="text-base text-gray-900">{itemDescription}</p>}
            <ul className="mt-2 space-y-1 text-sm text-gray-700">
              {numbers.map((n) => (
                <li key={n.index}>
                  עסקה {n.index}
                  {n.suspected && (
                    <span className="mr-2 text-yellow-800 font-medium">חשוד — הדוח לא קושר אותו להזמנה</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {complete ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-700">
                ההזמנה תושלם רק אם הדוח של טרנזילה מאשר את התשלום, מול מה שהלקוח מסר.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setEvidenceKind('approval')}
                  className={`px-3 py-2 rounded-lg border-2 text-sm ${
                    evidenceKind === 'approval' ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-700'
                  }`}
                >
                  מספר אישור
                </button>
                <button
                  type="button"
                  onClick={() => setEvidenceKind('card')}
                  className={`px-3 py-2 rounded-lg border-2 text-sm ${
                    evidenceKind === 'card' ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-700'
                  }`}
                >
                  4 ספרות אחרונות של הכרטיס
                </button>
              </div>
              <label htmlFor="review-evidence" className="block text-sm font-medium text-gray-700">
                מספר אישור או 4 ספרות מהלקוח
                {hasSuspected && <span className="text-red-500"> *</span>}
              </label>
              <input
                id="review-evidence"
                inputMode="numeric"
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                className="block w-full px-4 py-3 border border-gray-300 rounded-lg"
                placeholder={evidenceKind === 'card' ? '1234' : '0001234'}
                disabled={loading}
              />
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>שחרר רק אחרי שבדקתם בטרנזילה שאין חיוב.</strong> ההזמנה תסומן כנכשלה והלקוח יוכל לשלם שוב.
                אם יתברר אחר כך שהחיוב כן עבר, המערכת תרשום אותו ותתריע.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="review-reason" className="block text-sm font-medium text-gray-700">
              סיבה <span className="text-red-500">*</span>
            </label>
            <textarea
              id="review-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="block w-full px-4 py-3 border border-gray-300 rounded-lg resize-none"
              placeholder={complete ? 'מה הלקוח מסר, ומה בדקתם' : 'מה בדקתם בטרנזילה'}
              disabled={loading}
            />
          </div>

          {problem && <p className="text-sm text-red-600" role="alert">{problem}</p>}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading} className="flex-1">
              ביטול
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white">
              {loading ? 'מבצע…' : complete ? 'השלם אחרי אימות' : 'אין תשלום — שחרר'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
