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
  lessons: Lesson[];
  bundleId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SubscriptionPaymentDialog({
  child,
  lessons,
  bundleId,
  isOpen,
  onClose,
  onSuccess,
}: SubscriptionPaymentDialogProps) {
  // Pricing summary state — one entry per lesson (bundle registrations bill each member lesson separately)
  const [loading, setLoading] = useState(false);
  const [paymentDataList, setPaymentDataList] = useState<PaymentInitiationResponse[]>([]);
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
  const [pending, setPending] = useState(false);

  const lessonIds = lessons.map((l) => l.id).join(',');

  // Fetch pricing/discount summary on open (reuse initiate_subscription — same endpoint, same response shape)
  useEffect(() => {
    if (isOpen && lessons.length > 0 && !hasInitiatedRef.current) {
      hasInitiatedRef.current = true;
      fetchPricing();
    }
    if (!isOpen) {
      hasInitiatedRef.current = false;
      setPaymentDataList([]);
      setError('');
      setSuccess(false);
      setPending(false);
      setCardNumber('');
      setExpiryMonth('');
      setExpiryYear('');
      setCvv('');
      setCardHolderId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, lessonIds]);

  const fetchPricing = async () => {
    const reqId = ++requestSeqRef.current;
    if (lessons.length === 0) {
      setError('שגיאה: חסר מזהה שיעור');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const responses = await Promise.all(
        lessons.map((l, index) =>
          api.post('/customers/payments/initiate_subscription/', {
            child_id: child.id,
            lesson_id: l.id,
            bundle_id: bundleId,
            payment_date: new Date().toISOString().split('T')[0],
            include_registration_fee: !bundleId || index === 0,
          })
        )
      );
      if (reqId !== requestSeqRef.current) return;
      setPaymentDataList(responses.map((r) => r.data));
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
    setPending(false);
    const pendingCopy =
      'לא התקבלה תשובה סופית מחברת האשראי. אין לשלם שוב — אנחנו מאמתים את התשלום וניצור איתכם קשר.';
    try {
      const cardDetails = {
        card_number: cardNumber.replace(/\s/g, ''),
        expiry_month: parseInt(expiryMonth),
        expiry_year: parseInt(expiryYear),
        cvv,
        card_holder_id: cardHolderId,
      };
      // Charged one lesson at a time so a decline on the second lesson of a bundle
      // does not follow an already-approved charge on the third.
      let charged = 0;
      for (const [index, l] of lessons.entries()) {
        const { data } = await api.post(
          '/customers/payments/charge_subscription/',
          {
            child_id: child.id,
            lesson_id: l.id,
            bundle_id: bundleId,
            card_details: cardDetails,
            include_registration_fee: !bundleId || index === 0,
          },
          { timeout: 90000 },
        );
        if (data?.success) {
          charged += 1;
          continue;
        }
        if (data?.pending || data?.indeterminate) {
          setPending(true);
          setError(data.error || pendingCopy);
          return;
        }
        setError(
          charged > 0
            ? `${data?.error || 'התשלום נכשל'} — חלק מהשיעורים כבר חויבו, יש להשלים ידנית`
            : data?.error || 'התשלום נכשל'
        );
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (err: any) {
      const d = err.response?.data;
      if (d?.success) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 2000);
        return;
      }
      if (d?.pending || d?.indeterminate) {
        setPending(true);
        setError(d.error || pendingCopy);
        return;
      }
      const timedOut = err.code === 'ECONNABORTED' || /timeout/i.test(err.message || '');
      if (timedOut || !err.response) {
        setPending(true);
        setError(pendingCopy);
        return;
      }
      setError(d?.error || d?.detail || 'שגיאה בסליקה');
    } finally {
      setCharging(false);
    }
  };

  const paymentData = paymentDataList[0] ?? null;
  const totalFinalAmount = paymentDataList.reduce((sum, p) => sum + Number(p.final_amount || 0), 0);
  const totalRegistrationFee = paymentDataList.reduce((sum, p) => sum + Number(p.registration_fee || 0), 0);
  const totalProratedAmount = paymentDataList.reduce((sum, p) => sum + Number(p.prorated_amount || 0), 0);
  const totalMonthlyAmount = paymentDataList.reduce((sum, p) => sum + Number(p.monthly_amount || 0), 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">תשלום מנוי חודשי<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #30</span></h2>
            <p className="text-sm text-gray-600 mt-1">
              {child.first_name} {child.last_name} — {lessons[0]?.name}
              {lessons.length > 1 ? ` (${lessons.map((l) => l.day_of_week).join(' + ')})` : ''}
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

          {/* Error / pending */}
          {error && !loading && (
            <div className={`${pending ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'} border rounded-lg p-4`}>
              <div className="flex items-start gap-2">
                {pending ? (
                  <Loader2 className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                )}
                <div>
                  {pending && (
                    <p className="font-medium text-amber-800 mb-0.5">התשלום בבדיקה</p>
                  )}
                  <p className={`text-sm ${pending ? 'text-amber-700' : 'text-red-700'}`}>{error}</p>
                </div>
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

          {paymentData && !loading && !success && !pending && (
            <>
              {/* Pricing summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3">סיכום תשלום</h3>
                <div className="space-y-2 text-sm">
                  {paymentDataList.length > 1 ? (
                    paymentDataList.map((p, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-gray-600">{p.lesson?.day_of_week ?? lessons[i]?.day_of_week}:</span>
                        <span className="font-medium">₪{Number(p.base_amount || 0).toFixed(2)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-gray-600">מחיר לשיעור ה-{paymentData.course_index || 1}:</span>
                      <span className="font-medium">₪{Number(paymentData.base_amount || 0).toFixed(2)}</span>
                    </div>
                  )}
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
                  {paymentData.prorate_factor !== undefined
                    && paymentData.prorate_factor > 0
                    && paymentData.prorate_factor < 1 && (
                    <div className="border-t border-blue-300 pt-2 flex justify-between">
                      <span className="text-gray-600">
                        חיוב יחסי ({paymentData.prorate_lessons_remaining} שיעורים מתוך {paymentData.total_lessons_this_month})
                      </span>
                      <span className="text-amber-600">×{Number(paymentData.prorate_factor).toFixed(2)}</span>
                    </div>
                  )}
                  {(paymentDataList.length > 1 ? totalProratedAmount : Number(paymentData.prorated_amount || 0)) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">מנוי חודשי (יחסי)</span>
                      <span className="font-medium">
                        ₪{(paymentDataList.length > 1 ? totalProratedAmount : Number(paymentData.prorated_amount || 0)).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {(paymentDataList.length > 1 ? totalRegistrationFee : Number(paymentData.registration_fee || 0)) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">דמי רישום (חד-פעמי)</span>
                      <span className="font-medium">
                        ₪{(paymentDataList.length > 1 ? totalRegistrationFee : Number(paymentData.registration_fee || 0)).toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="border-t border-blue-300 pt-2 flex justify-between font-bold text-base">
                    <span>{paymentData.subscription_start_date ? 'סה"כ לתשלום כעת:' : 'סה"כ לתשלום:'}</span>
                    <span className="text-blue-600">
                      ₪{(paymentDataList.length > 1 ? totalFinalAmount : Number(paymentData.final_amount || 0)).toFixed(2)}
                    </span>
                  </div>
                  {paymentData.subscription_start_date && (
                    <p className="text-xs text-gray-600 pt-1">
                      החודש הנוכחי אינו מחויב. המנוי החודשי בסך ₪{totalMonthlyAmount.toFixed(2)}
                      {' '}יתחיל ב-{formatHebrewNextBilling(paymentData.subscription_start_date)}.
                    </p>
                  )}
                  {paymentData.next_billing_date && !paymentData.subscription_start_date && (
                    <div className="flex justify-between text-xs text-gray-500 pt-1">
                      <span>חיוב מלא הבא:</span>
                      <span>{formatHebrewNextBilling(paymentData.next_billing_date)}</span>
                    </div>
                  )}
                </div>
                {paymentDataList.length <= 1 && paymentData.lesson && (
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
                  `שלם ₪${(paymentDataList.length > 1 ? totalFinalAmount : Number(paymentData.final_amount || 0)).toFixed(2)}`
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
