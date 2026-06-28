'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import api from '@/lib/api';
import type { ChildWithDetails } from '@/types/customer';
import type { PaymentInitiationResponse } from '@/types/payment';

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

function formatHebrewNextBilling(isoDate: string): string {
  const [, month] = isoDate.split('-').map(Number);
  return `1 ב${HEBREW_MONTHS[month - 1]}`;
}

interface Lesson {
  id: string;
  name: string;
  day_of_week: string;
  time: string;
  price: string | null;
}

interface SubscriptionPaymentDialogProps {
  child: ChildWithDetails;
  lesson: Lesson;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SubscriptionPaymentDialog({
  child,
  lesson,
  isOpen,
  onClose,
  onSuccess,
}: SubscriptionPaymentDialogProps) {
  // Pricing summary state
  const [loading, setLoading] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentInitiationResponse | null>(null);
  const [error, setError] = useState('');
  const hasInitiatedRef = useRef(false);
  const requestSeqRef = useRef(0);

  // Card form state
  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardHolderId, setCardHolderId] = useState('');
  const [charging, setCharging] = useState(false);
  const [success, setSuccess] = useState(false);

  // Fetch pricing/discount summary on open (reuse initiate_subscription — same endpoint, same response shape)
  useEffect(() => {
    if (isOpen && lesson?.id && !hasInitiatedRef.current) {
      hasInitiatedRef.current = true;
      fetchPricing();
    }
    if (!isOpen) {
      hasInitiatedRef.current = false;
      setPaymentData(null);
      setError('');
      setSuccess(false);
      setCardNumber('');
      setExpiryMonth('');
      setExpiryYear('');
      setCvv('');
      setCardHolderId('');
    }
  }, [isOpen, lesson]);

  const fetchPricing = async () => {
    const reqId = ++requestSeqRef.current;
    if (!lesson?.id) {
      setError('שגיאה: חסר מזהה שיעור');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/customers/payments/initiate_subscription/', {
        child_id: child.id,
        lesson_id: lesson.id,
        payment_date: new Date().toISOString().split('T')[0],
      });
      if (reqId !== requestSeqRef.current) return;
      setPaymentData(response.data);
    } catch (err: any) {
      if (reqId !== requestSeqRef.current) return;
      const d = err.response?.data;
      setError(d?.lesson || d?.error || d?.detail || 'שגיאה בטעינת פרטי תשלום');
    } finally {
      if (reqId !== requestSeqRef.current) return;
      setLoading(false);
    }
  };

  const handleCharge = async () => {
    if (!cardNumber || !expiryMonth || !expiryYear || !cvv) return;
    setCharging(true);
    setError('');
    try {
      const response = await api.post('/customers/payments/charge_subscription/', {
        child_id: child.id,
        lesson_id: lesson.id,
        card_details: {
          card_number: cardNumber.replace(/\s/g, ''),
          expiry_month: parseInt(expiryMonth),
          expiry_year: parseInt(expiryYear),
          cvv,
          card_holder_id: cardHolderId,
        },
      });
      if (response.data.success) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 2000);
      } else {
        setError(response.data.error || 'התשלום נכשל');
      }
    } catch (err: any) {
      const d = err.response?.data;
      setError(d?.error || d?.detail || 'שגיאה בסליקה');
    } finally {
      setCharging(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">תשלום מנוי חודשי<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #30</span></h2>
            <p className="text-sm text-gray-600 mt-1">
              {child.first_name} {child.last_name} — {lesson.name}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-5" dir="rtl">

          {/* Loading pricing */}
          {loading && (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-3" />
              <p className="text-gray-600 text-sm">טוען פרטי תשלום...</p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-600 shrink-0" />
                <div>
                  <p className="font-medium text-green-800">התשלום בוצע בהצלחה!</p>
                  <p className="text-sm text-green-700 mt-0.5">המנוי הופעל והילד נרשם לשיעור.</p>
                </div>
              </div>
            </div>
          )}

          {paymentData && !loading && !success && (
            <>
              {/* Pricing summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3">סיכום תשלום</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">מחיר לשיעור ה-{paymentData.course_index || 1}:</span>
                    <span className="font-medium">₪{Number(paymentData.base_amount || 0).toFixed(2)}</span>
                  </div>
                  {(paymentData.discounts_applied?.length ?? 0) > 0 && (
                    <div className="border-t border-blue-300 pt-2 space-y-1">
                      {paymentData.discounts_applied!.map((d, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-gray-600">{d.name}</span>
                          <span className="text-green-600">-₪{Number(d.value || 0).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {paymentData.prorate_factor !== undefined && paymentData.prorate_factor < 1 && (
                    <div className="border-t border-blue-300 pt-2 flex justify-between">
                      <span className="text-gray-600">
                        חיוב יחסי ({paymentData.prorate_days_remaining} ימים מתוך {paymentData.days_in_month})
                      </span>
                      <span className="text-amber-600">×{Number(paymentData.prorate_factor).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t border-blue-300 pt-2 flex justify-between font-bold text-base">
                    <span>סה"כ לתשלום:</span>
                    <span className="text-blue-600">₪{Number(paymentData.final_amount || 0).toFixed(2)}</span>
                  </div>
                  {paymentData.next_billing_date && (
                    <div className="flex justify-between text-xs text-gray-500 pt-1">
                      <span>חיוב מלא הבא:</span>
                      <span>{formatHebrewNextBilling(paymentData.next_billing_date)}</span>
                    </div>
                  )}
                </div>
                {paymentData.lesson && (
                  <p className="text-xs text-gray-500 mt-3 border-t border-blue-300 pt-2">
                    {paymentData.lesson.day_of_week} בשעה {paymentData.lesson.time}
                  </p>
                )}
              </div>

              {/* Card entry form */}
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-900">פרטי כרטיס אשראי</h3>
                <div>
                  <label className="text-sm font-medium text-gray-700">מספר כרטיס</label>
                  <Input
                    placeholder="4580 4580 4580 4580"
                    value={cardNumber}
                    onChange={e => setCardNumber(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700">חודש תפוגה</label>
                    <Input placeholder="12" value={expiryMonth} onChange={e => setExpiryMonth(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">שנת תפוגה</label>
                    <Input placeholder="2026" value={expiryYear} onChange={e => setExpiryYear(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">CVV</label>
                    <Input placeholder="123" value={cvv} onChange={e => setCvv(e.target.value)} className="mt-1" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">תעודת זהות בעל הכרטיס</label>
                  <Input placeholder="012345678" value={cardHolderId} onChange={e => setCardHolderId(e.target.value)} className="mt-1" />
                </div>
              </div>

              <Button
                className="w-full"
                onClick={handleCharge}
                disabled={charging || !cardNumber || !expiryMonth || !expiryYear || !cvv}
              >
                {charging ? (
                  <><Loader2 className="h-4 w-4 animate-spin ml-2" />מעבד תשלום...</>
                ) : (
                  `שלם ₪${Number(paymentData.final_amount || 0).toFixed(2)}`
                )}
              </Button>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}
